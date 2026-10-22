const assert = require("node:assert/strict");
const test = require("node:test");
const { contextCharacterLimit, getModelCapabilities, normalizeContextLength, normalizeReasoningEffort } = require("./model-capabilities.cjs");

test("advertises only native thinking effort controls for known compatible models", () => {
  assert.deepEqual(getModelCapabilities({ provider: "openai", model: "gpt-5.6-sol" }).thinkingEfforts, ["low", "medium", "high"]);
  assert.deepEqual(getModelCapabilities({ provider: "custom", model: "deepseek-chat" }).thinkingEfforts, []);
  assert.equal(normalizeReasoningEffort({ provider: "custom", model: "deepseek-chat" }, "high"), "medium");
});

test("uses a conservative context-length capability and character cap", () => {
  const supported = { provider: "openai", model: "gpt-4.1-mini" };
  assert.deepEqual(getModelCapabilities(supported).contextLengths, ["standard", "extra-long"]);
  assert.equal(contextCharacterLimit(supported, "extra-long"), 600_000);
  const unsupported = { provider: "moonshot", model: "kimi-k2.5" };
  assert.deepEqual(getModelCapabilities(unsupported).contextLengths, ["standard"]);
  assert.equal(normalizeContextLength(unsupported, "extra-long"), "standard");
  assert.equal(contextCharacterLimit(unsupported, "extra-long"), 300_000);
});
