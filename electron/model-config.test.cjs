const assert = require("node:assert/strict");
const test = require("node:test");
const { validateModelId } = require("./model-config.cjs");

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
