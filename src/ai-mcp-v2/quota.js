const { AiMcpError } = require("./errors");
const { FREE_QUESTION_LIMIT } = require("../utils/organization-ai-access");

const WINDOW_MS = 24 * 60 * 60 * 1000;

async function ensureUsageTable(db) {
  if (!db?.$executeRaw) return;
  await db.$executeRaw`
    CREATE TABLE IF NOT EXISTS organizationaiusage (
      recno SERIAL PRIMARY KEY,
      tenantid INTEGER NOT NULL,
      userid INTEGER NOT NULL,
      askedat TIMESTAMP(6) NOT NULL
    )
  `;
  await db.$executeRaw`
    CREATE INDEX IF NOT EXISTS idx_organizationaiusage_tenant_askedat
    ON organizationaiusage (tenantid, askedat)
  `;
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

async function beginQuota(db, auth, hasOrganizationKey, now = new Date()) {
  if (hasOrganizationKey || !db?.$executeRaw) {
    return { holdId: null, remaining: null, used: 0 };
  }
  const tenantid = Number(auth.tenantid);
  const userid = Number(auth.userid);
  await ensureUsageTable(db);
  if (typeof db.$transaction !== "function") {
    const used = await countSuccessfulQuestions(db, tenantid, now);
    if (used >= FREE_QUESTION_LIMIT) throw quotaError(used);
    return { holdId: null, remaining: FREE_QUESTION_LIMIT - used, used };
  }
  return db.$transaction(async (tx) => {
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
}

async function releaseQuota(db, holdId) {
  if (!holdId || !db?.$executeRaw) return;
  await db.$executeRaw`DELETE FROM organizationaiusage WHERE recno = ${Number(holdId)}`;
}

module.exports = {
  WINDOW_MS,
  ensureUsageTable,
  countSuccessfulQuestions,
  beginQuota,
  releaseQuota
};
