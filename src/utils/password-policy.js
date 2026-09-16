const { PASSWORD } = require("./constants");

function assertPasswordStrength(password, label = "Password") {
  if (!password || typeof password !== "string") {
    const err = new Error(`${label} is required`);
    err.status = 400;
    throw err;
  }
  const len = password.length;
  if (len < PASSWORD.MIN_LENGTH) {
    const err = new Error(`${label} must be at least ${PASSWORD.MIN_LENGTH} characters`);
    err.status = 400;
    throw err;
  }
  if (len > PASSWORD.MAX_LENGTH) {
    const err = new Error(`${label} must be at most ${PASSWORD.MAX_LENGTH} characters`);
    err.status = 400;
    throw err;
  }
}

module.exports = { assertPasswordStrength };
