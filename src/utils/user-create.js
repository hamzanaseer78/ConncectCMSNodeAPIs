const { syncPostgresSequence } = require("./postgres-sequence");

const USER_ID_RETRY_LIMIT = 5;

function isUserIdUniqueViolation(error) {
  if (!error || error.code !== "P2002") {
    return false;
  }
  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.includes("userid");
  }
  const targetText = String(target || error.message || "").toLowerCase();
  return targetText.includes("userid");
}

/**
 * Allocate the next free users.userid under row lock (safe when the PG sequence lags).
 */
async function allocateNextUserId(tx, startFrom = null) {
  await tx.$executeRawUnsafe('LOCK TABLE "users" IN SHARE ROW EXCLUSIVE MODE');

  let candidate;
  if (startFrom != null) {
    candidate = Number(startFrom) + 1;
  } else {
    const rows = await tx.$queryRawUnsafe(`
      SELECT COALESCE(MAX("userid"), 0)::int AS max
      FROM "users"
    `);
    candidate = Number(rows[0]?.max ?? 0) + 1;
  }

  while (true) {
    const taken = await tx.users.findFirst({
      where: { userid: candidate },
      select: { userid: true }
    });
    if (!taken) {
      break;
    }
    candidate += 1;
  }

  try {
    await syncPostgresSequence(tx, "users", "userid");
  } catch {
    // Sequence may be missing or misnamed; explicit userid still works.
  }

  return candidate;
}

/**
 * Create a user row with an explicit userid when the serial sequence is out of sync.
 *
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 * @param {object} data
 */
async function createUserInTransaction(tx, data) {
  let lastError;
  let lastAttemptedUserid = null;

  for (let attempt = 0; attempt < USER_ID_RETRY_LIMIT; attempt += 1) {
    const userid = await allocateNextUserId(tx, lastAttemptedUserid);
    lastAttemptedUserid = userid;

    try {
      const { userid: _ignoredUserid, ...rest } = data;
      return await tx.users.create({
        data: {
          ...rest,
          userid
        }
      });
    } catch (error) {
      if (!isUserIdUniqueViolation(error)) {
        throw error;
      }
      lastError = error;
    }
  }

  throw lastError || new Error("Unable to allocate a unique userid for new user");
}

module.exports = {
  allocateNextUserId,
  createUserInTransaction,
  isUserIdUniqueViolation
};
