const crypto = require("crypto");

/** Readable random password (no ambiguous chars like 0/O, 1/l). */
function generateRandomPassword(length = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = crypto.randomBytes(length);
  let password = "";
  for (let i = 0; i < length; i += 1) {
    password += chars[bytes[i] % chars.length];
  }
  return password;
}

module.exports = { generateRandomPassword };
