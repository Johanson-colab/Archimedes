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
  const environment = {
    ARCHIMEDES_LLM_BASE_URL: "https://shutdown.invalid/v1",
    ARCHIMEDES_LLM_MODEL: "fake",
    ARCHIMEDES_LLM_API_KEY: "fake-not-a-credential",
  };
  for (const [key, value] of Object.entries(environment)) {
    const previous = process.env[key];
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
    process.env[key] = value;
  }
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
  await agent.shutdownAgentRuns();
  const result = await running;
  assert.equal(result.status, "interrupted");
  assert.equal(store.getResearchThread(result.threadId).turns[0].status, "interrupted");
  assert.equal(store.getSnapshot().tasks[0].status, "interrupted");
  await assert.rejects(agent.runAgent({ workspace: root, threadId: result.threadId, prompt: "After quit" }), /quitting/);
  assert.deepEqual(await agent.shutdownAgentRuns(), []);
});

test("the actual quit handler waits for agent shutdown and prevents duplicate cleanup", async () => {
  const source = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
  const start = source.indexOf("installQuitGuard({ app, dialog,");
  assert.ok(start > 0, "the main process installs the native quit guard");
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const calls = [];
  const app = new (require("node:events").EventEmitter)();
  const event = () => ({ defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } });
  app.quit = () => { calls.push("quit"); app.emit("will-quit", event()); };
  const { installQuitGuard } = require("./runtime/active-runs.cjs");
  new Function("scope", `with(scope) { let stoppingResearch = false; ${source.slice(start)} }`)({
    app, installQuitGuard, listActiveRuns: () => [], dialog: { showMessageBox: async () => ({ response: 1 }) },
    store: { closeAllWorkspaces: () => calls.push("store") },
    agent: { hasActiveAgentRuns: () => true, shutdownAgentRuns: async () => { calls.push("agents"); await gate; } },
    closeAllNativeClients: () => calls.push("native"), closeAllTerminals: () => calls.push("terminals"),
    experimentRunner: { shutdownExperimentRuns: () => calls.push("experiments") },
    collaborationServer: { close: () => calls.push("server") }, presence: { closeAll: () => calls.push("presence") },
    deepReadingRuns: new Map(), activeLiteratureSearches: new Map(), workspaceWatchers: new Map(), windowPreviewTokens: new Map(), latexCompiles: new Map(),
  });
  app.emit("before-quit", event());
  await new Promise(setImmediate);
  app.emit("will-quit", event());
  assert.deepEqual(calls, ["quit", "experiments", "agents"]);
  release();
  await new Promise(setImmediate);
  assert.deepEqual(calls, ["quit", "experiments", "agents", "quit", "native", "terminals", "experiments", "server", "presence", "store"]);
});
