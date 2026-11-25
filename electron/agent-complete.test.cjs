const assert = require("node:assert/strict");
const test = require("node:test");
const { complete } = require("./agent.cjs");

function successfulResponse() {
  return {
    ok: true,
    headers: { get: () => "application/json" },
    json: async () => ({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: "OK" } }] }),
  };
}

test("Luna sends the tool-compatible reasoning effort on its first OpenAI chat request", async (t) => {
  const tools = [{ type: "function", function: { name: "lookup", parameters: { type: "object", properties: {} } } }];
  const requests = [];
  t.mock.method(global, "fetch", async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return successfulResponse();
  });
  for (const [model, endpoint, availableTools, expected] of [
    ["gpt-6-luna", "https://api.openai.com/v1", tools, "none"],
    ["gpt-6-luna", "https://api.openai.com/v1", [], "high"],
    ["gpt-5", "https://api.openai.com/v1", tools, "high"],
    ["gpt-6-luna", "https://gateway.example/v1", tools, "high"],
  ]) {
    const config = { provider: "openai", baseUrl: endpoint, model, apiKey: "test-key" };
    await complete(config, [{ role: "user", content: "Test" }], { availableTools, reasoningEffort: "high" });
    assert.equal(requests.length, 1);
    const body = requests.pop();
    assert.equal(body.reasoning_effort, expected);
    assert.deepEqual(body.tools ?? [], availableTools);
  }
});

test("Luna tool requests surface other OpenAI errors without dropping the required effort", async (t) => {
  const fetch = t.mock.method(global, "fetch", async () => new Response("Invalid tool schema", { status: 400 }));
  const config = { provider: "openai", model: "gpt-6-luna", baseUrl: "https://api.openai.com/v1", apiKey: "test-key" };
  await assert.rejects(complete(config, [{ role: "user", content: "Test" }]), /Invalid tool schema/);
  assert.equal(fetch.mock.callCount(), 1);
});

test("large tool-free reconstruction requests reject truncated model output", async () => {
  const originalFetch = global.fetch;
  let sent;
  global.fetch = async (_url, options) => {
    sent = JSON.parse(options.body);
    return { ok: true, headers: { get: () => "application/json" }, json: async () => ({ choices: [{ message: { role: "assistant", content: "{}" }, finish_reason: "length" }] }) };
  };
  try {
    const config = { provider: "custom", baseUrl: "https://example.test/v1", model: "vision", apiKey: "test-key" };
    await assert.rejects(complete(config, [{ role: "user", content: "Test" }], { allowTools: false, maxOutputTokens: 32768, allowLargeOutput: true, requireComplete: true }), /truncated/);
    assert.equal(sent.max_tokens, 32768);
    await assert.rejects(complete(config, [{ role: "user", content: "Test" }], { allowTools: false, maxOutputTokens: 32768 }), /truncated/);
    assert.equal(sent.max_tokens, 8192);
  } finally { global.fetch = originalFetch; }
});

test("retries OpenAI-compatible models with max_completion_tokens when requested", async () => {
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    if (requests.length === 1) return {
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: { message: "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead." } }),
    };
    return successfulResponse();
  };
  try {
    const result = await complete({ provider: "custom", baseUrl: "https://example.test/v1", model: "compat-model", apiKey: "test-key" },
      [{ role: "user", content: "Reply with OK." }], { allowTools: false, maxOutputTokens: 128, onTextDelta: () => {} });
    assert.equal(result.content, "OK");
    assert.equal(requests[0].max_tokens, 128);
    assert.equal(requests[1].max_tokens, undefined);
    assert.equal(requests[1].max_completion_tokens, 128);
  } finally { global.fetch = originalFetch; }
});

test("retries a nonstandard empty stream as a non-streaming completion", async () => {
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    if (body.stream) {
      const encoder = new TextEncoder();
      return {
        ok: true,
        headers: { get: () => "text/event-stream" },
        body: new ReadableStream({ start(controller) { controller.enqueue(encoder.encode('data: {"type":"response.output_text.delta","delta":"OK"}\n\n')); controller.close(); } }),
      };
    }
    return successfulResponse();
  };
  try {
    const result = await complete({ provider: "custom", baseUrl: "https://example.test/v1", model: "compat-model", apiKey: "test-key" },
      [{ role: "user", content: "Reply with OK." }], { allowTools: false, maxOutputTokens: 128, onTextDelta: () => {} });
    assert.equal(result.content, "OK");
    assert.equal(requests.length, 2);
    assert.equal(requests[0].stream, true);
    assert.equal(requests[1].stream, false);
  } finally { global.fetch = originalFetch; }
});

test("completes without a text callback, as the proactive agent does", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.stream) {
      const encoder = new TextEncoder();
      return {
        ok: true,
        headers: { get: () => "text/event-stream" },
        body: new ReadableStream({ start(controller) { controller.enqueue(encoder.encode('data: {"type":"response.output_text.delta","delta":"OK"}\n\n')); controller.close(); } }),
      };
    }
    return successfulResponse();
  };
  try {
    const result = await complete({ provider: "custom", baseUrl: "https://example.test/v1", model: "compat-model", apiKey: "test-key" },
      [{ role: "user", content: "Reply with OK." }], { allowTools: false, maxOutputTokens: 128 });
    assert.equal(result.content, "OK");
  } finally { global.fetch = originalFetch; }
});

test('model requests retry rate limits without rerunning any tool', async () => {
  const originalFetch = global.fetch;
  let requests = 0;
  global.fetch = async () => {
    requests++;
    if (requests === 1) return { ok: false, status: 429, headers: { get: key => key === 'retry-after' ? '0' : null }, body: { cancel: async () => {} } };
    return successfulResponse();
  };
  try {
    const response = await complete({ provider: 'custom', baseUrl: 'https://example.test/v1', model: 'fixture', apiKey: 'test' }, [{ role: 'user', content: 'test' }], {});
    assert.equal(response.content, 'OK');
    assert.equal(requests, 2);
  } finally { global.fetch = originalFetch; }
});
