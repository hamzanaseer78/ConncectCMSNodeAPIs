const prisma = require("../database/prisma");
const { decryptAiKey } = require("../utils/ai-key-cipher");
const { withEnvKeySources } = require("./config");
const logger = require("../utils/logger");

function toV2Provider(name) {
  const value = String(name || "").trim().toLowerCase();
  if (value === "claude" || value === "anthropic") return "anthropic";
  if (value === "xai") return "grok";
  if (value === "openai" || value === "gemini" || value === "cursor" || value === "grok") return value;
  return null;
}

async function applyOrganizationKeys(config, auth) {
  const base = withEnvKeySources(config);
  if (!auth?.tenantid || !config) return base;
  try {
    const rows = await prisma.$queryRaw`
      SELECT provider, apikeycipher
      FROM organizationaisettings
      WHERE tenantid = ${Number(auth.tenantid)}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row?.provider || !row?.apikeycipher) return base;
    let provider = toV2Provider(row.provider);
    const key = decryptAiKey(row.apikeycipher);
    if (!provider || !key) return base;
    if ((key.startsWith("grok_") || key.startsWith("xai-")) && provider !== "grok") {
      provider = "grok";
    }
    return {
      ...base,
      defaultProvider: provider,
      keys: {
        ...base.keys,
        [provider]: key
      },
      keySources: {
        ...base.keySources,
        [provider]: "organization"
      }
    };
  } catch (err) {
    logger.error("ai-mcp-v2.org_keys_failed", { code: err.code || err.name || "org_keys_failed" });
    return base;
  }
}

module.exports = {
  toV2Provider,
  applyOrganizationKeys
};
