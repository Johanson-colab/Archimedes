const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const test = require("node:test");
const store = require("./store.cjs");
const agent = require("./agent.cjs");
const model = require("./model-config.cjs");
const { createWorkspaceIpc, resolveResearchContext } = require("./workspace-context.cjs");
const { registerThreadCommands } = require("./thread-commands.cjs");

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-context-")));
  const directories = Object.fromEntries(["a", "b", "executionA", "executionB", "next"].map(name => {
    const directory = path.join(root, name);
    fs.mkdirSync(directory);
    return [name, directory];
  }));
  t.after(() => { store.closeAllWorkspaces(); fs.rmSync(root, { recursive: true, force: true }); });
  return { root, ...directories };
}

function deferred() {
  let resolve;
  const promise = new Promise(value => { resolve = value; });
  return { promise, resolve };
}

function localTurn(owner, prompt = "Pending") {
  const thread = owner.createResearchThread({ prompt, mode: "free-chat" });
  const task = owner.startTask({ prompt });
  const turn = owner.startResearchTurn({ threadId: thread.id, taskId: task.id, prompt, mode: "free-chat" });
  return { thread, task, turn };
}

test("workspace facades retain SQL ownership across awaits, aliases, and deferred close", async t => {
  const roots = fixture(t);
  const a = store.createWorkspaceStore(roots.a);
  const pending = localTurn(a);
  const b = store.createWorkspaceStore(roots.b);
  assert.equal(a.getResearchThread(pending.thread.id).status, "running", "opening B must not recover a live A turn");
  const alias = path.join(roots.root, "alias-a");
  fs.symlinkSync(roots.a, alias, process.platform === "win32" ? "junction" : "dir");
  assert.equal(store.createWorkspaceStore(alias), a);
  assert.equal(a.workspace, roots.a);
  const captured = a.captureStore();
  const gate = deferred();
  const work = captured.store.run(async () => {
    await gate.promise;
    captured.store.finishTask(pending.task.id, { response: "A response", status: "completed" });
    captured.store.finishResearchTurn(pending.turn.id, { response: "A response", status: "completed" });
  });
  a.close();
  b.saveTask({ prompt: "B task", response: "B response", status: "completed" });
  gate.resolve();
  await work;
  assert.equal(a.getResearchThread(pending.thread.id).turns[0].assistant_message, "A response");
  assert.equal(b.getSnapshot().tasks.length, 1);
  assert.throws(() => b.getResearchThread(pending.thread.id), /not found/);
  captured.release();
  captured.release();
  assert.throws(() => a.getSnapshot(), /workspace/i);
  assert.equal(b.getSnapshot().tasks[0].response, "B response");
  const reopened = store.createWorkspaceStore(roots.a);
  assert.equal(reopened.getResearchThread(pending.thread.id).turns[0].status, "completed");
});

test("IPC pins the sender's data root while that window switches and thread creation rejects mixed roots", async t => {
  const roots = fixture(t);
  const a = store.createWorkspaceStore(roots.a);
  const b = store.createWorkspaceStore(roots.b);
  const projectA = a.createResearchProject({ name: "A", workspacePath: roots.executionA });
  const projectB = b.createResearchProject({ name: "B", workspacePath: roots.executionB });
  const handlers = new Map();
  const windows = new Map([[1, roots.a], [2, roots.b]]);
  const ipc = createWorkspaceIpc({ ipcMain: { handle: (name, callback) => handlers.set(name, callback) }, store,
    workspaceForEvent: (event, channel, args) => channel === "workspace:open" ? args[0] : windows.get(event.sender.id),
  });
  const entered = deferred(), finish = deferred();
  ipc.handle("slow-write", async () => {
    entered.resolve(); await finish.promise;
    return store.saveTask({ prompt: "From window A", response: "Still A", status: "completed" });
  });
  ipc.handle("workspace:open", (event, root) => { windows.set(event.sender.id, root); return store.openWorkspace(root); });
  registerThreadCommands({ ipcMain: ipc, store, dataWorkspace: event => windows.get(event.sender.id) });
  const event = { sender: { id: 1 } };
  const saving = handlers.get("slow-write")(event);
  await entered.promise;
  await handlers.get("workspace:open")(event, roots.b);
  finish.resolve(); await saving;
  assert.equal(a.getSnapshot().tasks[0].response, "Still A");
  assert.equal(b.getSnapshot().tasks.length, 0);
  assert.throws(() => handlers.get("research-thread:create")({ sender: { id: 2 } }, {
    projectId: projectA.id, workspacePath: roots.executionA,
  }), /access|not found/);
  const thread = handlers.get("research-thread:create")({ sender: { id: 2 } }, {
    projectId: projectB.id, workspaceId: b.defaultProjectWorkspace(projectB.id).id, workspacePath: roots.executionB,
  });
  assert.equal(thread.project_id, projectB.id);
  assert.equal(thread.workspace_path, roots.executionB);
  assert.ok(thread.workspace_id);
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

test("context rejects thread/project/workspace/root mixing before any new turn and preserves historical execution", async t => {
  const roots = fixture(t);
  const owner = store.createWorkspaceStore(roots.a);
  const projectA = owner.createResearchProject({ name: "A", workspacePath: roots.executionA });
  const projectB = owner.createResearchProject({ name: "B", workspacePath: roots.executionB });
  const workspaceA = owner.defaultProjectWorkspace(projectA.id), workspaceB = owner.defaultProjectWorkspace(projectB.id);
  const thread = owner.createResearchThread({ projectId: projectA.id, workspaceId: workspaceA.id, prompt: "A", mode: "free-chat" });
  let calls = 0;
  const previous = global.fetch;
  global.fetch = async () => { calls++; throw new Error("unexpected provider traffic"); };
  t.after(() => { global.fetch = previous; });
  for (const mismatch of [
    { threadId: thread.id, projectId: projectB.id, workspace: roots.executionA },
    { threadId: thread.id, workspaceId: workspaceB.id, workspace: roots.executionA },
    { threadId: thread.id, workspace: roots.executionB },
    { projectId: projectA.id, workspaceId: workspaceB.id, workspace: roots.executionB },
  ]) await assert.rejects(agent.runAgent({ dataStore: owner, prompt: "Do not run", ...mismatch }), /belong|match/);
  assert.equal(calls, 0);
  assert.equal(owner.getSnapshot().tasks.length, 0);
  assert.equal(owner.getResearchThread(thread.id).turns.length, 0);
  owner.setResearchProjectWorkspace(projectA.id, roots.next);
  const historical = resolveResearchContext(owner, { threadId: thread.id, projectId: projectA.id, workspaceId: workspaceA.id, workspace: roots.executionA });
  assert.equal(historical.workspace, roots.executionA);
  assert.equal(historical.dataRoot, roots.a);
  assert.equal(resolveResearchContext(owner, { projectId: projectA.id }).workspace, roots.next);
});

test("opening a freshly imported conversation binds the same local context used by run and remains readable to viewers", async t => {
  const roots = fixture(t);
  const owner = store.createWorkspaceStore(roots.a);
  const project = owner.createResearchProject({ name: "Imported into a separate folder", workspacePath: roots.executionA });
  owner.applyCloudThread(project.id, { thread: { id: "import-after-open", title: "Imported", status: "idle" }, turns: [] });
  const opened = owner.getResearchThread("import-after-open");
  assert.equal(opened.workspace_path, roots.executionA);
  assert.equal(opened.workspace_id, owner.defaultProjectWorkspace(project.id).id);
  const context = resolveResearchContext(owner, { threadId: opened.id, projectId: opened.project_id, workspaceId: opened.workspace_id, workspace: opened.workspace_path });
  assert.equal(context.workspace, opened.workspace_path);
  assert.equal(context.workspaceId, opened.workspace_id);
  owner.setResearchProjectWorkspace(project.id, roots.next);
  assert.equal(owner.getResearchThread(opened.id).workspace_path, roots.executionA, "local binding must not follow later project changes");
  assert.equal(resolveResearchContext(owner, { threadId: opened.id }).workspace, roots.executionA);

  owner.applyCloudThread(project.id, { thread: { id: "viewer-import", title: "Readable history", status: "idle" }, turns: [] });
  owner.addProjectMember({ projectId: project.id, userId: "context-viewer", role: "viewer" });
  store.setLocalIdentity({ userId: "context-viewer", displayName: "Viewer" });
  try {
    const viewed = owner.getResearchThread("viewer-import");
    assert.equal(viewed.workspace_path, roots.next);
    assert.equal(viewed.workspace_id, owner.defaultProjectWorkspace(project.id).id);
    await assert.rejects(agent.runAgent({ dataStore: owner, threadId: viewed.id, projectId: project.id, workspaceId: viewed.workspace_id, workspace: viewed.workspace_path, prompt: "Must not execute as viewer" }), /access/);
    assert.equal(owner.getSnapshot().tasks.length, 0);
  } finally {
    store.setLocalIdentity({ userId: "local-user", displayName: "Local user", deviceId: "local-device", deviceName: "This device" });
  }
});

test("same imported thread id in two data stores has independent running/stop/approval identity", async t => {
  const roots = fixture(t);
  const a = store.createWorkspaceStore(roots.a), b = store.createWorkspaceStore(roots.b);
  const threadId = "shared-cloud-thread";
  for (const owner of [a, b]) owner.applyCloudThread(owner.defaultResearchProject().id, { thread: { id: threadId, title: "Shared", status: "idle" }, turns: [] });
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
  assert.equal(a.run(() => agent.interruptAgent(threadId)), true);
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

test("fresh-process recovery expires local executions, keeps final task output, and leaves cloud-only turns running", t => {
  const roots = fixture(t);
  const child = spawnSync(process.execPath, ["-e", `
    const store = require(${JSON.stringify(path.join(__dirname, "store.cjs"))});
    store.openWorkspace(process.argv[1]);
    function turn(prompt) {
      const thread = store.createResearchThread({prompt, mode:'free-chat'});
      const task = store.startTask({prompt});
      const turn = store.startResearchTurn({threadId:thread.id, taskId:task.id, prompt, mode:'free-chat'});
      return {thread,task,turn};
    }
    const orphan = turn('orphan');
    const persisted = turn('finished task only');
    store.finishTask(persisted.task.id,{response:'Durable completed output',status:'completed'});
    const action=store.createAction({taskId:orphan.task.id,kind:'command',payload:{command:'never executed'}});
    const command=store.startCommand({command:'old command',cwd:process.argv[1]});
    const cloudId='remote-still-running';
    store.applyCloudThread(orphan.thread.project_id,{thread:{id:cloudId,status:'running'},turns:[{id:'remote-turn',status:'running'}]});
    const mixed=turn('mixed local and remote');
    store.applyCloudThread(mixed.thread.project_id,{thread:{...mixed.thread,status:'running'},turns:[{id:'mixed-remote-turn',status:'running',created_at:new Date(Date.now()+1000).toISOString()}]});
    process.stdout.write(JSON.stringify({orphan:orphan.thread.id,persisted:persisted.thread.id,action:action.id,cloudId,command:command.id,mixed:mixed.thread.id,mixedLocal:mixed.turn.id}));
  `, roots.a], { encoding: "utf8" });
  assert.equal(child.status, 0, child.stderr);
  const ids = JSON.parse(child.stdout);
  const owner = store.createWorkspaceStore(roots.a);
  const orphan = owner.getResearchThread(ids.orphan);
  assert.equal(orphan.status, "idle");
  assert.equal(orphan.turns[0].status, "interrupted");
  assert.equal(orphan.events.at(-1).type, "run_recovered");
  assert.equal(owner.getAction(ids.action).status, "rejected");
  assert.equal(owner.getSnapshot().commands.find(command => command.id === ids.command).status, "interrupted");
  const persisted = owner.getResearchThread(ids.persisted);
  assert.equal(persisted.turns[0].status, "completed");
  assert.equal(persisted.turns[0].assistant_message, "Durable completed output");
  assert.equal(owner.getResearchThread(ids.cloudId).turns[0].status, "running");
  assert.equal(owner.getResearchThread(ids.cloudId).status, "running");
  const mixed = owner.getResearchThread(ids.mixed);
  assert.equal(mixed.turns.find(turn => turn.id === ids.mixedLocal).status, "interrupted");
  assert.equal(mixed.turns.find(turn => turn.id === "mixed-remote-turn").status, "running");
  assert.equal(mixed.status, "running", "a cloud running turn in the same thread must keep the run guard active");
  assert.throws(() => owner.archiveResearchThread(ids.mixed), /running/);
  const live = localTurn(owner);
  assert.equal(store.createWorkspaceStore(roots.a).getResearchThread(live.thread.id).status, "running", "switch/open during this process must not recover a live run");
  assert.equal(owner.getResearchThread(ids.orphan).events.filter(event => event.type === "run_recovered").length, 1);
});
