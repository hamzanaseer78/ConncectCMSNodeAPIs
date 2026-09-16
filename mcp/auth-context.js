const { verifyToken } = require("../src/config/jwt");
const container = require("../src/utils/service-container");

let sessionAuth = null;
let sessionToken = null;

function authFromToken(token) {
  const decoded = verifyToken(token);
  return {
    userid: decoded.userid ?? decoded.sub,
    tenantid: decoded.tenantid,
    branchid: decoded.branchid,
    email: decoded.email,
    name: decoded.name
  };
}

function setSessionFromLoginResponse(loginResponse) {
  sessionToken = loginResponse.token;
  sessionAuth = authFromToken(loginResponse.token);
  return {
    auth: sessionAuth,
    token: sessionToken,
    tenantid: loginResponse.tenantid,
    branchid: loginResponse.branchid,
    isAdmin: loginResponse.isAdmin
  };
}

function getSessionSnapshot() {
  if (!sessionAuth) {
    return null;
  }
  return {
    userid: sessionAuth.userid,
    tenantid: sessionAuth.tenantid,
    branchid: sessionAuth.branchid,
    email: sessionAuth.email,
    name: sessionAuth.name
  };
}

function clearSession() {
  sessionAuth = null;
  sessionToken = null;
}

async function resolveAuthContext(options = {}) {
  const authService = container.getAuthService();

  if (options.email && options.password) {
    const loginResponse = await authService.login({
      email: options.email,
      password: options.password
    });

    if (options.tenantid != null && options.branchid != null) {
      const auth = authFromToken(loginResponse.token);
      const switched = await authService.switchContext(auth, {
        tenantid: Number(options.tenantid),
        branchid: Number(options.branchid)
      });
      return setSessionFromLoginResponse(switched);
    }

    return setSessionFromLoginResponse(loginResponse);
  }

  if (options.jwt) {
    sessionToken = options.jwt;
    sessionAuth = authFromToken(options.jwt);
    return { auth: sessionAuth, token: sessionToken };
  }

  if (process.env.MCP_JWT) {
    sessionToken = process.env.MCP_JWT;
    sessionAuth = authFromToken(process.env.MCP_JWT);
    return { auth: sessionAuth, token: sessionToken };
  }

  if (sessionAuth) {
    return { auth: sessionAuth, token: sessionToken };
  }

  if (process.env.MCP_EMAIL && process.env.MCP_PASSWORD) {
    const loginResponse = await authService.login({
      email: process.env.MCP_EMAIL,
      password: process.env.MCP_PASSWORD
    });
    return setSessionFromLoginResponse(loginResponse);
  }

  throw new Error(
    "Not authenticated. Set MCP_JWT or MCP_EMAIL/MCP_PASSWORD in env, or call cms_login."
  );
}

module.exports = {
  container,
  authFromToken,
  setSessionFromLoginResponse,
  getSessionSnapshot,
  clearSession,
  resolveAuthContext
};
