const THINKING_EFFORTS = ["low", "medium", "high"];
const CONTEXT_LENGTHS = ["standard", "extra-long"];
const STANDARD_CONTEXT_CHARS = 500_000;
const EXTRA_LONG_CONTEXT_CHARS = 1_000_000;

function normalizedConfig(config = {}) {
  return {
    provider: String(config.provider || "custom").toLowerCase(),
    model: String(config.model || "").toLowerCase(),
  };
}

function isNativeThinkingModel(config = {}) {
  const { provider, model } = normalizedConfig(config);
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
  const nativeThinking = explicit.nativeThinking === undefined ? isNativeThinkingModel(config) : Boolean(explicit.nativeThinking);
  const extraLongContext = explicit.extraLongContext === undefined ? supportsExtraLongContext(config) : Boolean(explicit.extraLongContext);
  const standard = Number(config.contextWindowTokens) > 0 ? Number(config.contextWindowTokens) : STANDARD_CONTEXT_CHARS;
  const extraLong = Number(config.contextWindowTokens) > 0 ? Number(config.contextWindowTokens) : EXTRA_LONG_CONTEXT_CHARS;
  return {
    thinkingEfforts: Array.isArray(explicit.thinkingEfforts) ? explicit.thinkingEfforts : (nativeThinking ? THINKING_EFFORTS : []),
    contextLengths: Array.isArray(explicit.contextLengths) ? explicit.contextLengths : (extraLongContext ? CONTEXT_LENGTHS : ["standard"]),
    nativeThinking,
    supportsVision: Boolean(explicit.supportsVision),
    supportsTools: explicit.supportsTools === undefined ? true : Boolean(explicit.supportsTools),
    maxOutputTokens: Number(config.maxOutputTokens) || 0,
    contextWindowTokens: Number(config.contextWindowTokens) || 0,
    contextCharacterLimits: {
      standard,
      "extra-long": extraLong,
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
  getModelCapabilities,
  isNativeThinkingModel,
  normalizeContextLength,
  normalizeReasoningEffort,
};
