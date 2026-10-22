const prisma = require("../database/prisma");
const { utcNow } = require("../utils/date");
const { isJobAdmin } = require("../utils/job-access");
const { encryptAiKey } = require("../utils/ai-key-cipher");
const {
  AI_PROVIDERS,
  FREE_QUESTION_LIMIT,
  normalizeAiProvider,
  platformGeminiAvailable,
  resolveChatAccess
} = require("../utils/organization-ai-access");
const { loadConfig } = require("../ai-mcp-v2/config");
const { applyOrganizationKeys } = require("../ai-mcp-v2/org-keys");
const { answerQuestion } = require("../ai-mcp-v2/chat");
const { countSuccessfulQuestions } = require("../ai-mcp-v2/quota");

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
  const used = await countSuccessfulQuestions(prisma, Number(auth.tenantid), utcNow()).catch(() => Number(row?.questionsused || 0));
  return publicSettings({ ...row, questionsused: used });
}

async function saveSetup(auth, body = {}) {
  await ensureAdmin(auth);
  const apiKey = String(body.apiKey || body.apikey || body.key || "").trim();
  let provider = normalizeAiProvider(body.provider);
  if (apiKey.startsWith("grok_") || apiKey.startsWith("xai-")) {
    provider = "grok";
  }
  if (!provider) {
    httpError("provider must be openai, gemini, claude, cursor, or grok", 400);
  }

  const now = utcNow();
  const tenantid = Number(auth.tenantid);
  const existing = await loadSettings(tenantid);
  if (!apiKey && (!existing?.apikeycipher || existing.provider !== provider)) {
    httpError("apiKey is required", 400);
  }

  const data = {
    provider,
    apikeycipher: apiKey ? encryptAiKey(apiKey) : existing.apikeycipher,
    lastupdatedby: Number(auth.userid),
    lastupdatedat: now
  };
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

async function deleteSetup(auth) {
  await ensureAdmin(auth);
  const tenantid = Number(auth.tenantid);
  const existing = await loadSettings(tenantid);
  if (existing) {
    await prisma.$executeRaw`
      UPDATE organizationaisettings
      SET provider = NULL,
          apikeycipher = NULL,
          lastupdatedby = ${Number(auth.userid)},
          lastupdatedat = ${utcNow()}
      WHERE recno = ${existing.recno}
        AND tenantid = ${tenantid}
    `;
  }
  return getSetup(auth);
}

async function ask(auth, body = {}) {
  const message = String(body.message || body.question || "").trim();
  if (!message) {
    httpError("message is required", 400);
  }

  const config = await applyOrganizationKeys(loadConfig(), auth);
  try {
    const result = await answerQuestion({
      message,
      provider: body.provider,
      auth,
      config,
      deps: {}
    });
    return {
      html: result.html,
      answer: result.answer,
      provider: result.provider,
      questionLimit: FREE_QUESTION_LIMIT,
      questionsUsed: result.questionsUsed,
      questionsRemaining: result.questionsRemaining,
      requiresAiSetup: false
    };
  } catch (err) {
    if (err.status) throw err;
    const wrapped = new Error(err.message || "AI provider request failed");
    wrapped.status = 400;
    wrapped.clientSafe = true;
    throw wrapped;
  }
}

module.exports = {
  getSetup,
  saveSetup,
  deleteSetup,
  ask
};
