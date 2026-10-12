const PROVIDERS = Object.freeze(["openai", "anthropic", "gemini", "cursor"]);

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function loadConfig(env = process.env) {
  const keys = {
    openai: String(env.AI_MCP_V2_OPENAI_API_KEY || ""),
    anthropic: String(env.AI_MCP_V2_ANTHROPIC_API_KEY || ""),
    gemini: String(env.AI_MCP_V2_GEMINI_API_KEY || env.GEMINI_API_KEY || ""),
    cursor: String(env.AI_MCP_V2_CURSOR_API_KEY || "")
  };
  const requested = String(env.AI_MCP_V2_DEFAULT_PROVIDER || "").trim().toLowerCase();
  const preferred = PROVIDERS.includes(requested) ? requested : "";
  const defaultProvider = preferred && keys[preferred]
    ? preferred
    : (PROVIDERS.find((name) => keys[name]) || preferred || "openai");
  return {
    enabled: env.AI_MCP_V2_ENABLED === "true",
    port: clampInt(env.AI_MCP_V2_PORT, 1, 65535, 3102),
    defaultProvider,
    timeoutMs: clampInt(env.AI_MCP_V2_TIMEOUT_MS, 1000, 60000, 20000),
    queryTimeoutMs: clampInt(env.AI_MCP_V2_QUERY_TIMEOUT_MS, 100, 30000, 8000),
    maxRows: clampInt(env.AI_MCP_V2_MAX_ROWS, 1, 25, 20),
    providers: PROVIDERS,
    keys,
    models: {
      openai: String(env.AI_MCP_V2_OPENAI_MODEL || "gpt-4o-mini"),
      anthropic: String(env.AI_MCP_V2_ANTHROPIC_MODEL || "claude-sonnet-4-5"),
      gemini: String(env.AI_MCP_V2_GEMINI_MODEL || "gemini-2.5-flash"),
      cursor: String(env.AI_MCP_V2_CURSOR_MODEL || env.CURSOR_MODEL || "composer-2.5")
    },
    cursorApiBase: String(env.AI_MCP_V2_CURSOR_API_BASE || env.CURSOR_API_BASE || "https://api.cursor.com"),
    cursorTimeoutMs: clampInt(env.AI_MCP_V2_CURSOR_TIMEOUT_MS, 5000, 180000, 120000),
    databaseUrl: String(env.AI_MCP_V2_DATABASE_URL || "")
  };
}

function configuredProviders(config) {
  return config.providers.filter((name) => config.keys[name]);
}

function resolveProvider(requested, config) {
  const aliases = { claude: "anthropic", chatgpt: "openai" };
  const raw = String(requested || "").trim().toLowerCase();
  const name = aliases[raw] || raw;
  if (name && config.providers.includes(name) && config.keys[name]) return name;
  const available = configuredProviders(config);
  if (available.includes(config.defaultProvider)) return config.defaultProvider;
  if (available.length) return available[0];
  throw new Error("NO_PROVIDER");
}

module.exports = {
  PROVIDERS,
  loadConfig,
  configuredProviders,
  resolveProvider
};
