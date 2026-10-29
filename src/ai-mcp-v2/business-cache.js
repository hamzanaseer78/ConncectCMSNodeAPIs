const { TABLES } = require("./schema-catalog");
const { CATALOG } = require("./prisma-relations");
const { serializeRows } = require("./execute-select");
const { createCacheStore } = require("./cache-store");
const { userTypeLabel } = require("./entity-match");

const inflight = new Map();
const defaultStore = createCacheStore();

const TRANSACTIONAL = new Set(["job", "jobexpenses", "jobcollections", "userattendancesession"]);
const DATE_COLUMN = {
  job: "date",
  jobexpenses: "createdat",
  jobcollections: "collectedat",
  userattendancesession: "checkinat"
};

function cacheKey(scope) {
  const assignee = scope.manageBranch ? "branch" : `user:${scope.userid}`;
  return `ai-mcp-v2:cache:v1:${scope.tenantid}:${scope.branchid}:${assignee}`;
}

function cacheOptions(config = {}, deps = {}) {
  return {
    ttlMs: Number(deps.cacheTtlMs || config.cacheTtlMs || 5 * 60 * 1000),
    batchSize: Number(deps.cacheBatchSize || config.cacheBatchSize || 500),
    maxRows: Number(deps.cacheMaxRowsPerTable || config.cacheMaxRowsPerTable || 2000),
    lookbackDays: Number(deps.cacheLookbackDays || config.cacheLookbackDays || 120),
    queryTimeoutMs: Number(deps.queryTimeoutMs || config.queryTimeoutMs || 8000)
  };
}

function assertSnapshotScope(snapshot, scope) {
  if (!snapshot?.scope) return false;
  if (Number(snapshot.scope.tenantid) !== Number(scope.tenantid)) return false;
  if (Number(snapshot.scope.branchid) !== Number(scope.branchid)) return false;
  if (Boolean(snapshot.scope.manageBranch) !== Boolean(scope.manageBranch)) return false;
  if (!scope.manageBranch && Number(snapshot.scope.userid) !== Number(scope.userid)) return false;
  return true;
}

async function querySql(db, sql, timeoutMs) {
  if (!db || (typeof db.$queryRawUnsafe !== "function" && typeof db.$queryRaw !== "function")) {
    throw new Error("query_failed");
  }
  const run = () => (typeof db.$queryRawUnsafe === "function"
    ? db.$queryRawUnsafe(sql)
    : db.$queryRaw(sql));
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("query_timeout")), timeoutMs);
  });
  try {
    return await Promise.race([run(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function lookbackTimestamp(days, now) {
  const start = new Date(now.getTime() - Number(days) * 24 * 60 * 60 * 1000);
  return start.toISOString().slice(0, 19).replace("T", " ");
}

function pageSql(table, scope, offset, limit, since) {
  const inner = table.sql(scope);
  const dateCol = DATE_COLUMN[table.name];
  const filter = dateCol && since
    ? ` WHERE (src."${dateCol}" IS NULL OR src."${dateCol}" >= TIMESTAMP '${since}')`
    : "";
  return `SELECT * FROM (${inner}) AS src${filter} OFFSET ${offset} LIMIT ${limit}`;
}

async function loadTable(db, table, scope, options, now) {
  const since = TRANSACTIONAL.has(table.name)
    ? lookbackTimestamp(options.lookbackDays, now)
    : null;
  const rows = [];
  let offset = 0;
  let truncated = false;
  while (rows.length < options.maxRows) {
    const take = Math.min(options.batchSize, options.maxRows - rows.length);
    const batch = serializeRows(
      await querySql(db, pageSql(table, scope, offset, take, since), options.queryTimeoutMs),
      take
    );
    rows.push(...batch);
    if (batch.length < take) break;
    offset += take;
    if (offset >= options.maxRows) {
      truncated = true;
      break;
    }
  }
  return { rows, truncated, lookback: Boolean(since) };
}

function buildEntities(tables) {
  const entities = [];
  (tables.customers?.rows || []).forEach((row) => {
    if (!row.name) return;
    entities.push({
      entityType: "customer",
      entityId: Number(row.customerid),
      displayName: String(row.name),
      tenantid: row.tenantid,
      branchid: row.branchid
    });
  });
  (tables.users?.rows || []).forEach((row) => {
    if (!row.name) return;
    entities.push({
      entityType: userTypeLabel(row.usertype),
      entityId: Number(row.userid),
      displayName: String(row.name),
      tenantid: row.tenantid,
      branchid: row.branchid
    });
  });
  (tables.jobstatuses?.rows || []).forEach((row) => {
    if (!row.title) return;
    entities.push({
      entityType: "status",
      entityId: Number(row.recno),
      displayName: String(row.title),
      tenantid: row.tenantid,
      branchid: null
    });
  });
  (tables.branches?.rows || []).forEach((row) => {
    if (!row.name) return;
    entities.push({
      entityType: "branch",
      entityId: Number(row.branchid),
      displayName: String(row.name),
      tenantid: row.tenantid,
      branchid: row.branchid
    });
  });
  return entities;
}

function schemaMeta() {
  return {
    tables: TABLES.map((table) => ({ name: table.name, columns: table.columns })),
    relations: (CATALOG.relations || []).map((relation) => ({
      sourceTable: relation.sourceTable,
      sourceColumns: relation.sourceColumns,
      targetTable: relation.targetTable,
      targetColumns: relation.targetColumns
    }))
  };
}

async function loadSnapshot(db, scope, options, now) {
  const tables = {};
  const truncatedTables = [];
  const failedTables = [];
  for (const table of TABLES) {
    try {
      const loaded = await loadTable(db, table, scope, options, now);
      tables[table.name] = loaded;
      if (loaded.truncated) truncatedTables.push(table.name);
    } catch {
      failedTables.push(table.name);
      tables[table.name] = { rows: [], truncated: false, failed: true };
    }
  }
  const complete = failedTables.length === 0;
  return {
    version: 1,
    scope: {
      tenantid: scope.tenantid,
      branchid: scope.branchid,
      userid: scope.userid,
      manageBranch: Boolean(scope.manageBranch)
    },
    loadedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + options.ttlMs).toISOString(),
    complete,
    truncatedTables,
    failedTables,
    tables,
    schema: schemaMeta(),
    entities: buildEntities(tables)
  };
}

function isFresh(snapshot, now = new Date()) {
  if (!snapshot?.loadedAt) return false;
  if (snapshot.failedTables?.length) return false;
  if (!snapshot.expiresAt) return true;
  return new Date(snapshot.expiresAt).getTime() > now.getTime();
}

async function getSnapshot(store, scope) {
  const snapshot = await store.get(cacheKey(scope));
  if (!assertSnapshotScope(snapshot, scope)) return null;
  return snapshot;
}

async function ensureBusinessCache({ db, scope, config, deps = {}, force = false, now = new Date() }) {
  if (deps.disableCache) return null;
  const store = deps.cacheStore || defaultStore;
  const options = cacheOptions(config, deps);
  const existing = force ? null : await getSnapshot(store, scope);
  if (existing && isFresh(existing, now) && existing.complete) return existing;

  const key = cacheKey(scope);
  if (inflight.has(key)) return inflight.get(key);

  const pending = (async () => {
    const snapshot = await loadSnapshot(db, scope, options, now);
    await store.set(key, snapshot, options.ttlMs);
    return snapshot;
  })().finally(() => inflight.delete(key));

  inflight.set(key, pending);
  return pending;
}

async function refreshBusinessCache(args) {
  return ensureBusinessCache({ ...args, force: true });
}

async function invalidateTenant(tenantid, branchid = null, store = defaultStore) {
  const prefix = branchid
    ? `ai-mcp-v2:cache:v1:${tenantid}:${branchid}:`
    : `ai-mcp-v2:cache:v1:${tenantid}:`;
  const keys = await store.keys(prefix);
  await Promise.all(keys.map((key) => store.del(key)));
  return keys.length;
}

function invalidateFromWrite(model, args, store = defaultStore) {
  const name = String(model || "").toLowerCase();
  if (!TABLES.some((table) => table.name === name)) return Promise.resolve(0);
  const tenantid = Number(args?.data?.tenantid || args?.where?.tenantid);
  if (!Number.isInteger(tenantid) || tenantid <= 0) return Promise.resolve(0);
  const branchid = Number(args?.data?.branchid || args?.where?.branchid);
  return invalidateTenant(tenantid, Number.isInteger(branchid) && branchid > 0 ? branchid : null, store);
}

function resetCacheForTests() {
  inflight.clear();
  if (typeof defaultStore.clear === "function") return defaultStore.clear();
  return Promise.resolve();
}

module.exports = {
  cacheKey,
  ensureBusinessCache,
  refreshBusinessCache,
  invalidateTenant,
  invalidateFromWrite,
  assertSnapshotScope,
  isFresh,
  resetCacheForTests,
  defaultStore
};
