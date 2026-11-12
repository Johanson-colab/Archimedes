const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const test = require("node:test");
const { createSshBackend } = require("./reproduction/remote.cjs");

const source = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
const turn = () => new Promise((resolve) => setImmediate(resolve));

function context() {
  const handlers = new Map(); const events = []; const updates = []; const processes = [];
  const record = { id: "repro", title: "Fixture paper", budget: {}, contract: { repo: { url: "https://github.com/owner/repo" }, claims: [], steps: [], findings: [] } };
  const activeReproductionRuns = new Map();
  const scope = {
    AbortController, Promise, Date, Number, console,
    ipcMain: { handle: (name, callback) => handlers.set(name, callback) },
    store: {
      getReproduction: () => record, openWorkspace() {}, createReproductionRun: () => ({ id: "run" }),
      updateReproduction: (_id, patch) => updates.push({ target: "repro", ...patch }),
      updateReproductionRun: (_id, patch) => updates.push({ target: "run", ...patch }),
    },
    presentReproduction: (value) => value, reproductionModel() {}, activeReproductionRuns,
    resolveWorkspace: () => "/fixture", workspaceForWindow: () => "/fixture",
    BrowserWindow: { fromWebContents: () => ({}) }, windowWorkspaces: new Map(),
    sshServers: { listServers: () => [{ id: "server", user: "test", host: "fixture.invalid" }] },
    reproductionEnv: { values: () => ({}) }, repoNameFromUrl: () => "repo",
    getRepositoryCheckout: async () => null,
    createSshBackend: (options) => createSshBackend({ ...options, spawnImpl: () => {
      const child = new EventEmitter();
      child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
      child.kill = () => { child.killed = true; queueMicrotask(() => child.emit("close", null, "SIGKILL")); return true; };
      processes.push(child); return child;
    } }),
    executeRun: async () => { throw new Error("Cancelled preparation must not start the pilot"); },
    stopSession: async (id) => {
      const session = activeReproductionRuns.get(id);
      activeReproductionRuns.delete(id); await session?.backend?.dispose();
    },
    notifyRunFinished: () => events.push({ type: "notification" }),
    reproductionEnvItems: () => [], completeJson() { throw new Error("No model calls in this test"); },
    runPilot: async () => ({ status: "failed", summary: "model aborted" }),
  };
  const event = { sender: { id: 1, isDestroyed: () => false, send: (_channel, payload) => events.push(payload) } };
  return { scope: vm.createContext(scope), record, event, handlers, events, updates, processes };
}

test("the actual run/stop IPC handlers cancel a pending SSH probe and persist cancelled state", async () => {
  const f = context();
  const start = source.indexOf('  ipcMain.handle("reproduction:run"');
  const end = source.indexOf('  ipcMain.handle("reproduction:plan"', start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(source.slice(start, end), f.scope);
  await f.handlers.get("reproduction:run")(f.event, { id: "repro", workspace: "/fixture", backend: "ssh", serverId: "server" });
  await turn();
  assert.equal(f.processes.length, 1);
  assert.equal(await f.handlers.get("reproduction:stop")(f.event, { id: "repro" }), true);
  for (let n = 0; n < 20 && !f.updates.some((patch) => patch.status === "cancelled"); n += 1) await turn();
  assert.equal(f.processes[0].killed, true);
  assert.equal(f.processes.length, 1, "do not start cloning after cancellation");
  assert.ok(f.updates.some((patch) => patch.target === "run" && patch.status === "stopped"));
  assert.ok(f.updates.some((patch) => patch.target === "repro" && patch.status === "cancelled"));
  assert.ok(f.events.some((event) => event.type === "finished" && event.status === "stopped"));
  assert.equal(f.events.some((event) => event.type === "error" || event.type === "notification"), false);
  assert.equal(f.scope.activeReproductionRuns.size, 0);
});

test("entering the pilot retains an already-aborted preparation controller", async () => {
  const f = context(); const controller = new AbortController(); controller.abort();
  f.scope.runPilot = async ({ signal }) => {
    assert.equal(signal, controller.signal); assert.equal(signal.aborted, true);
    return { status: "failed", summary: "request interrupted" };
  };
  const start = source.indexOf("  const executeRun = async (session) => {");
  const end = source.indexOf('  ipcMain.handle("reproduction:run"', start);
  vm.runInContext(source.slice(start, end) + "\nglobalThis.executeRun = executeRun;", f.scope);
  await f.scope.executeRun({ record: f.record, run: { id: "run" }, contract: f.record.contract,
    backend: { describe: () => "fixture" }, controller, send: (event) => f.events.push(event),
  });
  assert.ok(f.updates.some((patch) => patch.target === "run" && patch.status === "stopped"));
  assert.ok(f.updates.some((patch) => patch.target === "repro" && patch.status === "cancelled"));
  assert.equal(f.updates.some((patch) => patch.status === "blocked"), false);
});
