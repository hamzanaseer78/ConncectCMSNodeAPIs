const prisma = require("../database/prisma");
const { decryptAiKey } = require("../utils/ai-key-cipher");

function toV2Provider(name) {
  const value = String(name || "").trim().toLowerCase();
  if (value === "claude" || value === "anthropic") return "anthropic";
  if (value === "xai") return "grok";
  if (value === "openai" || value === "gemini" || value === "cursor" || value === "grok") return value;
  return null;
}

async function applyOrganizationKeys(config, auth) {
  if (!auth?.tenantid || !config) return config;
  try {
    const rows = await prisma.$queryRaw`
      SELECT provider, apikeycipher
      FROM organizationaisettings
      WHERE tenantid = ${Number(auth.tenantid)}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row?.provider || !row?.apikeycipher) return config;
    const provider = toV2Provider(row.provider);
    const key = decryptAiKey(row.apikeycipher);
    if (!provider || !key) return config;
    return {
      ...config,
      defaultProvider: provider,
      keys: {
        ...config.keys,
        [provider]: key
      }
    };
  } catch {
    return config;
  }
}

module.exports = {
  toV2Provider,
  applyOrganizationKeys
};
