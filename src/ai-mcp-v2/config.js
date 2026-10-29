const PROVIDERS = Object.freeze(["openai", "anthropic", "gemini", "grok", "cursor"]);

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function loadConfig(env = process.env) {
  const rawCursor = String(env.AI_MCP_V2_CURSOR_API_KEY || "");
  const grokMisfiled = rawCursor.startsWith("grok_") ? rawCursor : "";
  const keys = {
    openai: String(env.AI_MCP_V2_OPENAI_API_KEY || ""),
    anthropic: String(env.AI_MCP_V2_ANTHROPIC_API_KEY || ""),
    gemini: String(env.AI_MCP_V2_GEMINI_API_KEY || env.GEMINI_API_KEY || ""),
    grok: String(env.AI_MCP_V2_GROK_API_KEY || env.XAI_API_KEY || grokMisfiled || ""),
    cursor: grokMisfiled ? "" : rawCursor
  };
  const requested = String(env.AI_MCP_V2_DEFAULT_PROVIDER || "").trim().toLowerCase();
  const preferred = PROVIDERS.includes(requested) ? requested : "";
  const defaultProvider = preferred && keys[preferred]
    ? preferred
    : (PROVIDERS.find((name) => keys[name]) || preferred || "openai");
  const loaded = {
    enabled: env.AI_MCP_V2_ENABLED === "true",
    port: clampInt(env.AI_MCP_V2_PORT, 1, 65535, 3102),
    defaultProvider,
    timeoutMs: clampInt(env.AI_MCP_V2_TIMEOUT_MS, 1000, 60000, 20000),
    queryTimeoutMs: clampInt(env.AI_MCP_V2_QUERY_TIMEOUT_MS, 100, 30000, 8000),
    maxRows: clampInt(env.AI_MCP_V2_MAX_ROWS, 1, 100, 50),
    providers: PROVIDERS,
    keys,
    models: {
      openai: String(env.AI_MCP_V2_OPENAI_MODEL || "gpt-4o-mini"),
      anthropic: String(env.AI_MCP_V2_ANTHROPIC_MODEL || "claude-sonnet-4-5"),
      gemini: String(env.AI_MCP_V2_GEMINI_MODEL || "gemini-2.5-flash"),
      grok: String(env.AI_MCP_V2_GROK_MODEL || env.XAI_MODEL || "grok-4"),
      cursor: String(env.AI_MCP_V2_CURSOR_MODEL || env.CURSOR_MODEL || "composer-2.5")
    },
    cursorApiBase: String(env.AI_MCP_V2_CURSOR_API_BASE || env.CURSOR_API_BASE || "https://api.cursor.com"),
    cursorTimeoutMs: clampInt(env.AI_MCP_V2_CURSOR_TIMEOUT_MS, 5000, 180000, 120000),
    databaseUrl: String(env.AI_MCP_V2_DATABASE_URL || ""),
    cacheTtlMs: clampInt(env.AI_MCP_V2_CACHE_TTL_MS, 1000, 60 * 60 * 1000, 5 * 60 * 1000),
    cacheMaxRowsPerTable: clampInt(env.AI_MCP_V2_CACHE_MAX_ROWS, 50, 20000, 2000),
    cacheBatchSize: clampInt(env.AI_MCP_V2_CACHE_BATCH_SIZE, 50, 2000, 500),
    cacheLookbackDays: clampInt(env.AI_MCP_V2_CACHE_LOOKBACK_DAYS, 7, 730, 120)
  };
  return withEnvKeySources(loaded);
}

function configuredProviders(config) {
  return config.providers.filter((name) => config.keys[name]);
}

function organizationProvider(config) {
  const sources = config?.keySources || {};
  return (config?.providers || []).find((name) => sources[name] === "organization" && config.keys?.[name]) || null;
}

function resolveProvider(requested, config) {
  const aliases = { claude: "anthropic", chatgpt: "openai", xai: "grok" };
  const raw = String(requested || "").trim().toLowerCase();
  const name = aliases[raw] || raw;
  const org = organizationProvider(config);
  if (org) return org;
  if (name && config.providers.includes(name) && config.keys[name]) return name;
  const available = configuredProviders(config);
  if (available.includes(config.defaultProvider)) return config.defaultProvider;
  if (available.length) return available[0];
  throw new Error("NO_PROVIDER");
}

function keyKind(key) {
  const value = String(key || "");
  if (!value) return "none";
  if (value.startsWith("grok_") || value.startsWith("xai-")) return "grok";
  if (value.startsWith("crsr_")) return "cursor";
  if (value.startsWith("AIza")) return "gemini";
  if (value.startsWith("sk-")) return "openai";
  return "other";
}

function keySuffix(key) {
  const value = String(key || "");
  if (value.length < 4) return null;
  return value.slice(-4);
}

function describeProvider(config, name) {
  const provider = String(name || "");
  const key = config?.keys?.[provider] || "";
  const endpoints = {
    openai: "https://api.openai.com/v1/chat/completions",
    grok: "https://api.x.ai/v1/chat/completions",
    anthropic: "https://api.anthropic.com/v1/messages",
    gemini: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config?.models?.gemini || "gemini")}:generateContent`,
    cursor: `${String(config?.cursorApiBase || "https://api.cursor.com").replace(/\/+$/, "")}/v1/agents`
  };
  return {
    provider: provider || null,
    model: provider ? config?.models?.[provider] || null : null,
    endpoint: endpoints[provider] || null,
    keySource: config?.keySources?.[provider] || (key ? "environment" : "none"),
    keyKind: keyKind(key),
    keySuffix: keySuffix(key)
  };
}

function withEnvKeySources(config) {
  const keySources = {};
  (config.providers || []).forEach((name) => {
    if (config.keys?.[name]) keySources[name] = "environment";
  });
  return { ...config, keySources };
}

module.exports = {
  PROVIDERS,
  loadConfig,
  configuredProviders,
  organizationProvider,
  resolveProvider,
  keyKind,
  keySuffix,
  describeProvider,
  withEnvKeySources
};
