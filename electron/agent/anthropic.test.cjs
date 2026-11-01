const assert = require("node:assert/strict");
const test = require("node:test");
const { completeAnthropic, toAnthropicRequest } = require("./anthropic.cjs");

test("large reconstruction output is opt-in and rejects Anthropic truncation", async () => {
  const request = toAnthropicRequest({ model: "vision" }, [], { allowTools: false, allowLargeOutput: true, maxOutputTokens: 32768 });
  assert.equal(request.max_tokens, 32768);
  assert.equal(toAnthropicRequest({ model: "vision" }, [], { allowTools: false, maxOutputTokens: 32768 }).max_tokens, 8192);
  const original = global.fetch;
  global.fetch = async () => ({ ok: true, headers: { get: () => "application/json" }, json: async () => ({ stop_reason: "max_tokens", content: [{ type: "text", text: "{}" }] }) });
  try {
    await assert.rejects(completeAnthropic({ baseUrl: "https://example.test", model: "vision", apiKey: "test" }, [], { requireComplete: true }), /truncated/);
  } finally { global.fetch = original; }
});

test("translates tool calls and results into Anthropic message blocks", () => {
  const request = toAnthropicRequest({ model: "claude-sonnet-4-6" }, [
    { role: "system", content: "Research carefully." },
    { role: "user", content: "Search this." },
    { role: "assistant", content: "", tool_calls: [{ id: "toolu_1", function: { name: "web_search", arguments: '{"query":"test"}' } }] },
    { role: "tool", tool_call_id: "toolu_1", content: '{"results":[]}' },
  ], { availableTools: [{ function: { name: "web_search", description: "Search", parameters: { type: "object" } } }] });
  assert.equal(request.system, "Research carefully.");
  assert.equal(request.tools[0].input_schema.type, "object");
  assert.equal(request.messages[1].content[0].type, "tool_use");
  assert.deepEqual(request.messages[2].content[0], { type: "tool_result", tool_use_id: "toolu_1", content: '{"results":[]}' });
});

test("streams Anthropic text and tool input as normalized agent calls", async () => {
  const originalFetch = global.fetch;
  let request;
  const frames = [
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Checking" } },
    { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "toolu_1", name: "web_search", input: {} } },
    { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"query":"test"}' } },
    { type: "content_block_stop", index: 1 },
  ];
  const encoder = new TextEncoder();
  global.fetch = async (_url, options) => {
    request = options;
    return { ok: true, headers: { get: () => "text/event-stream" }, body: new ReadableStream({ start(controller) { controller.enqueue(encoder.encode(frames.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""))); controller.close(); } }) };
  };
  try {
    const deltas = [];
    const result = await completeAnthropic({ baseUrl: "https://api.anthropic.com/v1", model: "claude-sonnet-4-6", apiKey: "test" }, [{ role: "user", content: "Search" }], { onTextDelta: (delta) => deltas.push(delta) });
    assert.deepEqual(deltas, ["Checking"]);
    assert.equal(result.content, "Checking");
    assert.deepEqual(JSON.parse(result.tool_calls[0].function.arguments), { query: "test" });
    assert.equal(request.headers["x-api-key"], "test");
    assert.equal(request.headers.Authorization, undefined);
  } finally { global.fetch = originalFetch; }
});
