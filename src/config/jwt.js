const jwt = require("jsonwebtoken");

// IMPORTANT: Set JWT_SECRET in environment variables
// DO NOT use default hardcoded secrets in production
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const SIGNUP_TOKEN_EXPIRES_MINUTES = Number(process.env.SIGNUP_TOKEN_EXPIRES_MINUTES || 30);

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required but not set");
}

/**
 * Sign a JWT token
 * @param {Object} payload - Token payload
 * @returns {string} JWT token
 */
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verify a JWT token
 * @param {string} token - JWT token
 * @returns {Object} Decoded token payload
 * @throws {Error} If token is invalid or expired
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new Error('Token has expired');
    }
    if (err.name === 'JsonWebTokenError') {
      throw new Error('Invalid token');
    }
    throw err;
  }
}

module.exports = {
  JWT_SECRET,
  JWT_EXPIRES_IN,
  SIGNUP_TOKEN_EXPIRES_MINUTES,
  signToken,
  verifyToken
};
