const { verifyToken } = require("../config/jwt");

function authenticateJwt(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.warn(`[AUTH] Missing bearer token from ${req.ip}`);
    return res.status(401).json({ error: "Missing bearer token" });
  }

  const token = authHeader.slice("Bearer ".length).trim();

  try {
    req.auth = verifyToken(token);
    req.user = req.auth;
    console.log(`[AUTH] Token verified for user: ${req.auth.userid}`);
    next();
  } catch (err) {
    console.error(`[AUTH] Token verification failed:`, {
      error: err.message,
      tokenLength: token.length,
      tokenPrefix: token.substring(0, 20) + "...",
      ip: req.ip,
      route: req.path
    });
    return res.status(401).json({ error: "Invalid or expired token", details: err.message });
  }
}

module.exports = authenticateJwt;
