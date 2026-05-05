const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "dsgnhytrfscfwesdfebngfbe";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d"; // Changed from 43800 seconds (~12h) to 7 days
const SIGNUP_TOKEN_EXPIRES_MINUTES = Number(process.env.SIGNUP_TOKEN_EXPIRES_MINUTES || 30);

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = {
  JWT_SECRET,
  JWT_EXPIRES_IN,
  SIGNUP_TOKEN_EXPIRES_MINUTES,
  signToken,
  verifyToken
};
