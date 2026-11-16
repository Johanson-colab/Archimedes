const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const test = require("node:test");
const agent = require("./agent.cjs");
const store = require("./store.cjs");
const model = require("./model-config.cjs");

test("app shutdown interrupts active API work before stores close and rejects a later startup", async t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-agent-shutdown-")));
  const owner = store.createWorkspaceStore(root);
  model.initializeModelConfig(path.join(root, "settings"));
  model.saveModelConfig({ provider: "custom", baseUrl: "https://shutdown.invalid/v1", model: "fake", apiKey: "fake-not-a-credential" });
  const previous = global.fetch;
  t.after(() => { global.fetch = previous; store.closeAllWorkspaces(); fs.rmSync(root, { recursive: true, force: true }); });
  let entered;
  const waiting = new Promise(resolve => { entered = resolve; });
  global.fetch = async (_url, { signal }) => {
    entered();
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("Stopped"), { name: "AbortError" })), { once: true }));
  };
  const running = agent.runAgent({ dataStore: owner, workspace: root, prompt: "Controlled pending answer" });
  await waiting;
  const shutdown = await agent.shutdownAgents();
  assert.equal(shutdown.pending, 0);
  const result = await running;
  assert.equal(result.status, "interrupted");
  assert.equal(owner.getResearchThread(result.threadId).turns[0].status, "interrupted");
  assert.equal(owner.getSnapshot().tasks[0].status, "interrupted");
  await assert.rejects(agent.runAgent({ dataStore: owner, workspace: root, threadId: result.threadId, prompt: "After quit" }), /closing/);
  assert.deepEqual(await agent.shutdownAgents(), { pending: 0 });
});
