const assert = require("node:assert/strict");
const test = require("node:test");
const { extractModelIds, validateModelId } = require("./model-config.cjs");

test("requires provider-qualified model IDs for OpenRouter", () => {
  assert.throws(
    () => validateModelId("https://openrouter.ai/api/v1", "gpt-5.6-terra"),
    /openai\/gpt-5\.6-terra/,
  );
  assert.equal(
    validateModelId("https://openrouter.ai/api/v1", "openai/gpt-5.6-terra"),
    "openai/gpt-5.6-terra",
  );
});

test("allows endpoint-specific model IDs for custom proxies", () => {
  assert.equal(
    validateModelId("https://api.openai-proxy.org/v1", "deepseek-v4-flash"),
    "deepseek-v4-flash",
  );
});

test("extracts model identifiers from OpenAI and Model Studio catalog shapes", () => {
  assert.deepEqual(extractModelIds({ data: [{ id: "gpt-5.6-sol" }, { id: "gpt-5.6-terra" }] }), ["gpt-5.6-sol", "gpt-5.6-terra"]);
  assert.deepEqual(extractModelIds({ output: { models: [{ model: "qwen3.8-max" }, { model: "qwen3.7-flash" }] } }), ["qwen3.7-flash", "qwen3.8-max"]);
});
