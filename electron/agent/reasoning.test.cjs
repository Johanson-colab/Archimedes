const assert = require("node:assert/strict");
const test = require("node:test");
const { normalizeReasoningEffort, openAiReasoningOptions, reasoningPolicy } = require("./reasoning.cjs");

test("normalizes unknown reasoning effort to medium", () => {
  assert.equal(normalizeReasoningEffort("high"), "high");
  assert.equal(normalizeReasoningEffort("maximum"), "medium");
});

test("scales agent verification budgets with reasoning effort", () => {
  const low = reasoningPolicy("low");
  const high = reasoningPolicy("high");
  assert.ok(high.maxToolRounds > low.maxToolRounds);
  assert.ok(high.maxAcademicSearches > low.maxAcademicSearches);
  assert.ok(high.maxWebSearches > low.maxWebSearches);
});

test("maps native reasoning controls for compatible endpoints", () => {
  assert.deepEqual(openAiReasoningOptions({ provider: "openai", model: "gpt-5" }, "low"), { reasoning_effort: "low" });
  assert.deepEqual(openAiReasoningOptions({ provider: "gemini", model: "gemini-3-flash" }, "high"), { reasoning_effort: "high" });
  assert.deepEqual(openAiReasoningOptions({ provider: "openrouter", model: "openai/gpt-5" }, "medium"), { reasoning: { effort: "medium" } });
  assert.deepEqual(openAiReasoningOptions({ provider: "custom", model: "gpt-5.6-luna" }, "high"), { reasoning_effort: "high" });
});

test("leaves unsupported provider requests portable", () => {
  assert.deepEqual(openAiReasoningOptions({ provider: "deepseek", model: "deepseek-chat" }, "high"), {});
});
