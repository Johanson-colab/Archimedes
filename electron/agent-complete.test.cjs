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

const official = { provider: "openai", model: "gpt-6.2-sol", baseUrl: "https://api.openai.com/v1", apiKey: "test-key" };
const lookup = { type: "function", function: { name: "lookup", parameters: { type: "object", properties: {} } } };
const prompt = [{ role: "user", content: "Test" }];
const textOutput = [{ type: "message", content: [{ type: "output_text", text: "OK" }] }];

test("Work selects the documented endpoint and reasoning controls without changing gateway requests", async t => {
  const requests = [];
  t.mock.method(global, "fetch", async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return url.endsWith("/responses") ? Response.json({ status: "completed", output: textOutput }) : successfulResponse();
  });
  for (const [model, baseUrl, endpoint, effort, stream] of [
    ["gpt-6.2-sol", official.baseUrl, "responses", "high", true],
    ["gpt-6.2-astra", official.baseUrl, "responses", "high", true],
    ["gpt-6.1-terra", official.baseUrl, "responses", "high", true],
    ["gpt-6-luna", official.baseUrl, "responses", "high", true],
    ["gpt-5.5-pro-2026-04-23", official.baseUrl, "responses", "high", false],
    ["gpt-4o-mini", official.baseUrl, "chat/completions", undefined, true],
    ["gpt-6.2-sol", "https://gateway.example/v1", "chat/completions", "high", true],
  ]) {
    const result = await complete({ ...official, model, baseUrl }, prompt, { availableTools: [lookup], reasoningEffort: "high" });
    assert.equal(result.content, "OK");
    assert.equal(requests.length, 1);
    const { url, body } = requests.pop();
    assert.equal(url, baseUrl + "/" + endpoint);
    assert.equal(body.reasoning?.effort ?? body.reasoning_effort, effort);
    assert.equal(body.stream, stream);
    if (endpoint === "responses") {
      assert.equal(body.store, false);
      assert.deepEqual(body.tools[0], { type: "function", ...lookup.function, strict: false });
    } else assert.deepEqual(body.tools, [lookup]);
  }
});

test("Responses replays reasoning and call IDs in memory and streams the final text once", async t => {
  const calls = [{ type: "reasoning", id: "rs_fixture", encrypted_content: "opaque", summary: [] },
    { type: "function_call", id: "fc_fixture", call_id: "call_lookup", name: "lookup", arguments: "{}", status: "completed" }];
  const posts = [];
  t.mock.method(global, "fetch", async (_url, options) => {
    posts.push(JSON.parse(options.body));
    if (posts.length === 1) return Response.json({ status: "completed", output: calls });
    const events = [{ type: "response.output_text.delta", delta: "O" }, { type: "response.output_text.delta", delta: "K" },
      { type: "response.completed", response: { status: "completed", output: textOutput } }];
    return new Response(events.map(event => "data: " + JSON.stringify(event)).join("\r\n\r\n"), { headers: { "content-type": "text/event-stream" } });
  });
  const step = await complete(official, prompt, { availableTools: [lookup] });
  const deltas = [];
  const final = await complete(official, [...prompt, { role: "assistant", ...step }, { role: "tool", tool_call_id: step.tool_calls[0].id, content: "42" }],
    { onTextDelta: text => deltas.push(text) });
  assert.deepEqual(posts[1].input.slice(1), [...calls, { type: "function_call_output", call_id: "call_lookup", output: "42" }]);
  assert.deepEqual(deltas, ["O", "K"]);
  assert.equal(final.content, "OK");
});

test("Responses surfaces an incomplete stream and a rejected schema without another POST", async t => {
  let response;
  const fetch = t.mock.method(global, "fetch", async () => response);
  response = new Response('data: {"type":"response.output_text.delta","delta":"partial"}\n\n', { headers: { "content-type": "text/event-stream" } });
  await assert.rejects(complete(official, prompt), e => e.code === "MODEL_RESPONSE_INCOMPLETE" && e.partialResponse === "partial");
  response = Response.json({ error: { message: "Invalid tool schema" } }, { status: 400 });
  await assert.rejects(complete(official, prompt), /Invalid tool schema/);
  assert.equal(fetch.mock.callCount(), 2);
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
