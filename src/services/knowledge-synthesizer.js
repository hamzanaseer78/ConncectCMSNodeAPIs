const prisma = require("../database/prisma");
const { decryptAiKey } = require("../utils/ai-key-cipher");
const { completeFromEvidence } = require("./organization-ai-providers");

async function evidenceSynthesizer(auth) {
  const rows = await prisma.$queryRaw`
    SELECT provider, apikeycipher
    FROM organizationaisettings
    WHERE tenantid = ${Number(auth?.tenantid)}
    LIMIT 1
  `;
  const row = rows[0];
  const provider = row?.provider;
  const apiKey = row?.apikeycipher ? decryptAiKey(row.apikeycipher) : "";
  if (!provider || !apiKey) return null;
  return (payload) => completeFromEvidence({
    provider,
    apiKey,
    message: payload.message,
    evidence: payload.evidence
  });
}

module.exports = {
  evidenceSynthesizer
};
