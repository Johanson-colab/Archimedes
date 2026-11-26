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
  assert.equal(contextCharacterLimit(supported, "extra-long"), 1_000_000);
  const unsupported = { provider: "moonshot", model: "kimi-k2.5" };
  assert.deepEqual(getModelCapabilities(unsupported).contextLengths, ["standard"]);
  assert.equal(normalizeContextLength(unsupported, "extra-long"), "standard");
  assert.equal(contextCharacterLimit(unsupported, "extra-long"), 500_000);
});

test("OpenCode Go keeps the capabilities of the same compatible model", () => {
  const go = { provider: "opencode-go", model: "gpt-5.6-luna" };
  assert.deepEqual(getModelCapabilities(go), getModelCapabilities({ ...go, provider: "custom" }));
  assert.equal(normalizeReasoningEffort(go, "high"), "high");
  assert.equal(contextCharacterLimit(go, "extra-long"), 1_000_000);
  assert.deepEqual(getModelCapabilities({ ...go, model: "hy4" }).thinkingEfforts, []);
});

test("converts a configured token window into the character-budgeting unit", () => {
  const { prepareConversation } = require("./context.cjs");
  const { boundActiveContext } = require("./active-context.cjs");
  const config = { provider: "custom", model: "fixture", contextWindowTokens: 32_768 };
  const prompt = "word ".repeat(8_000);
  const limit = contextCharacterLimit(config, "standard");
  const prepared = prepareConversation({
    thread: { turns: [{ id: "first", user_message: prompt }] },
    currentTurnId: "first",
    contextCharacterLimit: limit,
    strictContextLimit: true,
  });
  assert.equal(limit, 131_072);
  assert.deepEqual(boundActiveContext(prepared.messages, limit, { strict: true }), { removed: 0, clipped: 0 });
  assert.equal(prepared.messages.at(-1).content, prompt);
});
