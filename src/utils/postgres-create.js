const { AsyncLocalStorage } = require("async_hooks");
const { syncPostgresSequence } = require("./postgres-sequence");
const { getAutoincrementConfig } = require("../config/postgres-autoincrement-models");

const RETRY_LIMIT = 5;
const bypassSafeCreate = new AsyncLocalStorage();

function isBypassingSafeCreate() {
  return bypassSafeCreate.getStore() === true;
}

function runBypassSafeCreate(fn) {
  return bypassSafeCreate.run(true, fn);
}

function isUniqueViolationOnColumn(error, column) {
  if (!error || error.code !== "P2002") {
    return false;
  }
  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.includes(column);
  }
  const targetText = String(target || error.message || "").toLowerCase();
  return targetText.includes(String(column).toLowerCase());
}

async function lockTable(client, table) {
  await client.$executeRawUnsafe(`LOCK TABLE "${table}" IN SHARE ROW EXCLUSIVE MODE`);
}

async function readMaxPrimaryKey(client, table, column) {
  const rows = await client.$queryRawUnsafe(`
    SELECT COALESCE(MAX("${column}"), 0)::int AS max
    FROM "${table}"
  `);
  return Number(rows[0]?.max ?? 0);
}

async function isPrimaryKeyTaken(client, modelName, column, value) {
  const taken = await client[modelName].findFirst({
    where: { [column]: value },
    select: { [column]: true }
  });
  return Boolean(taken);
}

async function findNextFreePrimaryKey(client, modelName, config, startFrom = null) {
  const { table, column } = config;
  let candidate;

  if (startFrom != null) {
    candidate = Number(startFrom) + 1;
  } else {
    candidate = (await readMaxPrimaryKey(client, table, column)) + 1;
  }

  while (await isPrimaryKeyTaken(client, modelName, column, candidate)) {
    candidate += 1;
  }

  return candidate;
}

/**
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} client
 * @param {string} modelName
 * @param {{ table: string, column: string }} config
 * @param {number|null} startFrom
 */
async function allocateNextPrimaryKey(client, modelName, config, startFrom = null) {
  await lockTable(client, config.table);
  const primaryKey = await findNextFreePrimaryKey(client, modelName, config, startFrom);

  try {
    await syncPostgresSequence(client, config.table, config.column);
  } catch {
    // Sequence may be missing or misnamed; explicit PK still works.
  }

  return primaryKey;
}

/**
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} client
 * @param {string} modelName
 * @param {object} args Prisma create args ({ data, select, include, ... })
 */
async function createWithExplicitPrimaryKey(client, modelName, args) {
  const config = getAutoincrementConfig(modelName);
  if (!config || isBypassingSafeCreate()) {
    return client[modelName].create(args);
  }

  const { column } = config;
  const data = args?.data;
  if (!data || data[column] != null) {
    return client[modelName].create(args);
  }

  let lastError;
  let lastAttempted = null;

  for (let attempt = 0; attempt < RETRY_LIMIT; attempt += 1) {
    const primaryKey = await allocateNextPrimaryKey(client, modelName, config, lastAttempted);
    lastAttempted = primaryKey;
    const { [column]: _ignored, ...rest } = data;

    try {
      return await runBypassSafeCreate(() =>
        client[modelName].create({
          ...args,
          data: {
            ...rest,
            [column]: primaryKey
          }
        })
      );
    } catch (error) {
      if (!isUniqueViolationOnColumn(error, column)) {
        throw error;
      }
      lastError = error;
    }
  }

  throw lastError || new Error(`Unable to allocate a unique ${modelName}.${column}`);
}

/**
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} client
 * @param {string} modelName
 * @param {object} args Prisma createMany args
 */
async function createManyWithExplicitPrimaryKeys(client, modelName, args) {
  const config = getAutoincrementConfig(modelName);
  if (!config || isBypassingSafeCreate()) {
    return client[modelName].createMany(args);
  }

  const { table, column } = config;
  const items = Array.isArray(args?.data) ? args.data : [];
  if (!items.length) {
    return client[modelName].createMany(args);
  }

  if (items.some((item) => item?.[column] != null)) {
    return client[modelName].createMany(args);
  }

  await lockTable(client, table);
  let candidate = (await readMaxPrimaryKey(client, table, column)) + 1;
  const data = [];

  for (const item of items) {
    while (await isPrimaryKeyTaken(client, modelName, column, candidate)) {
      candidate += 1;
    }
    const { [column]: _ignored, ...rest } = item;
    data.push({ ...rest, [column]: candidate });
    candidate += 1;
  }

  try {
    await syncPostgresSequence(client, table, column);
  } catch {
    // Explicit PKs still work when sequence sync fails.
  }

  return runBypassSafeCreate(() =>
    client[modelName].createMany({
      ...args,
      data
    })
  );
}

module.exports = {
  isBypassingSafeCreate,
  runBypassSafeCreate,
  isUniqueViolationOnColumn,
  allocateNextPrimaryKey,
  createWithExplicitPrimaryKey,
  createManyWithExplicitPrimaryKeys
};
