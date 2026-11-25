const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { test } = require("node:test");
const store = require("./store.cjs");
const agent = require("./agent.cjs");
const model = require("./model-config.cjs");
const { DatabaseSync } = require("node:sqlite");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { createWorkspaceIpc, isWorkspaceDataChannel } = require("./workspace-context.cjs");

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-store-owner-")));
  const a = path.join(root, "a"), b = path.join(root, "b"), executionA = path.join(root, "executionA"); fs.mkdirSync(a); fs.mkdirSync(b); fs.mkdirSync(executionA);
  t.after(() => { store.closeAllWorkspaces(); fs.rmSync(root, { recursive: true, force: true }); });
  return { root, a, b, executionA };
}
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

test("an in-flight window request retains its database through another selection and its window close", async t => {
  const f = fixture(t), handlers = new Map(), gate = deferred();
  const a = store.createWorkspaceStore(f.a), b = store.createWorkspaceStore(f.b);
  const ipc = createWorkspaceIpc({ ipcMain: { handle: (name, callback) => handlers.set(name, callback) }, store, workspaceForEvent: event => event.dataRoot });
  ipc.handle("delayed-save", async () => { await gate.promise; return store.saveTask({ prompt: "Origin A", response: "Delayed A", status: "completed" }); });
  const pending = handlers.get("delayed-save")({ dataRoot: f.a });
  b.saveTask({ prompt: "Origin B", response: "B only", status: "completed" });
  a.close(); gate.resolve(); await pending;
  assert.deepEqual(store.createWorkspaceStore(f.a).getSnapshot().tasks.map(task => task.prompt), ["Origin A"]);
  assert.deepEqual(b.getSnapshot().tasks.map(task => task.prompt), ["Origin B"]);
});

test("canonical aliases share one data store and same-ID runtime identities remain distinct across roots", t => {
  const f = fixture(t), alias = path.join(f.root, "alias"); fs.symlinkSync(f.a, alias, process.platform === "win32" ? "junction" : "dir");
  const a = store.createWorkspaceStore(f.a), otherName = store.createWorkspaceStore(alias), b = store.createWorkspaceStore(f.b);
  assert.equal(a, otherName); assert.equal(a.workspace, fs.realpathSync(f.a));
  assert.notEqual(a.runtimeThreadId("same-thread"), b.runtimeThreadId("same-thread"));
  assert.throws(() => a.openWorkspace(f.b), /different data workspace/);
});

test("reopening a restored directory uses its replacement database", t => {
  const { root, a, b } = fixture(t);
  const original = store.createWorkspaceStore(a);
  original.saveTask({ prompt: "Original A", response: "", status: "completed" });
  const replacement = store.createWorkspaceStore(b);
  replacement.saveTask({ prompt: "Restored A", response: "", status: "completed" });
  replacement.close();

  const originalDirectory = path.join(root, "original");
  fs.renameSync(a, originalDirectory);
  fs.renameSync(b, a);

  const restored = store.createWorkspaceStore(a);
  assert.notEqual(restored, original);
  assert.deepEqual(restored.getSnapshot().tasks.map(task => task.prompt), ["Restored A"]);
  restored.saveTask({ prompt: "Saved after restore", response: "", status: "completed" });
  restored.close();
  assert.deepEqual(store.createWorkspaceStore(a).getSnapshot().tasks.map(task => task.prompt).sort(), ["Restored A", "Saved after restore"]);
  assert.deepEqual(store.createWorkspaceStore(originalDirectory).getSnapshot().tasks.map(task => task.prompt), ["Original A"]);
});

test("a profile rename updates both stores on use without opening an unavailable directory", t => {
  const { root, a, b } = fixture(t);
  const ownerA = store.createWorkspaceStore(a), ownerB = store.createWorkspaceStore(b);
  const projectA = ownerA.listResearchProjects().at(0).id;
  const projectB = ownerB.listResearchProjects().at(0).id;
  const profile = { userId: "local-user", displayName: "Local user", deviceId: "local-device", deviceName: "This device" };
  const temporarilyUnavailable = path.join(root, "unavailable");
  fs.renameSync(b, temporarilyUnavailable);
  t.after(() => store.setLocalIdentity(profile));

  store.setLocalIdentity({ ...profile, displayName: "Renamed researcher" });
  assert.equal(ownerA.listProjectMembers(projectA).find(member => member.user_id === profile.userId).display_name, "Renamed researcher");

  fs.renameSync(temporarilyUnavailable, b);
  const reopened = store.createWorkspaceStore(b);
  assert.equal(reopened.listProjectMembers(projectB).find(member => member.user_id === profile.userId).display_name, "Renamed researcher");
});

test("a synchronously failing IPC invocation releases its store lease", t => {
  const f = fixture(t), handlers = new Map(), a = store.createWorkspaceStore(f.a);
  const ipc = createWorkspaceIpc({ ipcMain: { handle: (name, callback) => handlers.set(name, callback) }, store, workspaceForEvent: () => f.a });
  ipc.handle("fail", () => { throw new Error("Expected failure"); });
  assert.throws(() => handlers.get("fail")({}), /Expected failure/);
  a.close();
  assert.throws(() => a.getSnapshot(), /Open a workspace/);
  assert.equal(store.createWorkspaceStore(f.a).workspace, f.a);
});

test("real terminal child persists in its data store after IPC returns and its execution folder has no database", async t => {
  const roots = fixture(t);
  const a = store.createWorkspaceStore(roots.a), b = store.createWorkspaceStore(roots.b);
  const handlers = new Map(), sessions = new Map(), events = [];
  let child;
  const ipc = createWorkspaceIpc({ ipcMain: { handle: (name, callback) => handlers.set(name, callback) }, store, workspaceForEvent: () => roots.a });
  const main = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
  const start = main.indexOf('  ipcMain.handle("terminal:run",');
  const end = main.indexOf('  ipcMain.handle("terminal:stop",', start);
  assert.ok(start >= 0 && end > start);
  // Register the complete production handler, including stdout/close callbacks.
  new Function("ipcMain", "store", "resolveWorkspace", "workspaceFiles", "randomUUID", "spawn", "process", "commandSessions", main.slice(start, end))(
    ipc, store, fs.realpathSync, require("./workspace-files.cjs"), randomUUID,
    (...args) => { child = spawn(...args); return child; }, process, sessions,
  );
  const result = handlers.get("terminal:run")({ sender: { id: 1, isDestroyed: () => false, send: (...args) => events.push(args) } }, { command: "echo terminal-owner-A", cwd: roots.executionA });
  const closed = new Promise((resolve, reject) => { child.once("close", resolve); child.once("error", reject); });
  store.openWorkspace(roots.b);
  a.close(); // The terminal's explicit lease, not the completed IPC, owns A now.
  await closed;
  const restored = store.createWorkspaceStore(roots.a);
  const command = restored.getSnapshot().commands.find(item => item.id === result.commandRunId);
  assert.equal(command.status, "completed");
  assert.match(command.output, /terminal-owner-A/);
  assert.equal(command.cwd, roots.executionA);
  assert.equal(b.getSnapshot().commands.length, 0);
  assert.equal(fs.existsSync(path.join(roots.executionA, ".archimedes")), false);
  assert.equal(sessions.size, 0);
  assert.ok(events.some(([, payload]) => payload.commandRunId === result.commandRunId));
});


test("same imported thread id in two data stores has independent running/stop/approval identity", async t => {
  const roots = fixture(t);
  const a = store.createWorkspaceStore(roots.a), b = store.createWorkspaceStore(roots.b);
  const threadId = "shared-cloud-thread";
  for (const owner of [a, b]) {
    const project = owner.listResearchProjects()[0], workspace = owner.defaultProjectWorkspace(project.id);
    owner.applyCloudThread(project.id, { thread: { id: threadId, title: "Shared", status: "idle" }, turns: [] });
    // Copying/syncing a thread ID is independent of the execution-context binding feature.
    const db = new DatabaseSync(path.join(owner.workspace, ".archimedes/archimedes.db"));
    db.prepare("UPDATE research_threads SET workspace_id=?, workspace_path=? WHERE id=?").run(workspace.id, owner.workspace, threadId); db.close();
  }
  a.run(() => agent.setApprovalSurface(threadId, true));
  assert.equal(a.run(() => agent.hasApprovalSurface(threadId)), true);
  assert.equal(b.run(() => agent.hasApprovalSurface(threadId)), false);
  model.initializeModelConfig(path.join(roots.root, "settings"));
  model.saveModelConfig({ provider: "custom", baseUrl: "https://context.invalid/v1", model: "fake", apiKey: "fake-not-a-credential" });
  const arrived = deferred(), finishB = deferred();
  let calls = 0;
  const previous = global.fetch;
  global.fetch = async (_url, options) => {
    const current = ++calls;
    if (calls === 2) arrived.resolve();
    if (current === 1) await new Promise((resolve, reject) => {
      if (options.signal.aborted) reject(new Error("aborted"));
      else options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
    else await finishB.promise;
    return { ok: true, headers: { get: () => "application/json" }, json: async () => ({ choices: [{ finish_reason: "stop", message: { content: "B completed independently" } }] }) };
  };
  t.after(() => { global.fetch = previous; a.run(() => agent.setApprovalSurface(threadId, false)); });
  const runningA = agent.runAgent({ dataStore: a, threadId, workspace: roots.a, prompt: "A" });
  const runningB = agent.runAgent({ dataStore: b, threadId, workspace: roots.b, prompt: "B" });
  await arrived.promise;
  fs.renameSync(roots.a, path.join(roots.root, "moved-while-waiting"));
  const handlers = new Map(), windowWorkspaces = new Map([[1, roots.a], [2, roots.b]]);
  const ipcMain = createWorkspaceIpc({
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) }, store,
    workspaceForEvent: (event, channel) => isWorkspaceDataChannel(channel) ? windowWorkspaces.get(event.sender.id) : null,
  });
  const main = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
  const start = main.indexOf('  ipcMain.handle("agent:interrupt",'), end = main.indexOf('  ipcMain.handle("terminal:run",', start);
  new Function("ipcMain", "agent", "windowWorkspaces", main.slice(start, end))(ipcMain, agent, windowWorkspaces);
  const stop = handlers.get("agent:interrupt");
  assert.deepEqual(stop({ sender: { id: 3 } }, threadId), { interrupted: false });
  assert.deepEqual(stop({ sender: { id: 1 } }, threadId), { interrupted: true });
  const resultA = await runningA;
  assert.equal(resultA.status, "interrupted");
  assert.equal(b.getResearchThread(threadId).status, "running");
  finishB.resolve();
  const resultB = await runningB;
  assert.equal(resultB.status, "completed");
  assert.equal(resultB.thread.workspace_path, roots.b);
  assert.equal(resultB.thread.turns[0].assistant_message, "B completed independently");
  assert.equal(a.getResearchThread(threadId).turns[0].status, "interrupted");
});

test("a moved database cannot start a second turn while its original owner is running", async t => {
  const { root, a, executionA } = fixture(t);
  const owner = store.createWorkspaceStore(a);
  const project = owner.createResearchProject({ name: "Unchanged execution folder", workspacePath: executionA });
  const workspace = owner.defaultProjectWorkspace(project.id);
  const thread = owner.createResearchThread({ projectId: project.id, workspaceId: workspace.id, workspacePath: executionA, mode: "free-chat" });
  const moved = path.join(root, "moved-data");
  model.initializeModelConfig(path.join(root, "settings"));
  model.saveModelConfig({ provider: "custom", baseUrl: "https://context.invalid/v1", model: "fake", apiKey: "fake-not-a-credential" });
  const arrived = deferred(), finish = deferred(), previousFetch = global.fetch;
  let modelCalls = 0;
  global.fetch = async () => {
    if (++modelCalls === 1) {
      arrived.resolve();
      await finish.promise;
    }
    return { ok: true, headers: { get: () => "application/json" }, json: async () => ({ choices: [{ finish_reason: "stop", message: { content: "Result from the original execution folder" } }] }) };
  };
  t.after(() => { global.fetch = previousFetch; });
  const run = (dataStore, prompt) => agent.runAgent({ dataStore, threadId: thread.id, workspace: executionA, prompt });
  const pending = run(owner, "Original turn");
  await arrived.promise;
  fs.renameSync(a, moved);
  try {
    await assert.rejects(async () => run(store.createWorkspaceStore(moved), "Duplicate turn"), /data folder moved while work was still running/);
    assert.equal(modelCalls, 1);
    assert.equal(owner.getResearchThread(thread.id).status, "running");
  } finally {
    finish.resolve();
    await pending;
  }
  const reopened = store.createWorkspaceStore(moved);
  assert.equal(reopened.workspace, moved);
  const saved = reopened.getResearchThread(thread.id);
  assert.equal(saved.status, "idle");
  assert.equal(saved.workspace_path, executionA);
  assert.deepEqual(saved.turns.map(turn => turn.assistant_message), ["Result from the original execution folder"]);
  assert.equal((await run(reopened, "Continue after moving")).status, "completed");
});

test("distinct workspace folders cannot open two handles to one SQLite file", t => {
  const { a, b } = fixture(t);
  const owner = store.createWorkspaceStore(a);
  fs.mkdirSync(path.join(b, ".archimedes"));
  fs.linkSync(path.join(a, ".archimedes/archimedes.db"), path.join(b, ".archimedes/archimedes.db"));
  assert.throws(() => store.createWorkspaceStore(b), /research database is already open from another workspace folder/);
  assert.equal(store.createWorkspaceStore(a), owner);
  assert.equal(owner.workspace, a);
});

test("a detached experiment persists its outcome to the original database after a folder replacement", async t => {
  const { root, a, b } = fixture(t);
  const original = store.createWorkspaceStore(a);
  const record = original.createReproduction({ title: "Offline test", repoUrl: "https://example.com/research" });
  original.updateReproduction(record.id, { contract: { repo: { url: record.repo_url } } });
  store.createWorkspaceStore(b).close();
  const handlers = new Map(), gate = deferred(), finished = deferred();
  const ipcMain = createWorkspaceIpc({ ipcMain: { handle: (name, fn) => handlers.set(name, fn) }, store, workspaceForEvent: () => a });
  const main = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
  const from = main.indexOf('  ipcMain.handle("reproduction:run",'), to = main.indexOf('  ipcMain.handle("reproduction:stop",', from);
  new Function("scope", `with(scope) { ${main.slice(from, to)} }`)({
    ipcMain, store, presentReproduction: value => value, reproductionModel() {},
    activeReproductionRuns: new Map(), resolveWorkspace: fs.realpathSync,
    workspaceForWindow: () => a, BrowserWindow: { fromWebContents: () => ({}) },
    reproductionEnv: { values: () => ({}) }, repoNameFromUrl: () => "research",
    getRepositoryCheckout: async () => { await gate.promise; return true; },
    resolveAuditPath: async () => { throw new Error("Offline fixture finished provisioning"); },
    stopSession: async () => {}, notifyRunFinished: () => finished.resolve(),
  });
  const result = await handlers.get("reproduction:run")({ sender: { id: 1, isDestroyed: () => true } }, { id: record.id, workspace: a });
  const old = path.join(root, "before-restore");
  fs.renameSync(a, old);
  fs.renameSync(b, a);
  assert.throws(() => store.createWorkspaceStore(a), /replaced while work was still running/);
  gate.resolve();
  await finished.promise;
  assert.equal(store.createWorkspaceStore(a).getReproduction(record.id), null);
  const saved = store.createWorkspaceStore(old).getReproductionRun(result.run.id);
  assert.equal(saved.status, "failed");
  assert.equal(saved.error, "Offline fixture finished provisioning");
});
