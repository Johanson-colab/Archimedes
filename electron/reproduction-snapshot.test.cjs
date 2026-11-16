const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");
const test = require("node:test");
const store = require("./store.cjs");
const { createReproductionRunManager } = require("./reproduction/run-manager.cjs");
const { localCheckoutSnapshot, snapshotApplicability } = require("./reproduction/run-snapshot.cjs");
const { createWorkspaceIpc } = require("./workspace-context.cjs");
const { registerThreadCommands } = require("./thread-commands.cjs");

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-run-snapshot-")));
  const owner = store.createWorkspaceStore(root);
  const folder = name => { const target = path.join(root, name); fs.mkdirSync(target); return target; };
  const a = owner.createResearchProject({ name: "A", workspacePath: folder("a") }), b = owner.createResearchProject({ name: "B", workspacePath: folder("b") });
  t.after(() => { store.closeAllWorkspaces(); fs.rmSync(root, { recursive: true, force: true }); });
  return { root, owner, a, b, folder };
}

test("a new run cannot inherit the previous run's passed verdict, while immutable historical receipts survive reopen", async t => {
  const f = fixture(t), workspace = f.owner.defaultProjectWorkspace(f.a.id);
  let record = f.owner.createReproduction({ projectId: f.a.id, workspaceId: workspace.id, title: "Controlled rerun" });
  record = f.owner.updateReproduction(record.id, { contract: { summary: "Fixture", repo: { url: "https://example.invalid/repo" }, steps: [
    { id: "check", title: "Check", command: "old-check", checkpoint: "the check succeeds", check: { kind: "command", command: "old-check" } },
  ] } });
  const decisions = [
    { action: "run", command: "old-check" },
    { action: "advance", step: "check", verdict: "passed", evidence: "ACTUAL_CHECK_PASSED" },
    { action: "done", summary: "First run passed" },
    { action: "done", summary: "Try to reuse old evidence" },
    { action: "ask", question: "Need new execution" },
  ];
  let commands = 0;
  const manager = createReproductionRunManager({ store: f.owner, complete: async () => ({ json: decisions.shift() }),
    environmentItems: () => [{ name: "FIXTURE_KEY", required: true, hasValue: true, value: "FAKE_VALUE_NOT_IN_SNAPSHOT" }] });
  const options = () => ({ record: f.owner.getReproduction(record.id), backendKind: "docker", repoName: "fixture", send: () => {}, prepare: async session => {
    session.adoptBackend(() => ({ image: "fixture-image", describe: () => "Fixture", dispose: async () => {}, writeFile: async () => {}, exec: async (_command, { onData }) => { commands++; onData?.("ACTUAL_CHECK_PASSED"); return { exitCode: 0, output: "ACTUAL_CHECK_PASSED", durationMs: 1 }; } }));
    return { checkout: { url: "https://example.invalid/repo", branch: "main", commit: "a".repeat(40), dirty: false, location: f.a.workspace_path, storage: "local" } };
  } });
  const first = manager.start(options()); await first.done;
  assert.equal(f.owner.getReproductionRun(first.run.id).status, "verified");
  const firstReceipt = f.owner.getReproductionRun(first.run.id).snapshot;
  assert.equal(firstReceipt.final.runbook[0].status, "passed");
  const second = manager.start(options());
  assert.equal(f.owner.getReproduction(record.id).contract.steps[0].status, "pending");
  const result = await second.done;
  assert.notEqual(result.status, "verified");
  assert.equal(commands, 1, "second run did not execute, so cannot reuse the first run's evidence");
  assert.equal(f.owner.getReproductionRun(second.run.id).snapshot.plan.contract.steps[0].evidence, "");
  assert.equal(firstReceipt.owner.projectId, f.a.id);
  assert.equal(firstReceipt.prepared.checkout.commit, "a".repeat(40));
  assert.ok(!JSON.stringify(firstReceipt).includes("FAKE_VALUE_NOT_IN_SNAPSHOT"));
  assert.throws(() => f.owner.updateReproductionRunSnapshot(first.run.id, { final: { status: "invented" } }), /cannot be rewritten/);
  f.owner.close();
  assert.deepEqual(store.createWorkspaceStore(f.root).getReproductionRun(first.run.id).snapshot, firstReceipt);
});

test("actual Git commit/dirty and known paper/plan changes are recorded without claiming untracked environments", async t => {
  const f = fixture(t), repo = f.folder("repo");
  const git = args => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git(["init"]); fs.writeFileSync(path.join(repo, "main.py"), "print('original')\n"); git(["add", "."]);
  git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture"]);
  const commit = git(["rev-parse", "HEAD"]);
  assert.deepEqual(await localCheckoutSnapshot(repo, { url: "https://example.invalid/repo", branch: "main" }), { url: "https://example.invalid/repo", branch: "main", location: repo, storage: "local", commit, dirty: false });
  fs.writeFileSync(path.join(repo, "main.py"), "print('changed')\n");
  assert.equal((await localCheckoutSnapshot(repo)).dirty, true);
  const record = { paper_id: "paper", contract: { steps: [{ title: "Same", command: "first" }] } };
  const { initialSnapshot } = require("./reproduction/run-snapshot.cjs");
  const snapshot = initialSnapshot(record, f.owner, { reader: { asset: { sha256: "old" } } });
  assert.equal(snapshotApplicability(snapshot, record, { asset: { sha256: "old" } }).status, "recorded");
  assert.equal(snapshotApplicability(snapshot, { ...record, contract: { steps: [{ title: "Changed", command: "second" }] } }, { asset: { sha256: "new" } }).reasons.length, 2);
  assert.match(snapshot.environment.coverage, /not fingerprinted/);
  assert.equal(snapshotApplicability(null, record).status, "legacy-unrecorded");
  const restored = snapshotApplicability({ ...snapshot, restoration: { version: 1, originalRunId: "history" } }, record, { asset: { sha256: "old" } });
  assert.equal(restored.status, "restored-history"); assert.match(restored.reasons[0], /not executed in the restored/);
});

test("legacy reproduction binding is explicit and cannot move an existing record across project workspaces", t => {
  const f = fixture(t), wa = f.owner.defaultProjectWorkspace(f.a.id), wb = f.owner.defaultProjectWorkspace(f.b.id);
  const papers = f.owner.createLibrary({ projectId: f.a.id, name: "A inputs" });
  const paper = f.owner.addPaper(papers.id, { title: "A's paper", authors: [] });
  assert.throws(() => f.owner.createReproduction({ projectId: f.b.id, paperId: paper.id }), /paper does not belong/);
  assert.equal(f.owner.createReproduction({ projectId: f.a.id, paperId: paper.id }).project_id, f.a.id);
  const record = f.owner.createReproduction({ projectId: f.a.id, title: "Legacy fixture" });
  const db = new DatabaseSync(path.join(f.root, ".archimedes/archimedes.db"));
  try { db.prepare("UPDATE reproductions SET project_id = NULL, workspace_id = NULL, execution_root = NULL WHERE id = ?").run(record.id); } finally { db.close(); }
  assert.equal(f.owner.listReproductions({ projectId: f.a.id, workspaceId: wa.id }).some(row => row.id === record.id), false);
  assert.equal(f.owner.listReproductions({ projectId: f.a.id, workspaceId: wa.id, includeUnassigned: true }).some(row => row.id === record.id), true);
  assert.throws(() => f.owner.bindReproductionContext(record.id, { projectId: f.a.id, workspaceId: wb.id }), /does not belong/);
  const bound = f.owner.bindReproductionContext(record.id, { projectId: f.a.id, workspaceId: wa.id });
  assert.equal(bound.execution_root, f.a.workspace_path);
  assert.throws(() => f.owner.bindReproductionContext(record.id, { projectId: f.b.id, workspaceId: wb.id }), /already belongs/);
  assert.equal(f.owner.listReproductions({ projectId: f.b.id, workspaceId: wb.id, includeUnassigned: true }).length, 0);
});

test("basedOnThreadId creates an empty linked session in its real historical root and refuses conflicting owners", t => {
  const f = fixture(t), workspace = f.owner.defaultProjectWorkspace(f.a.id);
  const source = f.owner.createResearchThread({ projectId: f.a.id, workspaceId: workspace.id, prompt: "Original manuscript", mode: "free-chat" });
  const task = f.owner.startTask({ prompt: "History" });
  const turn = f.owner.startResearchTurn({ threadId: source.id, taskId: task.id, prompt: "History", mode: "free-chat" });
  f.owner.finishTask(task.id, { status: "completed", response: "Old output" }); f.owner.finishResearchTurn(turn.id, { status: "completed", response: "Old output" });
  const next = f.folder("new-default"); f.owner.setResearchProjectWorkspace(f.a.id, next);
  const handlers = new Map();
  const ipcMain = createWorkspaceIpc({ ipcMain: { handle: (name, handler) => handlers.set(name, handler) }, store, workspaceForEvent: () => f.root });
  registerThreadCommands({ ipcMain, store, dataWorkspace: () => f.root });
  const create = input => handlers.get("research-thread:create")({ sender: { id: 1 } }, input);
  const revision = create({ basedOnThreadId: source.id, projectId: f.a.id, workspaceId: workspace.id });
  assert.equal(revision.workspace_path, source.workspace_path); assert.equal(revision.based_on_thread_id, source.id);
  assert.equal(revision.turns.length, 0);
  assert.equal(create({ projectId: f.a.id, workspaceId: workspace.id }).workspace_path, next);
  assert.throws(() => create({ basedOnThreadId: source.id, projectId: f.b.id }), /does not belong/);
  assert.throws(() => create({ basedOnThreadId: source.id, workspacePath: next }), /does not match/);
});

test("actual run history IPC returns each saved receipt and enforces parent project and data-root ownership", t => {
  const f = fixture(t);
  let record = f.owner.createReproduction({ projectId: f.a.id, title: "History" });
  record = f.owner.updateReproduction(record.id, { contract: { steps: [{ title: "First", command: "first" }] } });
  const { initialSnapshot } = require("./reproduction/run-snapshot.cjs");
  const run = f.owner.createReproductionRun({ reproductionId: record.id, snapshot: initialSnapshot(record, f.owner) });
  f.owner.updateReproductionRun(run.id, { status: "verified" });
  f.owner.updateReproduction(record.id, { contract: { steps: [{ title: "Second", command: "second" }] } });
  const other = f.owner.createReproduction({ projectId: f.b.id, title: "Other owner" });
  const otherRun = f.owner.createReproductionRun({ reproductionId: other.id });
  const handlers = new Map(); let selected = f.root;
  const ipcMain = createWorkspaceIpc({ ipcMain: { handle: (name, callback) => handlers.set(name, callback) }, store, workspaceForEvent: () => selected });
  const source = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
  const start = source.indexOf("  const presentReproductionRun =");
  const end = source.indexOf('  ipcMain.handle("reproduction:create",', start);
  assert.ok(start >= 0 && end > start);
  new Function("ipcMain", "store", "snapshotApplicability", "presentReproduction", source.slice(start, end))(ipcMain, store, snapshotApplicability, value => value);
  const call = (name, input) => handlers.get(name)({ sender: { id: 1 } }, input);
  f.owner.addProjectMember({ projectId: f.a.id, userId: "history-viewer", role: "viewer" });
  store.setLocalIdentity({ userId: "history-viewer", displayName: "Viewer" });
  try {
    const historical = call("reproduction:get-run", { runId: run.id });
    assert.equal(historical.snapshot.plan.contract.steps[0].command, "first");
    assert.equal(historical.snapshot_state.status, "stale");
    assert.equal(call("reproduction:list-runs", { reproductionId: record.id })[0].id, run.id);
    assert.throws(() => call("reproduction:get-run", { runId: otherRun.id }), /access/);
    const anotherData = f.folder("another-data"); selected = anotherData;
    assert.equal(call("reproduction:get-run", { runId: run.id }), null);
    assert.throws(() => call("reproduction:list-runs", { reproductionId: record.id }), /does not exist/);
  } finally { store.setLocalIdentity({ userId: "local-user", displayName: "Local user", deviceId: "local-device", deviceName: "This device" }); }
});
