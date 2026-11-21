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
  await assert.rejects(agent.complete(config, [], {}), error => error.code === "MODEL_RESPONSE_INCOMPLETE" && error.reason === "stream_error" && error.partialResponse === "Before disconnect" && error.message === "test connection lost");
  assert.equal(requests, 1);
});

test("provider stream errors preserve partial answers and keep header values out of saved failures", async t => {
  const store = require("./store.cjs");
  const model = require("./model-config.cjs");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-stream-secret-"));
  store.openWorkspace(root);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  model.initializeModelConfig(path.join(root, "settings"));

  const gatewayToken = "DUMMY_GATEWAY_TOKEN";
  const sessionToken = "DUMMY_FIXED_SESSION";
  const message = `Gateway rejected ${gatewayToken} and ${sessionToken}`;
  let frameError, partial, terminal;
  let requests = 0;
  fakeFetch(t, async (_url, { headers }) => {
    requests++;
    assert.equal(headers["X-Gateway-Token"], gatewayToken);
    assert.equal(headers["X-Session"], sessionToken);
    return stream(terminal ? [partial, ...terminal] : [partial, frameError]);
  });
  for (const provider of ["custom", "anthropic"]) {
    model.saveModelConfig({ ...config, provider, headers: { "X-Gateway-Token": gatewayToken }, sessionHeader: { name: "X-Session", strategy: "fixed", value: sessionToken } });
    frameError = provider === "anthropic" ? { type: "error", error: { message } } : { error: { message } };
    partial = provider === "anthropic" ? { type: "content_block_start", index: 0, content_block: { type: "text", text: "Useful partial answer" } } : delta("Useful partial answer");
    const result = await agent.runAgent({ workspace: root, prompt: "Inspect the fixture" });
    assert.equal(result.status, "incomplete");
    assert.match(result.response, /Useful partial answer/);
    assert.match(result.response, /incomplete \(stream_error\).*Continue in this chat to retry/);
    assert.doesNotMatch(JSON.stringify(store.getResearchThread(result.threadId)), /DUMMY_GATEWAY_TOKEN|DUMMY_FIXED_SESSION/);

    terminal = provider === "anthropic"
      ? [{ type: "message_delta", delta: { stop_reason: gatewayToken } }, { type: "message_stop" }]
      : [delta("", { finish_reason: gatewayToken })];
    const unexpectedStop = await agent.runAgent({ workspace: root, prompt: "Inspect the fixture's completion metadata" });
    assert.equal(unexpectedStop.error.reason, "unsupported_stop_reason");
    assert.doesNotMatch(JSON.stringify(store.getResearchThread(unexpectedStop.threadId)), /DUMMY_GATEWAY_TOKEN/);
    terminal = null;
  }
  assert.equal(requests, 4);
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

test("real Agent requests reserve tool schemas, provider structure and output tokens within the profile window", async t => {
  const http = require("node:http");
  const store = require("./store.cjs");
  const model = require("./model-config.cjs");
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-request-budget-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  store.openWorkspace(root);
  model.initializeModelConfig(path.join(root, "settings"));
  const fixture = JSON.stringify(Array(2000).fill("abcd"));
  fs.writeFileSync(path.join(root, "fixture.json"), fixture);
  let requests = [];
  const server = http.createServer(async (request, response) => {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw);
    requests.push({ raw, body });
    const anthropic = request.url.endsWith("/messages");
    const name = "read_workspace_file";
    const args = { path: "fixture.json" };
    const answer = "The local request stayed within its configured estimate.";
    const first = requests.length === 1;
    const result = anthropic
      ? first
        ? { stop_reason: "tool_use", content: [{ type: "tool_use", id: "fixture-result", name, input: args }] }
        : { stop_reason: "end_turn", content: [{ type: "text", text: answer }] }
      : { choices: [{ finish_reason: first ? "tool_calls" : "stop", message: first
        ? { role: "assistant", content: "", tool_calls: [{ type: "function", id: "fixture-result", function: { name, arguments: JSON.stringify(args) } }] }
        : { role: "assistant", content: answer } }] };
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(result));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));

  const contextWindowTokens = 12_000;
  const maxOutputTokens = 321;
  for (const provider of ["custom", "anthropic"]) {
    requests = [];
    model.saveModelConfig({ ...config, provider, baseUrl: `http://127.0.0.1:${server.address().port}/v1`, contextWindowTokens, maxOutputTokens });
    const thread = store.createResearchThread({ prompt: "Review the local fixture", mode: "standard", workspacePath: root });
    for (let index = 0; index < 20; index++) {
      const turn = store.startResearchTurn({ threadId: thread.id, prompt: `Prior research question ${index}`, mode: "standard" });
      store.finishResearchTurn(turn.id, { response: "x".repeat(51_000) });
    }

    const result = await agent.runAgent({ threadId: thread.id, workspace: root, prompt: "Read fixture.json and summarize.", autoBuildGraph: false });
    assert.equal(result.status, "completed", result.response);
    assert.equal(requests.length, 2);
    for (const { raw, body } of requests) {
      assert.ok(body.tools.length >= 20, "keep the actual built-in tool schemas");
      assert.equal(body.max_tokens, maxOutputTokens);
      assert.ok(raw.length + 4 * body.max_tokens <= 4 * contextWindowTokens, `${provider} request consumed ${raw.length + 4 * body.max_tokens} estimated characters`);
    }
    const messages = requests[1].body.messages;
    const toolResult = provider === "anthropic"
      ? messages.flatMap(message => message.content).find(block => block.tool_use_id === "fixture-result")
      : messages.find(message => message.tool_call_id === "fixture-result");
    assert.ok(toolResult);
    assert.match(toolResult.content, /abcd/);
    t.diagnostic(`${provider} serialized request lengths: ${requests.map(request => request.raw.length).join(", ")}; output reserve: ${4 * maxOutputTokens}`);
  }
});

test("a fixed prompt that cannot fit emits and persists a stable context-budget error before sending a request", async t => {
  const store = require("./store.cjs");
  const model = require("./model-config.cjs");
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-fixed-context-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  store.openWorkspace(root);
  model.initializeModelConfig(path.join(root, "settings"));
  model.saveModelConfig({ ...config, contextWindowTokens: 6_000, maxOutputTokens: 321 });
  let requests = 0;
  fakeFetch(t, async () => { requests++; throw new Error("No request should have been sent"); });
  const events = [];
  const result = await agent.runAgent({ workspace: root, prompt: "Review the local evidence. ".repeat(1000), emit: event => events.push(event) });
  assert.equal(result.status, "failed");
  assert.deepEqual(result.error, { code: "MODEL_CONTEXT_BUDGET_EXCEEDED" });
  assert.equal(requests, 0);
  assert.match(result.response, /^The active prompt exceeds this model profile's context budget/);
  assert.deepEqual(events.find(event => event.type === "failed").error, result.error);
  assert.equal(events.find(event => event.type === "failed").detail, result.response);
  const saved = store.getResearchThread(result.threadId);
  assert.deepEqual(saved.events.find(event => event.type === "context_budget_exceeded").payload, result.error);
  assert.equal(saved.turns.at(-1).assistant_message, result.response);
});
