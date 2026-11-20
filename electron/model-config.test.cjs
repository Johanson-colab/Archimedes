const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { extractModelIds, getActiveModelConfig, getPublicModelConfig, initializeModelConfig, listProviderModels, saveModelConfig, testModelConfig, validateModelId } = require("./model-config.cjs");

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

test("reads the legacy flat model config as the Agent role", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-model-legacy-"));
  try {
    initializeModelConfig(directory);
    fs.writeFileSync(path.join(directory, "model-config.json"), JSON.stringify({ provider: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini", apiKey: "legacy-key" }));
    assert.equal(getPublicModelConfig("agent").model, "gpt-4.1-mini");
    assert.equal(getActiveModelConfig("proactive").model, "gpt-4.1-mini");
    assert.equal(getActiveModelConfig("proactive").inheritedFromAgent, true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("a valid Custom connection can replace a malformed environment endpoint", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-model-repair-"));
  const savedBaseUrl = process.env.ARCHIMEDES_LLM_BASE_URL;
  t.after(() => {
    if (savedBaseUrl === undefined) delete process.env.ARCHIMEDES_LLM_BASE_URL;
    else process.env.ARCHIMEDES_LLM_BASE_URL = savedBaseUrl;
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const request = t.mock.method(globalThis, "fetch", async () => Response.json({ choices: [{ message: { content: "OK" } }] }));
  const replacement = { provider: "custom", baseUrl: "https://fixture.example/v1", model: "test", apiKey: "fixture-key" };
  for (const [index, oldEndpoint] of ["not a URL", "http://192.0.2.10/v1"].entries()) {
    initializeModelConfig(path.join(directory, String(index)));
    process.env.ARCHIMEDES_LLM_BASE_URL = oldEndpoint;
    assert.equal((await testModelConfig(replacement)).ok, true);
    assert.equal(saveModelConfig(replacement).baseUrl, replacement.baseUrl);
  }
  assert.deepEqual(request.mock.calls.map(({ arguments: [url, options] }) => [url, options.headers.Authorization]), [
    ["https://fixture.example/v1/chat/completions", "Bearer fixture-key"],
    ["https://fixture.example/v1/chat/completions", "Bearer fixture-key"],
  ]);
});

test("environment URLs are normalized before using their configured credentials", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-model-env-url-"));
  initializeModelConfig(directory);
  const saved = { baseUrl: process.env.ARCHIMEDES_LLM_BASE_URL, apiKey: process.env.ARCHIMEDES_LLM_API_KEY };
  t.after(() => {
    if (saved.baseUrl === undefined) delete process.env.ARCHIMEDES_LLM_BASE_URL;
    else process.env.ARCHIMEDES_LLM_BASE_URL = saved.baseUrl;
    if (saved.apiKey === undefined) delete process.env.ARCHIMEDES_LLM_API_KEY;
    else process.env.ARCHIMEDES_LLM_API_KEY = saved.apiKey;
    fs.rmSync(directory, { recursive: true, force: true });
  });
  process.env.ARCHIMEDES_LLM_BASE_URL = "https://opencode.ai/inference/go/openai/v1/";
  process.env.ARCHIMEDES_LLM_API_KEY = "fixture-key";
  const config = getPublicModelConfig();
  assert.equal(config.baseUrl, "https://opencode.ai/inference/go/openai/v1");
  assert.equal(config.provider, "opencode-go");
  assert.equal(config.hasApiKey, true);
  const request = t.mock.method(globalThis, "fetch", async () => Response.json({ data: [{ id: "test" }] }));
  assert.deepEqual((await listProviderModels({ provider: config.provider, baseUrl: config.baseUrl + "/" })).models, ["test"]);
  const { headers } = request.mock.calls[0].arguments[1];
  assert.equal(headers.Authorization, "Bearer fixture-key");
  assert.equal(headers["x-opencode-session"], "archimedes-model-catalog");
});

test("keeps the Agent and Proactive models separate and supports inheritance", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-model-roles-"));
  try {
    initializeModelConfig(directory);
    saveModelConfig({ provider: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini", apiKey: "agent-key" });
    saveModelConfig({ provider: "deepseek", baseUrl: "https://api.deepseek.com", model: "deepseek-chat", apiKey: "proactive-key" }, "proactive");
    assert.equal(getPublicModelConfig("agent").model, "gpt-4.1-mini");
    assert.equal(getPublicModelConfig("proactive").model, "deepseek-chat");
    assert.equal(getPublicModelConfig("proactive").inheritedFromAgent, false);
    assert.equal(getActiveModelConfig("proactive").apiKey, "proactive-key");

    saveModelConfig({ provider: "deepseek", baseUrl: "https://api.deepseek.com", model: "deepseek-chat", useAgent: true }, "proactive");
    assert.equal(getPublicModelConfig("proactive").model, "gpt-4.1-mini");
    assert.equal(getPublicModelConfig("proactive").source, "agent");
    assert.equal(getPublicModelConfig("proactive").inheritedFromAgent, true);
    assert.equal(getActiveModelConfig("proactive").inheritedFromAgent, true);
    assert.equal(getActiveModelConfig("proactive").apiKey, "agent-key");
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
