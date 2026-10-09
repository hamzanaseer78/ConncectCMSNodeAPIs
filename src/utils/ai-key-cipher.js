const crypto = require("crypto");

function encryptionKey() {
  const raw = process.env.AI_KEY_ENCRYPTION_SECRET || process.env.JWT_SECRET;
  if (!raw) {
    const err = new Error("JWT_SECRET is required to store organization AI keys");
    err.status = 500;
    throw err;
  }
  return crypto.createHash("sha256").update(String(raw)).digest();
}

function encryptAiKey(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

function decryptAiKey(payload) {
  const buf = Buffer.from(String(payload), "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

module.exports = {
  encryptAiKey,
  decryptAiKey
};
