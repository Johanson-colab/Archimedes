const assert = require("node:assert/strict");
const test = require("node:test");
const { complete } = require("./agent.cjs");

function successfulResponse() {
  return {
    ok: true,
    headers: { get: () => "application/json" },
    json: async () => ({ choices: [{ message: { role: "assistant", content: "OK" } }] }),
  };
}

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
