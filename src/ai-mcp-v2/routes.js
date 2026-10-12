const express = require("express");
const logger = require("../utils/logger");
const { AiMcpError } = require("./errors");
const { loadConfig } = require("./config");
const { TOOLS, executeTool } = require("./tools");
const { answerQuestion } = require("./chat");
const { handleMcp } = require("./mcp-http");

function sendError(res, err) {
  const status = Number(err.status) || 500;
  const code = err.code || (status === 401 ? "unauthorized" : "error");
  const safeClientMessage = err instanceof AiMcpError
    || (status >= 400 && status < 500 && err.message && !/\b(select|insert|update|delete|prisma)\b/i.test(err.message));
  const message = safeClientMessage ? err.message : "The request could not be completed.";
  if (status >= 500) logger.error("ai-mcp-v2.request_failed", { code });
  res.status(status).json({ error: message, code });
}

function createRouter(overrides = {}) {
  const config = overrides.config || loadConfig();
  const authenticate = overrides.authenticate || require("../middlewares/auth.middleware");
  const router = express.Router();
  const deps = {
    db: overrides.db,
    canManageBranch: overrides.canManageBranch,
    assertMembership: overrides.assertMembership,
    now: overrides.now,
    queryTimeoutMs: overrides.queryTimeoutMs || config.queryTimeoutMs,
    maxRows: overrides.maxRows || config.maxRows,
    fetchImpl: overrides.fetchImpl
  };

  router.use((req, res, next) => {
    if (!config.enabled) {
      res.status(404).json({ error: "AI MCP v2 is disabled.", code: "disabled" });
      return;
    }
    next();
  });

  router.get("/health", (_req, res) => {
    res.json({
      service: "ai-mcp-v2",
      enabled: true,
      providersConfigured: config.providers.filter((name) => Boolean(config.keys[name])),
      mcpPath: "mcp",
      clients: ["cursor", "claude.ai"]
    });
  });

  function secured(handler) {
    return (req, res) => {
      authenticate(req, res, (err) => {
        if (err) {
          sendError(res, err);
          return;
        }
        Promise.resolve(handler(req, res)).catch((failure) => sendError(res, failure));
      });
    };
  }

  router.get("/tools", secured((_req, res) => {
    res.json({
      tools: TOOLS.map((tool) => ({ name: tool.name, description: tool.description }))
    });
  }));

  router.post("/tools/:name", secured(async (req, res) => {
    const result = await executeTool(req.params.name, req.body || {}, req.auth, deps);
    res.json({ tool: req.params.name, result });
  }));

  router.post("/ask", secured(async (req, res) => {
    const provider = req.body?.provider ? String(req.body.provider).toLowerCase() : undefined;
    const result = await answerQuestion({
      message: req.body?.message,
      provider,
      auth: req.auth,
      config,
      deps
    });
    res.json(result);
  }));

  router.all("/mcp", secured(async (req, res) => {
    await handleMcp(req, res, deps);
  }));

  return router;
}

module.exports = {
  createRouter
};
