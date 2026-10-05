const prisma = require("../database/prisma");
const { utcNow } = require("../utils/date");
const { isJobAdmin } = require("../utils/job-access");
const { encryptAiKey, decryptAiKey } = require("../utils/ai-key-cipher");
const {
  AI_PROVIDERS,
  FREE_QUESTION_LIMIT,
  normalizeAiProvider,
  platformGeminiAvailable,
  resolveChatAccess
} = require("../utils/organization-ai-access");
const { completeOrganizationChat } = require("./organization-ai-providers");

function httpError(message, status) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

async function ensureAdmin(auth) {
  if (!(await isJobAdmin(auth))) {
    httpError("Only an organization admin can save the AI provider key", 403);
  }
}

async function loadSettings(tenantid) {
  const rows = await prisma.$queryRaw`
    SELECT recno, tenantid, provider, apikeycipher, questionsused
    FROM organizationaisettings
    WHERE tenantid = ${Number(tenantid)}
    LIMIT 1
  `;
  return rows[0] || null;
}

function publicSettings(row) {
  const questionsUsed = Number(row?.questionsused || 0);
  const hasOrganizationKey = Boolean(row?.provider && row?.apikeycipher);
  const access = resolveChatAccess({ questionsUsed, hasOrganizationKey });
  return {
    questionLimit: FREE_QUESTION_LIMIT,
    questionsUsed,
    questionsRemaining: hasOrganizationKey ? null : access.questionsRemaining,
    provider: row?.provider || null,
    keyConfigured: hasOrganizationKey,
    usingOrganizationKey: hasOrganizationKey,
    platformAvailable: platformGeminiAvailable(),
    requiresAiSetup: !access.allowed,
    providers: AI_PROVIDERS
  };
}

async function getSetup(auth) {
  const row = await loadSettings(auth.tenantid);
  return publicSettings(row);
}

async function saveSetup(auth, body = {}) {
  await ensureAdmin(auth);
  const provider = normalizeAiProvider(body.provider);
  const apiKey = String(body.apiKey || body.apikey || body.key || "").trim();
  if (!provider) {
    httpError("provider must be openai, gemini, or claude", 400);
  }
  if (!apiKey) {
    httpError("apiKey is required", 400);
  }

  const now = utcNow();
  const tenantid = Number(auth.tenantid);
  const data = {
    provider,
    apikeycipher: encryptAiKey(apiKey),
    lastupdatedby: Number(auth.userid),
    lastupdatedat: now
  };

  const existing = await loadSettings(tenantid);
  if (existing) {
    await prisma.$executeRaw`
      UPDATE organizationaisettings
      SET provider = ${data.provider},
          apikeycipher = ${data.apikeycipher},
          lastupdatedby = ${data.lastupdatedby},
          lastupdatedat = ${data.lastupdatedat}
      WHERE recno = ${existing.recno}
    `;
  } else {
    await prisma.$executeRaw`
      INSERT INTO organizationaisettings (
        tenantid, provider, apikeycipher, questionsused, createdby, createdat, lastupdatedby, lastupdatedat
      ) VALUES (
        ${tenantid},
        ${data.provider},
        ${data.apikeycipher},
        0,
        ${Number(auth.userid)},
        ${now},
        ${data.lastupdatedby},
        ${data.lastupdatedat}
      )
    `;
  }

  return getSetup(auth);
}

async function ask(auth, body = {}) {
  const message = String(body.message || body.question || "").trim();
  if (!message) {
    httpError("message is required", 400);
  }

  const row = await loadSettings(auth.tenantid);
  const hasOrganizationKey = Boolean(row?.provider && row?.apikeycipher);
  const access = resolveChatAccess({
    questionsUsed: row?.questionsused || 0,
    hasOrganizationKey
  });

  if (!access.allowed) {
    const err = new Error(
      access.platformUnavailable
        ? "Platform AI is not configured. Save an organization provider key."
        : "Free questions are used. Save a provider and API key to continue."
    );
    err.status = 402;
    err.details = {
      requiresAiSetup: true,
      ...publicSettings(row)
    };
    throw err;
  }

  const provider = access.useOrganizationKey ? row.provider : "gemini";
  const apiKey = access.useOrganizationKey
    ? decryptAiKey(row.apikeycipher)
    : String(process.env.GEMINI_API_KEY).trim();

  const answer = await completeOrganizationChat({
    provider,
    apiKey,
    message,
    history: body.history,
    auth
  });

  const now = utcNow();
  const questionsUsed = (Number(row?.questionsused) || 0) + 1;
  if (row) {
    await prisma.$executeRaw`
      UPDATE organizationaisettings
      SET questionsused = ${questionsUsed},
          lastupdatedby = ${Number(auth.userid)},
          lastupdatedat = ${now}
      WHERE recno = ${row.recno}
    `;
  } else {
    await prisma.$executeRaw`
      INSERT INTO organizationaisettings (
        tenantid, questionsused, createdby, createdat, lastupdatedby, lastupdatedat
      ) VALUES (
        ${Number(auth.tenantid)},
        ${questionsUsed},
        ${Number(auth.userid)},
        ${now},
        ${Number(auth.userid)},
        ${now}
      )
    `;
  }

  const nextAccess = resolveChatAccess({
    questionsUsed,
    hasOrganizationKey
  });

  return {
    answer,
    provider,
    usedOrganizationKey: access.useOrganizationKey,
    questionLimit: FREE_QUESTION_LIMIT,
    questionsUsed,
    questionsRemaining: hasOrganizationKey ? null : nextAccess.questionsRemaining,
    requiresAiSetup: !nextAccess.allowed
  };
}

module.exports = {
  getSetup,
  saveSetup,
  ask
};
