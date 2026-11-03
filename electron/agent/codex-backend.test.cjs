const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { PassThrough, Writable } = require("node:stream");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { CodexClient } = require("./codex-client.cjs");
const { runCodex, canResume, nativeContext } = require("./codex-backend.cjs");

function fixture(handler) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.exitCode = null;
  child.kill = () => { child.exitCode = 0; child.emit("exit", 0); };
  child.stdin = new Writable({ write(chunk, _encoding, callback) {
    handler(JSON.parse(chunk.toString()), (value) => child.stdout.write(`${JSON.stringify(value)}\n`), child);
    callback();
  } });
  return child;
}

test("stdio protocol correlates replies and refuses unknown requests without shell", async () => {
  const calls = [];
  const client = new CodexClient({ spawnImpl: (_bin, args, options) => {
    assert.equal(options.shell, undefined);
    assert.deepEqual(args, ["app-server", "--listen", "stdio://"]);
    return fixture((message, send) => { calls.push(message); if (message.method === "initialize") send({ id: message.id, result: {} }); });
  } });
  await client.start();
  client.unsupported("server-1");
  assert.equal(calls.at(-1).error.code, -32601);
  client.close();
  assert.equal(client.pending.size, 0);
});

test("RPC timeouts do not replay and process exit rejects pending requests", async () => {
  const calls = [];
  let child;
  const client = new CodexClient({ requestTimeout: 20, spawnImpl: () => child = fixture((message, send) => {
    calls.push(message);
    if (message.method === "initialize") send({ id: message.id, result: {} });
  }) });
  await client.start();
  await assert.rejects(client.request("turn/start"), /timed out/);
  assert.equal(calls.filter((item) => item.method === "turn/start").length, 1);
  const pending = client.request("thread/resume");
  child.kill();
  await assert.rejects(pending, /not replayed/);
});

test("invalid and oversized protocol input fails closed", async () => {
  const client = new CodexClient({ spawnImpl: () => fixture((message, send) => { if (message.method === "initialize") send({ id: message.id, result: {} }); }) });
  await client.start();
  client.read("not-json\n");
  assert.equal(client.closed, true);
  const other = new CodexClient();
  other.read("x".repeat(8_000_001));
  assert.equal(other.closed, true);
});

test("only identical successful local history can resume; forks, undo and dirty delivery cannot", () => {
  const binding = { native_thread_id: "native", workspace: "/w", model: "", last_turn_id: "last" };
  const current = { workspace: "/w", model: "", previousTurnId: "last" };
  assert.equal(canResume(binding, current), true);
  for (const candidate of [undefined, { ...binding, workspace: "/other" }, { ...binding, model: "other" }, { ...binding, last_turn_id: null }]) assert.equal(canResume(candidate, current), false);
  assert.equal(canResume(binding, { ...current, previousTurnId: "undone" }), false);
  assert.equal(canResume({ ...binding, last_turn_id: null }, { ...current, previousTurnId: null }), false);
  assert.throws(() => nativeContext([{ type: "skill" }]), /does not yet support/);
});

function fakeClient(scenario = "success", onClient = () => {}) {
  return class extends EventEmitter {
    constructor() { super(); this.requests = []; this.replies = []; onClient(this); }
    async start() { return this; }
    async request(method, params) {
      this.requests.push({ method, params });
      if (method === "account/read") return { account: { type: "chatgpt" } };
      if (method.startsWith("thread/")) return { thread: { id: "native-thread" } };
      if (method === "turn/start") {
        setImmediate(() => {
          const send = (method, params = {}) => this.emit("message", { method, params: { threadId: "native-thread", turnId: "native-turn", ...params } });
          send("item/agentMessage/delta", { threadId: "other-thread", itemId: "foreign", delta: "secret" });
          if (scenario === "approval") {
            send("item/started", { item: { id: "cmd", type: "commandExecution", command: "echo approved" } });
            this.emit("message", { id: 91, method: "item/commandExecution/requestApproval", params: { threadId: "native-thread", turnId: "native-turn", itemId: "cmd" } });
          } else if (scenario === "exit") {
            send("item/agentMessage/delta", { itemId: "answer", delta: "partial" });
            this.emit("closed", new Error("process exited"));
          } else if (scenario === "unknown") {
            this.emit("message", { id: 92, method: "item/permissions/requestApproval", params: { threadId: "native-thread", turnId: "native-turn" } });
          } else {
            send("item/agentMessage/delta", { itemId: "answer", delta: "hello" });
            send("item/completed", { item: { id: "answer", type: "agentMessage", text: "hello" } });
            send("turn/completed", { turn: { id: "native-turn", status: scenario === "failed" ? "failed" : "completed" } });
          }
        });
        return { turn: { id: "native-turn" } };
      }
      return {};
    }
    respond(id, result) { this.replies.push({ id, result }); this.complete(); }
    unsupported(id) { this.replies.push({ id, denied: true }); this.complete(); }
    complete() {
      this.emit("message", { method: "item/agentMessage/delta", params: { threadId: "native-thread", turnId: "native-turn", itemId: "answer", delta: "hello" } });
      this.emit("message", { method: "turn/completed", params: { threadId: "native-thread", turn: { id: "native-turn", status: "completed" } } });
    }
    close() { this.closed = true; }
  };
}

function input(Client) {
  const events = [];
  const writes = [];
  return { config: { binary: "codex", model: "" }, workspace: os.tmpdir(), thread: { turns: [{ id: "local-turn" }] }, turn: { id: "local-turn" }, context: { messages: [{ role: "system", content: "Be precise" }, { role: "user", content: "hello" }] }, contextItems: [], signal: new AbortController().signal,
    emit: (event) => events.push(event), recordEvent: () => {}, approve: async () => false,
    bindings: { get: () => null, save: (value) => writes.push(value) }, Client, events, writes };
}

test("streaming uses restricted policy, rejects foreign events and persists only completed continuity", async () => {
  let client;
  const args = input(fakeClient("success", (value) => { client = value; }));
  assert.equal(await runCodex(args), "hello");
  assert.equal(args.writes[0].last_turn_id, null);
  assert.equal(args.writes.at(-1).last_turn_id, "local-turn");
  assert.equal(client.requests.find((item) => item.method === "thread/start").params.sandbox, "read-only");
  const turn = client.requests.find((item) => item.method === "turn/start").params;
  assert.equal(turn.approvalPolicy, "untrusted");
  assert.equal(turn.approvalsReviewer, "user");
  assert.equal(client.closed, true);
  assert.equal(args.events.filter((event) => event.delta).map((event) => event.delta).join(""), "hello");
});

test("native approval is returned once and denied unless explicitly approved", async () => {
  for (const approved of [false, true]) {
    let client;
    const args = input(fakeClient("approval", (value) => { client = value; }));
    let count = 0;
    args.approve = async (payload) => { count++; assert.equal(payload.command, "echo approved"); return approved; };
    assert.equal(await runCodex(args), "hello");
    assert.equal(count, 1);
    assert.deepEqual(client.replies, [{ id: 91, result: { decision: approved ? "accept" : "decline" } }]);
  }
});

test("unsupported server requests are denied; failed/uncertain turns preserve partial text without continuity", async () => {
  let client;
  await runCodex(input(fakeClient("unknown", (value) => { client = value; })));
  assert.deepEqual(client.replies, [{ id: 92, denied: true }]);
  for (const scenario of ["exit", "failed"]) {
    const args = input(fakeClient(scenario));
    await assert.rejects(runCodex(args), (error) => { assert.ok(error.partialResponse); return true; });
    assert.equal(args.writes.length, 1);
    assert.equal(args.writes[0].last_turn_id, null);
  }
});

test("abort stops the native turn and closes the child", async () => {
  let client;
  const args = input(fakeClient("approval", (value) => { client = value; }));
  const controller = new AbortController();
  args.signal = controller.signal;
  args.approve = async () => { controller.abort(); return false; };
  await assert.rejects(runCodex(args), /interrupted/);
  assert.equal(client.closed, true);
  assert.equal(client.requests.filter((item) => item.method === "turn/interrupt").length, 1);
});

test("configuration never stores arbitrary secrets and account checks always close", async () => {
  const config = require("../agent-backend-config.cjs");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-backend-"));
  try {
    config.initialize(directory);
    assert.equal(config.get().backend, "api");
    config.save({ backend: "codex", binary: "codex", model: "", apiKey: "not-to-store" });
    assert.equal(fs.readFileSync(path.join(directory, "agent-backend.json"), "utf8").includes("not-to-store"), false);
    assert.throws(() => config.save({ backend: "unknown" }), /Unknown/);
    assert.throws(() => config.save({ binary: "codex --unsafe" }), /absolute/);
    let client;
    const Client = fakeClient("success", (value) => { client = value; });
    assert.equal((await config.check(config.get(), Client)).ready, true);
    assert.equal(client.closed, true);
    fs.writeFileSync(path.join(directory, "agent-backend.json"), "not json");
    assert.throws(() => config.get(), /no backend was selected automatically/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
