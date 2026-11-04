const test = require("node:test");
const assert = require("node:assert/strict");

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const model = require("./paper-review-model.cjs");
const modelConfig = require("./model-config.cjs");

const baseModel = {
  provider: "openai",
  baseUrl: "https://api.example.com/v1",
  model: "gpt-test",
  apiKey: "secret",
};

function jsonResponse(payload, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

test("extractJsonObject handles plain, fenced and chatty responses", () => {
  assert.deepEqual(model.extractJsonObject('{"a":1}'), { a: 1 });
  assert.deepEqual(model.extractJsonObject('```json\n{"a":2}\n```'), { a: 2 });
  assert.deepEqual(model.extractJsonObject('Here is the result: {"a":3} — done.'), { a: 3 });
  assert.deepEqual(model.extractJsonObject('{"a":"line one\nline two"}'), { a: "line one\nline two" });
  assert.deepEqual(model.extractJsonObject('{"a":[1,2,],}'), { a: [1, 2] });
  assert.throws(() => model.extractJsonObject("not json"), /JSON object/);
  assert.throws(() => model.extractJsonObject(""), /empty/);
});

test("OpenAI-compatible requests carry the model, messages and usage", async () => {
  let captured;
  const fetchImpl = async (url, options) => {
    captured = { url, options, body: JSON.parse(options.body) };
    return jsonResponse({
      choices: [{ message: { content: '{"ok":true}' } }],
      usage: { prompt_tokens: 11, completion_tokens: 7 },
    });
  };
  const result = await model.completeJson(baseModel, { system: "system", prompt: "prompt", fetchImpl });
  assert.deepEqual(result.json, { ok: true });
  assert.deepEqual(result.usage, { inputTokens: 11, outputTokens: 7 });
  assert.equal(captured.url, "https://api.example.com/v1/chat/completions");
  assert.equal(captured.body.model, "gpt-test");
  assert.equal(captured.body.messages[0].role, "system");
  assert.equal(captured.body.temperature, 0.2);
});

test("Anthropic requests use messages and the system field", async () => {
  let captured;
  const fetchImpl = async (url, options) => {
    captured = { url, body: JSON.parse(options.body), headers: options.headers };
    return jsonResponse({
      content: [{ type: "text", text: '{"ok":true}' }],
      usage: { input_tokens: 9, output_tokens: 4 },
    });
  };
  const result = await model.completeJson({ ...baseModel, provider: "anthropic", baseUrl: "https://api.anthropic.com/v1" }, { system: "system", prompt: "prompt", fetchImpl });
  assert.deepEqual(result.json, { ok: true });
  assert.deepEqual(result.usage, { inputTokens: 9, outputTokens: 4 });
  assert.equal(captured.url, "https://api.anthropic.com/v1/messages");
  assert.equal(captured.body.system, "system");
  assert.equal(captured.headers["x-api-key"], "secret");
});

test("malformed JSON gets one schema-preserving repair pass", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return jsonResponse({
      choices: [{ message: { content: calls === 1 ? "I cannot obey that." : '{"repaired":true}' } }],
      usage: { prompt_tokens: 5, completion_tokens: 3 },
    });
  };
  const result = await model.completeJson(baseModel, { system: "system", prompt: "prompt", fetchImpl });
  assert.deepEqual(result.json, { repaired: true });
  assert.equal(calls, 2);
  assert.equal(result.usage.inputTokens, 10);
  assert.equal(result.usage.outputTokens, 6);
});

test("reasoning endpoints that reject temperature are retried without it", async () => {
  let calls = 0;
  const fetchImpl = async (_url, options) => {
    calls += 1;
    const body = JSON.parse(options.body);
    if (calls === 1) {
      assert.equal(body.temperature, 0.2);
      return { ok: false, status: 400, text: async () => "temperature is unsupported for this model", json: async () => ({}) };
    }
    assert.equal(Object.hasOwn(body, "temperature"), false);
    return jsonResponse({ choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
  };
  const result = await model.completeJson({ ...baseModel, model: "reasoning-model" }, { system: "system", prompt: "prompt", fetchImpl });
  assert.deepEqual(result.json, { ok: true });
  assert.equal(calls, 2);
});

test("custom provider resolution validates required fields", () => {
  const custom = model.resolveReviewModel({
    model: { mode: "custom", provider: "deepseek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat", apiKey: "key" },
  });
  assert.equal(custom.source, "custom");
  assert.equal(custom.model, "deepseek-chat");
  assert.throws(() => model.resolveReviewModel({
    model: { mode: "custom", provider: "deepseek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat", apiKey: "" },
  }), /API key/);
});

test("agent mode inherits the main agent provider and model", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-paper-review-model-"));
  try {
    modelConfig.initializeModelConfig(dir);
    modelConfig.saveModelConfig({ provider: "custom", baseUrl: "https://main.example.com/v1", model: "main-agent-model", apiKey: "main-secret" }, "agent");
    const resolved = model.resolveReviewModel({ model: { mode: "agent", provider: "openai", baseUrl: "https://api.openai.com/v1", model: "", apiKey: "" } });
    assert.equal(resolved.source, "agent");
    assert.equal(resolved.model, "main-agent-model");
    assert.equal(resolved.baseUrl, "https://main.example.com/v1");
    assert.equal(resolved.apiKey, "main-secret");
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); } catch { /* best effort */ }
  }
});