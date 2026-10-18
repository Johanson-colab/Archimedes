const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { extractModelIds, getPublicModelConfig, initializeModelConfig, listProviderModels, saveModelConfig, testModelConfig, validateModelId } = require("./model-config.cjs");

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

test("accepts new providers without reusing another provider's API key", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-model-"));
  try {
    initializeModelConfig(directory);
    saveModelConfig({ provider: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini", apiKey: "openai-key" });
    assert.throws(() => saveModelConfig({ provider: "anthropic", baseUrl: "https://api.anthropic.com/v1", model: "claude-sonnet-4-6" }), /valid API key/);
    saveModelConfig({ provider: "anthropic", baseUrl: "https://api.anthropic.com/v1", model: "claude-sonnet-4-6", apiKey: "anthropic-key" });
    assert.equal(getPublicModelConfig().provider, "anthropic");
    assert.equal(getPublicModelConfig().hasApiKey, true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("Anthropic model listing and connection test use native API paths", async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, request) => {
    calls.push({ url, request });
    return { ok: true, json: async () => url.endsWith("/models")
      ? { data: [{ id: "claude-sonnet-4-6" }] }
      : { model: "claude-sonnet-4-6", content: [{ type: "text", text: "OK" }] } };
  };
  try {
    const input = { provider: "anthropic", baseUrl: "https://api.anthropic.com/v1", model: "claude-sonnet-4-6", apiKey: "test-key" };
    assert.deepEqual((await listProviderModels(input)).models, ["claude-sonnet-4-6"]);
    assert.equal((await testModelConfig(input)).ok, true);
    assert.equal(calls[0].request.headers["anthropic-version"], "2023-06-01");
    assert.equal(calls[0].request.headers["x-api-key"], "test-key");
    assert.equal(calls[0].request.headers.Authorization, undefined);
    assert.equal(calls[1].url, "https://api.anthropic.com/v1/messages");
    assert.equal(calls[1].request.headers["x-api-key"], "test-key");
    assert.equal(calls[1].request.headers.Authorization, undefined);
    assert.equal(JSON.parse(calls[1].request.body).max_tokens, 32);
  } finally { global.fetch = originalFetch; }
});
