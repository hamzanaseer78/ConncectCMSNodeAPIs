const PROVIDERS = Object.freeze(["openai", "anthropic", "gemini"]);

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function loadConfig(env = process.env) {
  const provider = String(env.AI_MCP_V2_DEFAULT_PROVIDER || "openai").trim().toLowerCase();
  return {
    enabled: env.AI_MCP_V2_ENABLED === "true",
    port: clampInt(env.AI_MCP_V2_PORT, 1, 65535, 3102),
    defaultProvider: PROVIDERS.includes(provider) ? provider : "openai",
    timeoutMs: clampInt(env.AI_MCP_V2_TIMEOUT_MS, 1000, 60000, 20000),
    queryTimeoutMs: clampInt(env.AI_MCP_V2_QUERY_TIMEOUT_MS, 100, 30000, 8000),
    maxRows: clampInt(env.AI_MCP_V2_MAX_ROWS, 1, 25, 20),
    providers: PROVIDERS,
    keys: {
      openai: String(env.AI_MCP_V2_OPENAI_API_KEY || ""),
      anthropic: String(env.AI_MCP_V2_ANTHROPIC_API_KEY || ""),
      gemini: String(env.AI_MCP_V2_GEMINI_API_KEY || "")
    },
    models: {
      openai: String(env.AI_MCP_V2_OPENAI_MODEL || "gpt-4o-mini"),
      anthropic: String(env.AI_MCP_V2_ANTHROPIC_MODEL || "claude-sonnet-4-5"),
      gemini: String(env.AI_MCP_V2_GEMINI_MODEL || "gemini-2.5-flash")
    },
    databaseUrl: String(env.AI_MCP_V2_DATABASE_URL || "")
  };
}

function configuredProviders(config) {
  return config.providers.filter((name) => config.keys[name]);
}

module.exports = {
  PROVIDERS,
  loadConfig,
  configuredProviders
};
