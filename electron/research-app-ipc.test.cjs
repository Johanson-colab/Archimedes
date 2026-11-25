const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const test = require("node:test");
const assert = require("node:assert/strict");

test("App IPC resolves only the sender window's active workspace", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-app-ipc-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const root = fs.realpathSync(directory), other = path.join(root, "other"); fs.mkdirSync(other);
  const source = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
  const start = source.indexOf("  const researchAppWorkspace =");
  const end = source.indexOf('  ipcMain.handle("plugins:set-enabled"', start);
  const handlers = new Map(), calls = [];
  const runtime = Object.fromEntries(["list", "status", "start", "stop", "install", "pin", "remove"].map((method) => [method, (...args) => { calls.push({ method, args }); return method; }]));
  new Function("fs", "BrowserWindow", "workspaceForWindow", "ipcMain", "researchAppRuntime", "createResearchAppSetup", "createAppAgent", "agentBackendConfig", "nativeAgent", source.slice(start, end))(
    fs, { fromWebContents: (sender) => sender }, (owner) => owner?.workspace,
    { handle: (name, handler) => handlers.set(name, handler) }, runtime, () => ({ setup: (...args) => { calls.push({ method: 'setup', args }); return 'setup'; } }),
    () => ({ run: (...args) => { calls.push({ method: 'agent', args }); return 'agent'; } }), {}, {},
  );
  assert.equal(handlers.size, 9);
  for (const [name, handler] of handlers) {
    assert.throws(() => handler({ sender: { workspace: root } }, { workspace: other, id: "test" }), /active workspace/);
    assert.throws(() => handler({ sender: {} }, { workspace: root, id: "test" }), /active workspace/);
    assert.equal(handler({ sender: { workspace: root } }, { workspace: root, id: "test", pinned: true }), name.split(":")[1]);
  }
  assert.ok(calls.every((call) => call.args[0] === root));
});
