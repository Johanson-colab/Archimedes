const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const test = require("node:test");
const agent = require("./agent.cjs");
const store = require("./store.cjs");
const model = require("./model-config.cjs");

test("app shutdown interrupts active API work and rejects a later startup", async t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-agent-shutdown-")));
  store.openWorkspace(root);
  model.initializeModelConfig(path.join(root, "settings"));
  model.saveModelConfig({ provider: "custom", baseUrl: "https://shutdown.invalid/v1", model: "fake", apiKey: "fake-not-a-credential" });
  const previous = global.fetch;
  t.after(() => { global.fetch = previous; fs.rmSync(root, { recursive: true, force: true }); });
  let entered;
  const waiting = new Promise(resolve => { entered = resolve; });
  global.fetch = async (_url, { signal }) => {
    entered();
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("Stopped"), { name: "AbortError" })), { once: true }));
  };
  const running = agent.runAgent({ workspace: root, prompt: "Controlled pending answer" });
  await waiting;
  const shutdown = await agent.shutdownAgents();
  assert.equal(shutdown.pending, 0);
  const result = await running;
  assert.equal(result.status, "interrupted");
  assert.equal(store.getResearchThread(result.threadId).turns[0].status, "interrupted");
  assert.equal(store.getSnapshot().tasks[0].status, "interrupted");
  await assert.rejects(agent.runAgent({ workspace: root, threadId: result.threadId, prompt: "After quit" }), /closing/);
  assert.deepEqual(await agent.shutdownAgents(), { pending: 0 });
});

test("the actual quit handler waits for agent shutdown and prevents duplicate cleanup", async () => {
  const source = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
  const start = source.indexOf('app.on("will-quit",');
  assert.ok(start > 0, "cleanup waits for the post-window-close will-quit event");
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const calls = [];
  let handler, prevented = 0;
  const event = { preventDefault: () => { prevented++; } };
  const app = { on: (_name, callback) => { handler = callback; }, quit: () => { calls.push("quit"); handler(event); } };
  new Function("app", "store", "agent", "closeAllNativeClients", "closeAllTerminals", "experimentRunner", "collaborationServer", "presence",
    `let readyToQuit = false, quitting = false;\n${source.slice(start)}`)(app, {}, { shutdownAgents: async () => { calls.push("agents"); await gate; } }, () => calls.push("native"), () => calls.push("terminals"), { shutdownExperimentRuns: () => calls.push("experiments") }, { close: () => calls.push("server") }, { closeAll: () => calls.push("presence") });
  handler(event); handler(event);
  await Promise.resolve();
  assert.deepEqual(calls, ["native", "terminals", "experiments", "agents"]);
  assert.equal(prevented, 2);
  release();
  await new Promise(setImmediate);
  assert.deepEqual(calls, ["native", "terminals", "experiments", "agents", "server", "presence", "quit"]);
});
