const { AiMcpError } = require("./errors");
const { FREE_QUESTION_LIMIT } = require("../utils/organization-ai-access");
const logger = require("../utils/logger");

const WINDOW_MS = 24 * 60 * 60 * 1000;

const CREATE_USAGE_TABLE = `
CREATE TABLE IF NOT EXISTS organizationaiusage (
  recno SERIAL PRIMARY KEY,
  tenantid INTEGER NOT NULL,
  userid INTEGER NOT NULL,
  askedat TIMESTAMP(6) NOT NULL
)`;

const CREATE_USAGE_INDEX = `
CREATE INDEX IF NOT EXISTS idx_organizationaiusage_tenant_askedat
ON organizationaiusage (tenantid, askedat)`;

function prismaMessage(err) {
  return String(err?.meta?.message || err?.message || "");
}

function isMissingUsageTable(err) {
  const message = prismaMessage(err);
  return /organizationaiusage/i.test(message) && /does not exist/i.test(message)
    || /42P01/.test(String(err?.meta?.code || err?.code || "")) && /organizationaiusage/i.test(message);
}

async function runDdl(db, sql) {
  if (typeof db.$executeRawUnsafe === "function") {
    await db.$executeRawUnsafe(sql);
    return;
  }
  if (typeof db.$executeRaw === "function") {
    await db.$executeRaw(sql);
  }
}

async function ensureUsageTable(db) {
  if (!db?.$executeRaw && !db?.$executeRawUnsafe) return false;
  try {
    await runDdl(db, CREATE_USAGE_TABLE);
    await runDdl(db, CREATE_USAGE_INDEX);
    return true;
  } catch (err) {
    logger.error("ai-mcp-v2.usage_table_failed", {
      code: err.code || "usage_table_failed"
    });
    return false;
  }
}

async function countSuccessfulQuestions(db, tenantid, now) {
  const from = new Date(now.getTime() - WINDOW_MS);
  const rows = await db.$queryRaw`
    SELECT COUNT(*)::int AS count
    FROM organizationaiusage
    WHERE tenantid = ${tenantid}
      AND askedat >= ${from}
  `;
  return Number(rows?.[0]?.count || 0);
}

function quotaError(used, extra = {}) {
  return new AiMcpError(
    "Free questions are used. Save a provider and API key in AI Setup to continue.",
    402,
    "quota_exceeded",
    {
      requiresAiSetup: true,
      questionLimit: FREE_QUESTION_LIMIT,
      questionsUsed: used,
      questionsRemaining: 0,
      setupPath: "/intelligence",
      ...extra
    }
  );
}

function mapQuotaInfrastructureError(err) {
  if (err instanceof AiMcpError) return err;
  logger.error("ai-mcp-v2.quota_failed", { code: err.code || "quota_failed" });
  return new AiMcpError(
    "The request could not be completed.",
    500,
    "query_failed"
  );
}

async function beginQuota(db, auth, hasOrganizationKey, now = new Date()) {
  if (hasOrganizationKey || (!db?.$executeRaw && !db?.$executeRawUnsafe)) {
    return { holdId: null, remaining: null, used: 0 };
  }
  const tenantid = Number(auth.tenantid);
  const userid = Number(auth.userid);
  const ready = await ensureUsageTable(db);
  if (!ready) {
    return { holdId: null, remaining: null, used: 0 };
  }
  try {
    if (typeof db.$transaction !== "function") {
      const used = await countSuccessfulQuestions(db, tenantid, now);
      if (used >= FREE_QUESTION_LIMIT) throw quotaError(used);
      return { holdId: null, remaining: FREE_QUESTION_LIMIT - used, used };
    }
    return await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(${tenantid})`;
      const used = await countSuccessfulQuestions(tx, tenantid, now);
      if (used >= FREE_QUESTION_LIMIT) throw quotaError(used);
      const inserted = await tx.$queryRaw`
        INSERT INTO organizationaiusage (tenantid, userid, askedat)
        VALUES (${tenantid}, ${userid}, ${now})
        RETURNING recno
      `;
      return {
        holdId: inserted?.[0]?.recno || null,
        remaining: FREE_QUESTION_LIMIT - used - 1,
        used: used + 1
      };
    });
  } catch (err) {
    if (err instanceof AiMcpError) throw err;
    if (isMissingUsageTable(err) || err.code === "P2010") {
      await ensureUsageTable(db);
      return { holdId: null, remaining: null, used: 0 };
    }
    throw mapQuotaInfrastructureError(err);
  }
}

async function releaseQuota(db, holdId) {
  if (!holdId || (!db?.$executeRaw && !db?.$executeRawUnsafe)) return;
  try {
    await db.$executeRaw`DELETE FROM organizationaiusage WHERE recno = ${Number(holdId)}`;
  } catch (err) {
    logger.error("ai-mcp-v2.quota_release_failed", { code: err.code || "quota_release_failed" });
  }
}

module.exports = {
  WINDOW_MS,
  ensureUsageTable,
  countSuccessfulQuestions,
  beginQuota,
  releaseQuota
};
