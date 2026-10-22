const { THINKING_EFFORTS, isNativeThinkingModel, normalizeReasoningEffort: normalizeForModel } = require("./model-capabilities.cjs");

const EFFORTS = new Set(THINKING_EFFORTS);

function normalizeReasoningEffort(value) {
  return EFFORTS.has(value) ? value : "medium";
}

function reasoningPolicy(value, mode = "free-chat") {
  const effort = normalizeReasoningEffort(value);
  const policies = {
    low: {
      effort,
      maxToolRounds: 4,
      maxAcademicSearches: 2,
      maxWebSearches: 2,
      instruction: "Use low reasoning effort. Prefer a direct answer, make only essential tool calls, and stop once the request is adequately supported. Do not skip an explicitly requested verification.",
    },
    medium: {
      effort,
      maxToolRounds: 8,
      maxAcademicSearches: 4,
      maxWebSearches: 3,
      instruction: "Use medium reasoning effort. Balance speed with verification, investigate material ambiguities, and use enough independent evidence to support the answer.",
    },
    high: {
      effort,
      maxToolRounds: 14,
      maxAcademicSearches: 6,
      maxWebSearches: 6,
      instruction: "Use high reasoning effort. Decompose difficult questions, test competing explanations, verify consequential claims with primary evidence, and inspect failure modes before concluding. Keep hidden reasoning private and present only conclusions, evidence, and concise rationale.",
    },
  };
  const policy = policies[effort];
  if (mode !== "deep-research") return policy;
  return {
    ...policy,
    maxToolRounds: Math.max(policy.maxToolRounds, effort === "high" ? 24 : 20),
    maxAcademicSearches: Math.max(policy.maxAcademicSearches, 6),
    maxWebSearches: Math.max(policy.maxWebSearches, 8),
  };
}

function openAiReasoningOptions(config, value) {
  if (!isNativeThinkingModel(config)) return {};
  const effort = normalizeForModel(config, value);
  const provider = String(config?.provider || "").toLowerCase();
  if (provider === "openrouter") return { reasoning: { effort } };
  if (provider === "openai" || provider === "gemini") return { reasoning_effort: effort };
  if (provider === "custom") return { reasoning_effort: effort };
  return {};
}

module.exports = { normalizeReasoningEffort, openAiReasoningOptions, reasoningPolicy };
