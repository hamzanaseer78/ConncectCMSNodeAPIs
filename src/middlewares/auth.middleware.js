const { verifyToken } = require("../config/jwt");
const logger = require("../utils/logger");

/**
 * JWT Authentication Middleware
 * Verifies the Bearer token and attaches decoded payload to req.auth
 */
function authenticateJwt(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    const err = new Error("Missing bearer token");
    err.status = 401;
    return next(err);
  }

  const token = authHeader.slice(7).trim();

  try {
    const decoded = verifyToken(token);

    req.auth = decoded;
    req.user = decoded;

    logger.debug("JWT authenticated", {
      UserId: decoded.userid,
      RequestId: req.requestId || null
    });

    next();
  } catch (err) {
    logger.warn("JWT verification failed", { RequestId: req.requestId || null }, err);

    const authError = new Error("Invalid or expired token");
    authError.status = 401;
    next(authError);
  }
}

module.exports = authenticateJwt;