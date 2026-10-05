const AI_PROVIDERS = Object.freeze(["openai", "gemini", "claude"]);
const FREE_QUESTION_LIMIT = 3;

const PROVIDER_ALIASES = Object.freeze({
  openai: "openai",
  chatgpt: "openai",
  "chat-gpt": "openai",
  gpt: "openai",
  gemini: "gemini",
  google: "gemini",
  claude: "claude",
  anthropic: "claude"
});

function normalizeAiProvider(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (!key) return null;
  return PROVIDER_ALIASES[key] || null;
}

function platformGeminiAvailable() {
  return Boolean(String(process.env.GEMINI_API_KEY || "").trim());
}

/**
 * Organization key is used whenever it is saved.
 * Otherwise the first FREE_QUESTION_LIMIT questions use the platform Gemini key.
 */
function resolveChatAccess({ questionsUsed = 0, hasOrganizationKey = false } = {}) {
  const used = Number(questionsUsed) || 0;
  if (hasOrganizationKey) {
    return {
      allowed: true,
      useOrganizationKey: true,
      requiresAiSetup: false,
      questionsUsed: used,
      questionLimit: FREE_QUESTION_LIMIT,
      questionsRemaining: 0
    };
  }

  if (used < FREE_QUESTION_LIMIT && platformGeminiAvailable()) {
    return {
      allowed: true,
      useOrganizationKey: false,
      requiresAiSetup: false,
      questionsUsed: used,
      questionLimit: FREE_QUESTION_LIMIT,
      questionsRemaining: FREE_QUESTION_LIMIT - used
    };
  }

  return {
    allowed: false,
    useOrganizationKey: false,
    requiresAiSetup: true,
    platformUnavailable: !platformGeminiAvailable() && used < FREE_QUESTION_LIMIT,
    questionsUsed: used,
    questionLimit: FREE_QUESTION_LIMIT,
    questionsRemaining: 0
  };
}

module.exports = {
  AI_PROVIDERS,
  FREE_QUESTION_LIMIT,
  normalizeAiProvider,
  platformGeminiAvailable,
  resolveChatAccess
};
