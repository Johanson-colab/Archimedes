const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const store = require("./store.cjs");
const { createReproductionRunManager } = require("./reproduction/run-manager.cjs");
const { runPilot } = require("./reproduction/pilot.cjs");

function deferred() { let resolve; const promise = new Promise(value => { resolve = value; }); return { promise, resolve }; }
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-reproduction-life-")));
  const owner = store.createWorkspaceStore(root);
  t.after(() => { store.closeAllWorkspaces(); fs.rmSync(root, { recursive: true, force: true }); });
  const record = owner.createReproduction({ title: "Controlled run", repoUrl: "https://github.com/example/fixture" });
  const planned = owner.updateReproduction(record.id, { status: "planned", contract: { summary: "Fixture", repo: { url: record.repo_url }, steps: [], findings: [] } });
  return { root, owner, record: planned };
}

test("Stop while checkout or backend preparation is deferred prevents every later stage and persists one stopped result", async t => {
  const f = fixture(t);
  for (const phase of ["checkout", "backend"]) {
    const gate = deferred(), entered = deferred(), events = [];
    let pilots = 0, backends = 0, disposed = 0;
    const manager = createReproductionRunManager({ store: f.owner, runPilot: async () => { pilots++; return { status: "verified" }; } });
    const session = manager.start({ record: f.record, backendKind: "docker", send: event => events.push(event), prepare: async session => {
      if (phase === "checkout") { entered.resolve(); await session.stage(() => gate.promise); }
      const backend = session.adoptBackend(() => { backends++; return { prepare: async () => { entered.resolve(); await gate.promise; }, dispose: async () => { disposed++; } }; });
      await session.stage(() => backend.prepare());
    } });
    await entered.promise;
    assert.equal(manager.stop(f.record.id), true);
    assert.equal(manager.stop(f.record.id), true, "repeated Stop is harmless while finishing");
    gate.resolve(); await session.done;
    assert.equal(pilots, 0);
    assert.equal(backends, phase === "checkout" ? 0 : 1);
    assert.equal(disposed, phase === "checkout" ? 0 : 1);
    assert.equal(events.filter(event => event.type === "finished").length, 1);
    assert.equal(f.owner.getReproductionRun(session.run.id).status, "stopped");
    assert.equal(f.owner.getReproduction(f.record.id).status, "cancelled");
    assert.equal(manager.activeCount, 0);
  }
});

test("a real pilot waiting for its model reports cancellation as stopped and does not retry an incomplete model", async () => {
  const controller = new AbortController(), entered = deferred();
  const pending = runPilot({ title: "Fixture", steps: [{ id: "check", title: "Check", check: { kind: "manual", reason: "Fixture" } }], backend: {}, signal: controller.signal, complete: ({ signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(Object.assign(new Error("Fixture aborted"), { name: "AbortError" })), { once: true }); entered.resolve();
  }) });
  await entered.promise; controller.abort();
  assert.equal((await pending).status, "stopped");
  let requests = 0;
  const incomplete = await runPilot({ title: "Fixture", steps: [{ id: "check", title: "Check", check: { kind: "manual", reason: "Fixture" } }], backend: {}, complete: async () => { requests++; throw Object.assign(new Error("Partial model response"), { code: "MODEL_RESPONSE_INCOMPLETE" }); } });
  assert.equal(incomplete.status, "failed");
  assert.equal(requests, 1);
});

test("shutdown is bounded for an unresponsive preparation and late completion cannot start a pilot or duplicate cleanup", async t => {
  const f = fixture(t), gate = deferred(), entered = deferred();
  let pilots = 0, disposed = 0;
  const manager = createReproductionRunManager({ store: f.owner, runPilot: async () => { pilots++; } });
  const session = manager.start({ record: f.record, backendKind: "docker", send: () => {}, prepare: async session => {
    const backend = session.adoptBackend(() => ({ prepare: async () => { entered.resolve(); await gate.promise; }, dispose: async () => { disposed++; } }));
    await session.stage(() => backend.prepare());
  } });
  await entered.promise;
  const result = await manager.shutdown({ timeoutMs: 20 });
  assert.equal(result.pending, 1);
  assert.equal(disposed, 1);
  assert.throws(() => manager.start({ record: f.record }), /closing/);
  gate.resolve(); await session.done;
  assert.equal(pilots, 0);
  assert.equal(disposed, 1);
  assert.equal(f.owner.getReproductionRun(session.run.id).status, "stopped");
});

test("a detached run retains its original database and persisted resource ownership until cleanup finishes", async t => {
  const f = fixture(t), entered = deferred(), gate = deferred();
  let signal;
  const manager = createReproductionRunManager({ store: f.owner, runPilot: async input => { signal = input.signal; entered.resolve(); await gate.promise; return { status: "verified", steps: [], runbook: [], summary: "Checks passed" }; } });
  const session = manager.start({ record: f.record, backendKind: "docker", send: () => {}, prepare: async session => {
    session.adoptBackend(() => ({ resource: () => ({ kind: "docker", container: "fixture", runId: session.run.id, ownerToken: session.ownerToken }), dispose: async () => {} }));
  } });
  await entered.promise;
  const otherRoot = path.join(f.root, "other"); fs.mkdirSync(otherRoot);
  const other = store.createWorkspaceStore(otherRoot);
  f.owner.close();
  assert.equal(signal.aborted, false);
  gate.resolve(); await session.done;
  const restored = store.createWorkspaceStore(f.root);
  assert.equal(restored.getReproductionRun(session.run.id).status, "verified");
  assert.equal(restored.getReproduction(f.record.id).status, "checks-passed");
  assert.equal(restored.listUnreleasedReproductionResources().length, 0);
  assert.equal(other.listReproductions().length, 0);
});

test("reopening recovers only persisted resources owned by this database and exact run", async t => {
  const f = fixture(t);
  const ownerToken = f.owner.reproductionResourceOwner();
  const valid = f.owner.createReproductionRun({ reproductionId: f.record.id });
  const foreign = f.owner.createReproductionRun({ reproductionId: f.record.id });
  const unknown = f.owner.createReproductionRun({ reproductionId: f.record.id });
  f.owner.setReproductionResource(valid.id, { kind: "docker", container: "owned", runId: valid.id, ownerToken, dataRoot: f.root });
  f.owner.setReproductionResource(foreign.id, { kind: "docker", container: "foreign", runId: foreign.id, ownerToken: "another-database", dataRoot: f.root });
  f.owner.setReproductionResource(unknown.id, { kind: "docker", container: "unknown", runId: unknown.id, ownerToken });
  f.owner.updateReproduction(f.record.id, { status: "running" });
  f.owner.close();
  const alias = path.join(f.root, "canonical-alias"); fs.symlinkSync(f.root, alias, process.platform === "win32" ? "junction" : "dir");
  const restored = store.createWorkspaceStore(alias);
  assert.equal(restored.getReproductionRun(valid.id).status, "interrupted");
  const removed = [];
  const gate = deferred();
  const manager = createReproductionRunManager({ store: restored, recoverResource: async resource => { removed.push(resource.container); await gate.promise; } });
  const first = manager.recoverWorkspace(restored);
  let secondFinished = false;
  const second = manager.recoverWorkspace(restored).then(() => { secondFinished = true; });
  await Promise.resolve();
  assert.equal(secondFinished, false, "a run/start caller must wait for the same initial recovery job");
  gate.resolve(); await first; await second;
  assert.deepEqual(removed, ["owned"]);
  assert.deepEqual(restored.listUnreleasedReproductionResources().map(item => item.resource.container).sort(), ["foreign", "unknown"]);
  assert.match(restored.getReproductionRun(unknown.id).error, /unknown or different data workspace/);
  assert.equal(restored.reproductionResourceOwner(), ownerToken);
});

test("a directly copied database cannot reclaim an original data workspace's still-active run resources", async t => {
  const f = fixture(t), entered = deferred(), finish = deferred();
  let disposed = false;
  const active = createReproductionRunManager({ store: f.owner, runPilot: async () => { entered.resolve(); await finish.promise; return { status: "verified", summary: "Original still owned its run" }; } });
  const session = active.start({ record: f.record, backendKind: "docker", send: () => {}, prepare: async current => {
    current.adoptBackend(() => ({ resource: () => ({ kind: "docker", container: "still-live-A", runId: current.run.id, ownerToken: current.ownerToken }), dispose: async () => { disposed = true; } }));
  } });
  try {
    await entered.promise;
    const copy = path.join(f.root, "copied-data"); fs.mkdirSync(path.join(copy, ".archimedes"), { recursive: true });
    const { DatabaseSync } = require("node:sqlite");
    const source = new DatabaseSync(path.join(f.root, ".archimedes/archimedes.db"));
    try { source.prepare("VACUUM INTO ?").run(path.join(copy, ".archimedes/archimedes.db")); } finally { source.close(); }
    const copied = store.createWorkspaceStore(copy), reclaimed = [];
    const recovering = createReproductionRunManager({ store: copied, recoverResource: async resource => { reclaimed.push(resource.container); } });
    await recovering.recoverWorkspace(copied);
    assert.deepEqual(reclaimed, [], "a cloned owner UUID/run ID cannot authorize cleanup from a different canonical data root");
    assert.equal(active.activeCount, 1); assert.equal(disposed, false);
    assert.match(copied.getReproductionRun(session.run.id).error, /data workspace|scope/i);
    assert.equal(copied.listUnreleasedReproductionResources()[0].resource.dataRoot, f.root, "opening a copy must never rewrite the original receipt scope");
  } finally { finish.resolve(); await session.done; }
});

test("real main IPC keeps run and late plan events scoped when two data roots contain the same reproduction ID", { timeout: 10_000 }, async t => {
  const f = fixture(t), copy = path.join(f.root, "event-copy");
  const project = f.owner.createResearchProject({ name: "Explicit plan owner" });
  const projectWorkspace = f.owner.defaultProjectWorkspace(project.id);
  const library = f.owner.createLibrary({ projectId: project.id, name: "Plan inputs" });
  const paper = f.owner.addPaper(library.id, { title: "Scoped paper", authors: [], github_url: "https://github.com/example/fixture" });
  f.owner.addPaper(f.owner.listLibraries(f.record.project_id)[0].id, paper);
  const specialists = [{ id: "method", title: "Method", status: "complete", response: "Controlled reading fixture" }];
  f.owner.savePaperReview(paper.id, { specialists, summary: { response: "Default project review must not be used" } }, f.record.project_id);
  f.owner.savePaperReview(paper.id, { specialists, summary: { response: "Scoped project review" } }, project.id);
  const record = f.owner.createReproduction({ projectId: project.id, workspaceId: projectWorkspace.id, paperId: paper.id, repoUrl: paper.github_url });
  const contract = { summary: "Scoped fixture", repo: { url: paper.github_url }, steps: [], findings: [] };
  f.owner.updateReproduction(record.id, { contract, status: "planned" });
  fs.mkdirSync(path.join(copy, ".archimedes"), { recursive: true });
  const { DatabaseSync } = require("node:sqlite"), db = new DatabaseSync(path.join(f.root, ".archimedes/archimedes.db"));
  try { db.prepare("VACUUM INTO ?").run(path.join(copy, ".archimedes/archimedes.db")); } finally { db.close(); }
  const copied = store.createWorkspaceStore(copy);
  assert.equal(copied.getReproduction(record.id).id, record.id);
  const windows = new Map([[1, f.root], [2, f.root]]), handlers = new Map(), events = [];
  const { createWorkspaceIpc } = require("./workspace-context.cjs");
  const ipcMain = createWorkspaceIpc({ ipcMain: { handle: (name, handler) => handlers.set(name, handler) }, store, workspaceForEvent: event => windows.get(event.sender.id) });
  const gates = new Map([[f.root, { entered: deferred(), finish: deferred() }], [copy, { entered: deferred(), finish: deferred() }]]);
  const planEntered = deferred(), planFinish = deferred(); let pilotCalls = 0;
  const vm = require("node:vm");
  const source = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8"), start = source.indexOf("  const notifyRunFinished ="), end = source.indexOf('  ipcMain.handle("library:deep-search",', start);
  assert.ok(start >= 0 && end > start);
  const sandbox = vm.createContext({ AbortController, setTimeout, clearTimeout, store, ipcMain,
    createReproductionRunManager, localCheckoutSnapshot: require("./reproduction/run-snapshot.cjs").localCheckoutSnapshot,
    Notification: { isSupported: () => false }, BrowserWindow: { fromWebContents: () => null, getAllWindows: () => [] },
    modelConfig: { getActiveModelConfig: () => ({ provider: "custom", apiKey: "fake-not-a-credential" }) },
    reproductionEnv: { values: () => ({}) }, reproductionEnvItems: () => [], sshServers: { listServers: () => [] },
    presentReproduction: value => value, resolveWorkspace: fs.realpathSync, windowWorkspaces: windows,
    repoNameFromUrl: () => "fixture", getRepositoryCheckout: async () => ({ commit: "fixture" }), resolveAuditPath: async () => ({ root: store.currentStore().workspace }),
    createDockerBackend: ({ dataRoot }) => ({ image: "fixture", describe: () => "Controlled backend", prepare: async () => { const gate = gates.get(dataRoot); gate.entered.resolve(); await gate.finish.promise; }, dispose: async () => {} }),
    runPilot: async () => { pilotCalls++; return { status: "verified" }; },
    findRepositoryUrl: () => ({ url: paper.github_url, source: "paper" }),
    prepareRepositoryItem: async () => { planEntered.resolve(); await planFinish.promise; return { id: "fixture" }; },
    planReproduction: async ({ emit, review }) => { assert.equal(review.summary, "Scoped project review"); emit({ type: "planning", detail: "Delayed owner-bound plan" }); return contract; },
    agent: { runAgent: async () => { throw new Error("No model is allowed in this fixture"); } },
  });
  vm.runInContext(source.slice(start, end), sandbox);
  const event = id => ({ sender: { id, isDestroyed: () => false, send: (channel, payload) => events.push({ channel, payload, visibleRoot: windows.get(id) }) } });
  const reached = async root => {
    let timer;
    try { await Promise.race([gates.get(root).entered.promise, new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`Preparation did not start: ${store.createWorkspaceStore(root).getLatestReproductionRun(record.id)?.error || "no run error"}`)), 1_000); })]); }
    finally { clearTimeout(timer); }
  };
  let planning;
  try {
    await handlers.get("reproduction:run")(event(1), { id: record.id }); await reached(f.root);
    windows.set(1, copy);
    await handlers.get("reproduction:run")(event(1), { id: record.id }); await reached(copy);
    assert.equal(handlers.get("reproduction:stop")(event(1), { id: record.id }), true);
    assert.equal(handlers.get("reproduction:stop")(event(2), { id: record.id }), true);
    for (const gate of gates.values()) gate.finish.resolve();
    await vm.runInContext("reproductionRuns.shutdown()", sandbox);
    assert.equal(pilotCalls, 0);
    const completed = events.filter(event => event.channel === "reproduction:run-event" && event.payload.type === "finished");
    assert.deepEqual(completed.map(event => event.payload.dataRoot).sort(), [copy, f.root].sort());
    assert.ok(completed.some(event => event.payload.dataRoot === f.root && event.visibleRoot === copy));
    for (const item of completed) { assert.equal(item.payload.reproductionId, record.id); assert.equal(item.payload.projectId, record.project_id); assert.equal(item.payload.workspaceId, record.workspace_id); }
    windows.set(1, f.root);
    planning = handlers.get("reproduction:plan")(event(1), { id: record.id }); await planEntered.promise;
    events.length = 0; windows.set(1, copy); planFinish.resolve(); await planning;
    const late = events.filter(event => event.channel === "reproduction:plan-event");
    assert.ok(late.length > 0);
    assert.ok(late.every(event => event.visibleRoot === copy && event.payload.dataRoot === f.root && event.payload.reproductionId === record.id));
    assert.equal(f.owner.getReproduction(record.id).status, "planned");
    assert.equal(copied.getReproduction(record.id).status, "cancelled");
  } finally {
    for (const gate of gates.values()) gate.finish.resolve(); planFinish.resolve();
    await vm.runInContext("reproductionRuns.shutdown()", sandbox); await planning?.catch(() => {});
  }
});

test("the actual quit handler waits for bounded run shutdown before closing stores and prevents duplicate cleanup", async () => {
  const source = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
  const start = source.indexOf('app.on("before-quit",');
  const gate = deferred(), calls = [];
  let handler, prevented = 0;
  const event = { preventDefault: () => { prevented++; } };
  const app = { on: (_name, callback) => { handler = callback; }, quit: () => { calls.push("quit"); handler(event); } };
  new Function("app", "store", "agent", "shutdownReproductionRuns", "closeAllNativeClients", "closeAllTerminals", "collaborationServer", "presence",
    `let readyToQuit = false, quitting = false;\n${source.slice(start)}`)(app, { closeAllWorkspaces: () => calls.push("stores") }, { shutdownAgents: async () => { calls.push("agents"); } }, async () => { calls.push("shutdown"); await gate.promise; calls.push("disposed"); }, () => calls.push("native"), () => calls.push("terminals"), { close: () => calls.push("server") }, { closeAll: () => calls.push("presence") });
  handler(event); handler(event);
  await Promise.resolve();
  assert.deepEqual(calls, ["native", "terminals", "shutdown", "agents"]);
  assert.equal(prevented, 2);
  gate.resolve(); await new Promise(setImmediate);
  assert.equal(calls.filter(call => call === "shutdown").length, 1);
  assert.equal(calls.filter(call => call === "quit").length, 1);
  assert.equal(calls.indexOf("stores") > calls.indexOf("disposed"), true);
});
