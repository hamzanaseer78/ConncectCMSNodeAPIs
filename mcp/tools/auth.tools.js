const { z } = require("zod");
const prisma = require("../../src/database/prisma");
const {
  container,
  resolveAuthContext,
  getSessionSnapshot,
  clearSession,
  setSessionFromLoginResponse
} = require("../auth-context");
const { textResult, errorResult } = require("../format-result");
const { withAuth } = require("../helpers/with-auth");

function registerAuthTools(server) {
  server.registerTool(
    "cms_health",
    {
      description:
        "Check ConnectCMS MCP server and database connectivity (no auth required)."
    },
    withAuth(async () => {
      await prisma.$queryRaw`SELECT 1`;
      return textResult({
        ok: true,
        service: "connect-cms-mcp",
        database: "connected"
      });
    }, { requireAuth: false })
  );

  server.registerTool(
    "cms_login",
    {
      description:
        "Log in with email/password and store session for subsequent tools. Optionally switch tenant/branch.",
      inputSchema: {
        email: z.string().email(),
        password: z.string().min(1),
        tenantid: z.number().int().positive().optional(),
        branchid: z.number().int().positive().optional()
      }
    },
    async ({ email, password, tenantid, branchid }) => {
      try {
        const session = await resolveAuthContext({
          email,
          password,
          tenantid,
          branchid
        });
        return textResult({
          message: "Logged in",
          session: getSessionSnapshot(),
          isAdmin: session.isAdmin ?? undefined
        });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "cms_session",
    {
      description: "Show the current MCP session (tenant/branch/user scope)."
    },
    async () => {
      const session = getSessionSnapshot();
      if (!session) {
        return textResult({
          authenticated: false,
          hint: "Call cms_login or set MCP_JWT / MCP_EMAIL + MCP_PASSWORD"
        });
      }
      return textResult({ authenticated: true, session });
    }
  );

  server.registerTool(
    "cms_logout",
    {
      description: "Clear the in-memory MCP session."
    },
    async () => {
      clearSession();
      return textResult({ message: "Session cleared" });
    }
  );

  server.registerTool(
    "cms_switch_context",
    {
      description: "Switch tenant/branch for the current session.",
      inputSchema: {
        tenantid: z.number().int().positive(),
        branchid: z.number().int().positive()
      }
    },
    async ({ tenantid, branchid }) => {
      try {
        const { auth } = await resolveAuthContext();
        const authService = container.getAuthService();
        const switched = await authService.switchContext(auth, {
          tenantid,
          branchid
        });
        setSessionFromLoginResponse(switched);
        return textResult({
          message: "Context switched",
          session: getSessionSnapshot()
        });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "cms_profile",
    {
      description:
        "Get the authenticated user profile, organizations, and screen rights (same as GET /api/auth/profile)."
    },
    withAuth(async (auth) => {
      const authService = container.getAuthService();
      const profile = await authService.getProfile(auth);
      return textResult(profile);
    })
  );
}

module.exports = {
  registerAuthTools
};
