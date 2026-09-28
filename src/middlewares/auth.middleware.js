const { verifyToken } = require("../config/jwt");
const logger = require("../utils/logger");
const prisma = require("../database/prisma");

async function assertActiveBranchMembership(auth) {
  if (process.env.SKIP_BRANCH_MEMBERSHIP_CHECK === "true") {
    return;
  }
  if (auth?.userid == null || auth.tenantid == null || auth.branchid == null) {
    return;
  }

  const membership = await prisma.userorganizations.findFirst({
    where: {
      userid: Number(auth.userid),
      tenantid: Number(auth.tenantid),
      branchid: Number(auth.branchid),
      isblocked: false
    },
    select: { recno: true }
  });

  if (!membership) {
    const err = new Error(
      "You do not have access to this branch. Switch to an assigned branch or contact an admin."
    );
    err.status = 403;
    throw err;
  }
}

/**
 * JWT Authentication Middleware
 * Verifies the Bearer token and attaches decoded payload to req.auth
 */
async function authenticateJwt(req, res, next) {
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

    await assertActiveBranchMembership(decoded);

    logger.debug("JWT authenticated", {
      UserId: decoded.userid,
      RequestId: req.requestId || null
    });

    next();
  } catch (err) {
    if (err.status === 403) {
      return next(err);
    }
    logger.warn("JWT verification failed", { RequestId: req.requestId || null }, err);

    const authError = new Error("Invalid or expired token");
    authError.status = 401;
    next(authError);
  }
}

module.exports = authenticateJwt;