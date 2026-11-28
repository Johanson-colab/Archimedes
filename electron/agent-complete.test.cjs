const assert = require("node:assert/strict");
const { createServer } = require("node:http");
const test = require("node:test");
const { complete } = require("./agent.cjs");

function successfulResponse() {
  return {
    ok: true,
    headers: { get: () => "application/json" },
    json: async () => ({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: "OK" } }] }),
  };
}

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

test("makes one non-streaming request when the endpoint explicitly refuses streaming", async t => {
  const requests = [];
  const server = createServer(async (request, response) => {
    let input = "";
    for await (const chunk of request) input += chunk;
    const { stream } = JSON.parse(input);
    requests.push([request.method, stream]);
    response.writeHead(stream ? 400 : 200, { "content-type": "application/json" });
    response.end(JSON.stringify(stream ? { error: { message: "Streaming is not supported." } } : await successfulResponse().json()));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
  const result = await complete({ provider: "custom", baseUrl, model: "compat-model", apiKey: "test-key" },
    [{ role: "user", content: "Reply with OK." }], { allowTools: false, maxOutputTokens: 128, onTextDelta: () => {} });
  assert.equal(result.content, "OK");
  assert.deepEqual(requests, [["POST", true], ["POST", false]]);
});

test("completes without a text callback, as the proactive agent does", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.stream) return { ok: false, status: 422, text: async () => "Unsupported parameter: 'stream'." };
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
