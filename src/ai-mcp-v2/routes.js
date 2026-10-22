const express = require("express");
const logger = require("../utils/logger");
const { AiMcpError } = require("./errors");
const { loadConfig, configuredProviders, describeProvider, resolveProvider } = require("./config");
const { TOOLS, executeTool } = require("./tools");
const { answerQuestion } = require("./chat");
const { handleMcp } = require("./mcp-http");
const { applyOrganizationKeys } = require("./org-keys");

function sendError(res, err) {
  const prismaCode = typeof err.code === "string" && /^P\d{4}$/.test(err.code);
  const status = prismaCode ? 500 : (Number(err.status) || 500);
  const code = prismaCode ? "query_failed" : (err.code || (status === 401 ? "unauthorized" : "error"));
  const safeClientMessage = !prismaCode && (err instanceof AiMcpError
    || (status >= 400 && status < 500 && err.message && !/\b(select|insert|update|delete|prisma)\b/i.test(err.message)));
  const message = safeClientMessage ? err.message : "The request could not be completed.";
  const details = !prismaCode && err.details && typeof err.details === "object" ? err.details : {};
  if (status >= 500) {
    logger.error("ai-mcp-v2.request_failed", {
      code,
      provider: details.provider || null,
      model: details.model || null,
      keySource: details.keySource || null,
      keyKind: details.keyKind || null,
      keySuffix: details.keySuffix || null,
      upstreamStatus: details.upstreamStatus || null,
      upstreamCode: details.upstreamCode || null
    });
  }
  res.status(status).json({ error: message, code, ...details });
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
      defaultProvider: config.defaultProvider,
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

  router.get("/runtime", secured(async (req, res) => {
    const requestConfig = await applyOrganizationKeys(config, req.auth);
    const requested = req.query?.provider ? String(req.query.provider).toLowerCase() : "";
    let selected = null;
    try {
      selected = resolveProvider(requested, requestConfig);
    } catch {
      selected = null;
    }
    res.json({
      requested: requested || null,
      selected,
      ...describeProvider(requestConfig, selected),
      providersConfigured: configuredProviders(requestConfig),
      defaultProvider: requestConfig.defaultProvider,
      keySources: requestConfig.keySources || {}
    });
  }));

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
    const requestConfig = await applyOrganizationKeys(config, req.auth);
    const result = await answerQuestion({
      message: req.body?.message,
      provider,
      auth: req.auth,
      config: requestConfig,
      deps
    });
    res.json({
      html: result.html,
      requestId: result.requestId,
      provider: result.provider,
      questionsUsed: result.questionsUsed,
      questionsRemaining: result.questionsRemaining,
      generatedFromTools: result.generatedFromTools,
      ...describeProvider(requestConfig, result.provider)
    });
  }));

  router.all("/mcp", secured(async (req, res) => {
    await handleMcp(req, res, deps);
  }));

  return router;
}

module.exports = {
  createRouter
};
