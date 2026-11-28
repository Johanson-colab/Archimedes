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
  new Function("fs", "BrowserWindow", "workspaceForWindow", "ipcMain", "researchAppRuntime", "createResearchAppSetup", "createAppAgent", "agentBackendConfig", "nativeAgent", "researchAppRuntimeOptions", "researchAppDelivery", "require", "runWindowAgent", "dialog", source.slice(start, end))(
    fs, { fromWebContents: (sender) => sender }, (owner) => owner?.workspace,
    { handle: (name, handler) => handlers.set(name, handler) }, runtime, () => ({ setup: (...args) => { calls.push({ method: 'setup', args }); return 'setup'; } }),
    () => ({ run: (...args) => { calls.push({ method: 'agent', args }); return 'agent'; } }), {}, {}, {}, undefined,
    name => { if (name.includes('research-app-frontend')) return { createFrontend: () => ({ build: async () => ({ built: true }) }) }; if (name.includes('research-app-repair')) return { createAppRepair: () => async () => {} }; assert.match(name, /research-app-delivery/); return { createDelivery: () => ({ validate: (...args) => { calls.push({ method: 'validate', args }); return 'validate'; }, cancel: (...args) => { calls.push({ method: 'cancel-validation', args }); return 'cancel-validation'; }, restore: (...args) => { calls.push({ method: 'restore', args }); return 'restore'; } }) }; },
    ({ run }) => run({}), { showMessageBox: async () => ({ response: 1 }) },
  );
  assert.equal(handlers.size, 12);
  for (const [name, handler] of handlers) {
    await assert.rejects(async () => handler({ sender: { workspace: root } }, { workspace: other, id: "test" }), /active workspace/);
    await assert.rejects(async () => handler({ sender: {} }, { workspace: root, id: "test" }), /active workspace/);
    assert.equal(await handler({ sender: { workspace: root } }, { workspace: root, id: "test", pinned: true }), name.split(":")[1]);
  }
  assert.ok(calls.every((call) => call.args[0] === root));
});
