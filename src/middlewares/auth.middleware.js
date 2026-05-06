const { verifyToken } = require("../config/jwt");

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

    console.log(`[AUTH] Authenticated user: ${decoded.userid}`);

    next();
  } catch (err) {
    console.error("[AUTH] Token error:", err.message);

    const authError = new Error("Invalid or expired token");
    authError.status = 401;
    next(authError);
  }
}

module.exports = authenticateJwt;