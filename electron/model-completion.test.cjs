const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const agent = require("./agent.cjs");
const { completeAnthropic } = require("./agent/anthropic.cjs");
const { ToolRegistry } = require("./agent/tool-registry.cjs");
const { completeJson } = require("./paper-review-model.cjs");
const config = { provider: "custom", baseUrl: "https://completion.invalid/v1", model: "fake", apiKey: "fake-not-a-credential" };
const frame = event => `data: ${typeof event === "string" ? event : JSON.stringify(event)}\n\n`;
const delta = (content, extra = {}) => ({ choices: [{ delta: { content }, ...extra }] });

function stream(events, tail = "") {
  return new Response(new ReadableStream({ start(controller) {
    const encoder = new TextEncoder();
    for (const event of events) controller.enqueue(encoder.encode(frame(event)));
    if (tail) controller.enqueue(encoder.encode(tail));
    controller.close();
  } }), { headers: { "content-type": "text/event-stream" } });
}

function fakeFetch(t, implementation) {
  const previous = global.fetch;
  global.fetch = implementation;
  t.after(() => { global.fetch = previous; });
}

test("OpenAI stream accepts a finished text and fully assembled tool arguments, including a final unterminated SSE line", async t => {
  fakeFetch(t, async () => stream([delta("Complete text")], `data: ${JSON.stringify(delta("", { finish_reason: "stop" }))}`));
  const text = [];
  const result = await agent.complete(config, [], { onTextDelta: value => text.push(value) });
  assert.equal(result.content, "Complete text");
  assert.equal(text.join(""), "Complete text");
  global.fetch = async () => stream([
    { choices: [{ delta: { tool_calls: [{ index: 0, id: "call", function: { name: "spy", arguments: '{"value":' } }] } }] },
    { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"complete"}' } }] }, finish_reason: "tool_calls" }] },
    "[DONE]",
  ]);
  const tool = await agent.complete(config, [], {});
  assert.equal(tool.tool_calls[0].function.name, "spy");
  assert.deepEqual(JSON.parse(tool.tool_calls[0].function.arguments), { value: "complete" });
});

test("OpenAI missing finish, length, broken final frame and partial tool arguments retain text without a second request", async t => {
  let calls = 0;
  let response;
  fakeFetch(t, async () => { calls++; return response; });
  const cases = [
    { events: [delta("Partial text"), "[DONE]"], reason: "missing_terminal" },
    { events: [delta("Partial text", { finish_reason: "length" })], reason: "length" },
    { events: [delta("", { finish_reason: "length" })], reason: "length", partial: "" },
    { events: [delta("Partial text")], tail: 'data: {"choices":[', reason: "malformed_frame" },
    { events: [delta("Partial text"), { choices: [{ delta: { tool_calls: [{ index: 0, id: "half", function: { name: "spy", arguments: '{"value":' } }] }, finish_reason: "tool_calls" }] }], reason: "malformed_tool_arguments" },
  ];
  for (const scenario of cases) {
    calls = 0; response = stream(scenario.events, scenario.tail);
    await assert.rejects(agent.complete(config, [], {}), error => {
      assert.equal(error.code, "MODEL_RESPONSE_INCOMPLETE");
      assert.equal(error.reason, scenario.reason);
      assert.equal(error.partialResponse, scenario.partial ?? "Partial text");
      return true;
    });
    assert.equal(calls, 1, "a partial response must never be silently retried");
  }
});

test("Anthropic requires message_stop, a valid stop reason and closed blocks before returning tools", async t => {
  const textEvents = [
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Claude partial" } },
    { type: "content_block_stop", index: 0 },
  ];
  let events = [...textEvents, { type: "message_delta", delta: { stop_reason: "end_turn" } }, { type: "message_stop" }];
  fakeFetch(t, async () => stream(events));
  assert.equal((await completeAnthropic(config, [], {})).content, "Claude partial");
  for (const [suffix, reason] of [
    [[{ type: "message_delta", delta: { stop_reason: "end_turn" } }], "missing_terminal"],
    [[{ type: "message_delta", delta: { stop_reason: "max_tokens" } }, { type: "message_stop" }], "length"],
    [[{ type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "tool", name: "spy", input: {} } }, { type: "message_delta", delta: { stop_reason: "tool_use" } }, { type: "message_stop" }], "unfinished_content_block"],
    [[{ type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "tool", name: "spy", input: {} } }, { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"value":' } }, { type: "content_block_stop", index: 1 }], "malformed_tool_arguments"],
  ]) {
    events = [...textEvents, ...suffix];
    await assert.rejects(completeAnthropic(config, [], {}), error => error.code === "MODEL_RESPONSE_INCOMPLETE" && error.reason === reason && error.partialResponse === "Claude partial");
  }
});

test("a transport error after text retains that text and does not retry the model stream", async t => {
  let requests = 0, reads = 0;
  fakeFetch(t, async () => {
    requests++;
    return new Response(new ReadableStream({ pull(controller) {
      if (!reads++) controller.enqueue(new TextEncoder().encode(frame(delta("Before disconnect"))));
      else controller.error(new Error("test connection lost"));
    } }, { highWaterMark: 0 }), { headers: { "content-type": "text/event-stream" } });
  });
  await assert.rejects(agent.complete(config, [], {}), error => error.code === "MODEL_RESPONSE_INCOMPLETE" && error.reason === "stream_error" && error.partialResponse === "Before disconnect");
  assert.equal(requests, 1);
});

test("real agent persists incomplete text and executes none of a mixed complete/partial tool batch; a later valid turn can continue", async t => {
  const store = require("./store.cjs");
  const model = require("./model-config.cjs");
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-model-completion-")));
  store.openWorkspace(root);
  const owner = store;
  t.after(() => { fs.rmSync(root, { recursive: true, force: true }); });
  model.initializeModelConfig(path.join(root, "settings")); model.saveModelConfig(config);
  const registry = new ToolRegistry();
  let executions = 0, requests = 0;
  registry.register({ definition: { type: "function", function: { name: "spy", description: "Local fixture", parameters: { type: "object", properties: { value: { type: "string" } }, required: ["value"], additionalProperties: false } } }, source: "builtin", execute: async () => { executions++; return { content: "Executed complete fixture" }; } });
  fakeFetch(t, async () => {
    requests++;
    if (requests > 1) return stream([delta("A later complete answer", { finish_reason: "stop" }), "[DONE]"]);
    return stream([delta("Useful partial answer"), { choices: [{ delta: { tool_calls: [
      { index: 0, id: "complete", function: { name: "spy", arguments: '{"value":"first"}' } },
      { index: 1, id: "partial", function: { name: "spy", arguments: '{"value":' } },
    ] }, finish_reason: "tool_calls" }] }]);
  });
  const events = [];
  const result = await agent.runAgent({ workspace: root, prompt: "Inspect safely", toolRegistry: registry, emit: event => events.push(event) });
  assert.equal(result.status, "incomplete");
  assert.equal(result.error.code, "MODEL_RESPONSE_INCOMPLETE");
  assert.equal(executions, 0);
  assert.equal(requests, 1);
  assert.match(result.response, /Useful partial answer/);
  assert.equal(result.thread.status, "error");
  assert.equal(result.thread.turns[0].status, "incomplete");
  assert.match(owner.getSnapshot().tasks[0].response, /Useful partial answer/);
  assert.ok(result.thread.events.some(event => event.type === "model_incomplete"));
  assert.ok(events.some(event => event.type === "incomplete"));
  assert.equal(events.some(event => event.type === "complete"), false);
  // Exercise the actual turn/event serializer and cloud import with this new
  // status. Updating an already-published running turn is a separate C01 fix.
  const { createThreadSync } = require("./thread-sync.cjs");
  owner.linkResearchProjectToCloud(result.thread.project_id, "fixture-cloud-project");
  const remote = { thread: null, turns: [], events: [] };
  const api = {
    saveThread: async (_project, thread) => { remote.thread = { ...thread }; },
    getThread: async () => remote,
    saveTurn: async (_thread, turn) => { remote.turns.push({ ...turn }); },
    saveEvents: async (_thread, batch) => { remote.events.push(...batch); },
    listComments: async () => [], listThreads: async () => [],
  };
  assert.deepEqual((await createThreadSync({ store: owner, api }).syncProjectThreads(result.thread.project_id, { localUserId: "local-user" })).warnings, []);
  assert.equal(remote.thread.status, "error");
  assert.equal(remote.turns[0].status, "incomplete");
  assert.ok(remote.events.some(event => event.type === "model_incomplete"));
  const importRoot = path.join(root, "imported"); fs.mkdirSync(importRoot);
  store.openWorkspace(importRoot);
  const imported = store;
  imported.applyCloudThread(imported.getSnapshot().projects[0].id, remote);
  assert.equal(imported.getResearchThread(result.threadId).turns[0].status, "incomplete");
  assert.match(imported.getResearchThread(result.threadId).turns[0].assistant_message, /Useful partial answer/);
  store.openWorkspace(root);
  const continued = await agent.runAgent({ workspace: root, threadId: result.threadId, prompt: "Continue", toolRegistry: registry });
  assert.equal(continued.status, "completed");
  assert.equal(continued.thread.turns[0].status, "incomplete");
  assert.equal(continued.thread.turns[1].assistant_message, "A later complete answer");
});

test("JSON review/planner refuses truncated but parseable output before its single JSON repair pass", async () => {
  for (const provider of ["openai", "anthropic"]) {
    let requests = 0;
    await assert.rejects(completeJson({ ...config, provider }, { system: "fixture", prompt: "fixture", fetchImpl: async () => {
      requests++;
      return { ok: true, json: async () => provider === "anthropic"
        ? { stop_reason: "max_tokens", content: [{ type: "text", text: '{"incomplete":true}' }] }
        : { choices: [{ finish_reason: "length", message: { content: '{"incomplete":true}' } }] } };
    } }), error => error.code === "MODEL_RESPONSE_INCOMPLETE" && error.partialResponse === '{"incomplete":true}');
    assert.equal(requests, 1);
  }
});
