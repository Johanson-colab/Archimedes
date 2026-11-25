const { isOfficialOpenAI, openAIWorkModel } = require("./openai-work-models.cjs");
const THINKING_EFFORTS = ["low", "medium", "high"];
const CONTEXT_LENGTHS = ["standard", "extra-long"];
const STANDARD_CONTEXT_CHARS = 500_000;
const EXTRA_LONG_CONTEXT_CHARS = 1_000_000;
const ESTIMATED_CHARACTERS_PER_TOKEN = 4;

function estimateTokenCharacters(tokens) {
  return tokens * ESTIMATED_CHARACTERS_PER_TOKEN;
}

function tokenCount(value) {
  const count = Math.round(Number(value));
  return Number.isSafeInteger(count) && count > 0 ? count : 0;
}

function outputTokenLimit(config, { maxOutputTokens, allowLargeOutput = false, allowTools = true } = {}) {
  const savedLimit = tokenCount(config.maxOutputTokens);
  const requested = tokenCount(maxOutputTokens);
  if (savedLimit) return requested ? Math.min(savedLimit, requested) : savedLimit;
  if (!requested) return 0;
  return Math.max(64, Math.min(allowLargeOutput && !allowTools ? 32_768 : 8_192, requested));
}

function normalizedConfig(config = {}) {
  const provider = String(config.provider || "custom").toLowerCase();
  return {
    // Go uses the same model-based capability checks as other compatible gateways.
    provider: provider === "opencode-go" ? "custom" : provider,
    model: String(config.model || "").toLowerCase(),
  };
}

function isNativeThinkingModel(config = {}) {
  const { provider, model } = normalizedConfig(config);
  if (isOfficialOpenAI(config)) return Boolean(openAIWorkModel(model)?.efforts.length);
  if (provider === "openai" || provider === "gemini") return true;
  if (provider === "openrouter") return /^(openai\/)?(gpt-[56]|o[134])/.test(model);
  return provider === "custom" && /^(gpt-[56]|o[134])/.test(model);
}

function supportsExtraLongContext(config = {}) {
  const { provider, model } = normalizedConfig(config);
  if (provider === "openai" || provider === "gemini" || provider === "anthropic") return true;
  if (provider === "openrouter") return /^(openai\/(gpt-[456]|o[134])|google\/gemini|anthropic\/claude)/.test(model);
  return provider === "custom" && /^(gpt-[456]|o[134]|gemini|claude)/.test(model);
}

function getModelCapabilities(config = {}) {
  const explicit = config.capabilities && typeof config.capabilities === "object" ? config.capabilities : {};
  const official = isOfficialOpenAI(config);
  const officialEfforts = official ? openAIWorkModel(config.model)?.efforts ?? [] : null;
  const nativeThinking = official
    ? officialEfforts.length > 0 && explicit.nativeThinking !== false
    : explicit.nativeThinking === undefined ? isNativeThinkingModel(config) : Boolean(explicit.nativeThinking);
  const configuredEfforts = Array.isArray(explicit.thinkingEfforts) ? explicit.thinkingEfforts : THINKING_EFFORTS;
  const thinkingEfforts = nativeThinking ? configuredEfforts.filter(value => !official || officialEfforts.includes(value)) : [];
  const extraLongContext = explicit.extraLongContext === undefined ? supportsExtraLongContext(config) : Boolean(explicit.extraLongContext);
  const contextWindowTokens = tokenCount(config.contextWindowTokens);
  // The conversation and composer share a character estimate. The provider
  // applies its own tokenizer when it receives the actual request.
  const windowCharacters = estimateTokenCharacters(contextWindowTokens);
  return {
    thinkingEfforts,
    contextLengths: Array.isArray(explicit.contextLengths) ? explicit.contextLengths : (extraLongContext ? CONTEXT_LENGTHS : ["standard"]),
    nativeThinking,
    supportsVision: Boolean(explicit.supportsVision),
    supportsTools: explicit.supportsTools === undefined ? true : Boolean(explicit.supportsTools),
    maxOutputTokens: tokenCount(config.maxOutputTokens),
    contextWindowTokens,
    contextCharacterLimits: {
      standard: windowCharacters || STANDARD_CONTEXT_CHARS,
      "extra-long": windowCharacters || EXTRA_LONG_CONTEXT_CHARS,
    },
  };
}

function normalizeReasoningEffort(config, value) {
  const supported = getModelCapabilities(config).thinkingEfforts;
  if (!supported.length) return "medium";
  return supported.includes(value) ? value : (supported.includes("medium") ? "medium" : supported[0]);
}

function normalizeContextLength(config, value) {
  const supported = getModelCapabilities(config).contextLengths;
  return supported.includes(value) ? value : "standard";
}

function contextCharacterLimit(config, value) {
  const capabilities = getModelCapabilities(config);
  return capabilities.contextCharacterLimits[normalizeContextLength(config, value)];
}

module.exports = {
  CONTEXT_LENGTHS,
  EXTRA_LONG_CONTEXT_CHARS,
  STANDARD_CONTEXT_CHARS,
  THINKING_EFFORTS,
  contextCharacterLimit,
  estimateTokenCharacters,
  getModelCapabilities,
  isNativeThinkingModel,
  normalizeContextLength,
  normalizeReasoningEffort,
  outputTokenLimit,
};
