const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { snapshotWorkspace, compareWorkspaceSnapshots } = require("./workspace-files.cjs");

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-snapshot-budget-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test("snapshot bounds actual text reads and skips generated Python environments while preserving metadata change detection", t => {
  const root = fixture(t);
  for (let index = 0; index < 20; index++) fs.writeFileSync(path.join(root, `${String(index).padStart(2, "0")}.txt`), "a".repeat(900_000));
  fs.mkdirSync(path.join(root, ".venv", "site-packages"), { recursive: true });
  fs.writeFileSync(path.join(root, ".venv", "site-packages", "ignored.py"), "x".repeat(900_000));
  let bytes = 0;
  const read = fs.readFileSync;
  let before;
  try {
    fs.readFileSync = (file, ...options) => { const result = read(file, ...options); bytes += Buffer.byteLength(result); return result; };
    before = snapshotWorkspace(root);
  } finally { fs.readFileSync = read; }
  assert.ok(bytes <= 8_000_000, `actual read bytes ${bytes} exceed the snapshot I/O budget`);
  assert.equal(before.coverage.textBytesRead, bytes);
  assert.equal(before.size, 20);
  assert.equal(before.coverage.ignoredDirectories, 1);
  assert.equal(before.coverage.generatedDirectories, 1);
  assert.ok(before.coverage.metadataOnly > 0);
  assert.equal(before.has(".venv/site-packages/ignored.py"), false);
  const outsideBudget = [...before].find(([, file]) => file.tracking === "metadata")[0];
  fs.appendFileSync(path.join(root, outsideBudget), "changed\n");
  assert.deepEqual(compareWorkspaceSnapshots(before, snapshotWorkspace(root)).map(change => change.path), [outsideBudget]);
});

test("changing budget placement does not invent modifications and ordinary text still has meaningful line diffs", t => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, "b.txt"), "b".repeat(900_000));
  for (let index = 0; index < 8; index++) fs.writeFileSync(path.join(root, `c-${index}.txt`), "c".repeat(900_000));
  const before = snapshotWorkspace(root);
  fs.writeFileSync(path.join(root, "a.txt"), "a".repeat(900_000));
  const after = snapshotWorkspace(root);
  assert.ok([...before.keys()].some(file => before.get(file).tracking !== after.get(file).tracking));
  assert.deepEqual(compareWorkspaceSnapshots(before, after).map(change => [change.path, change.status]), [["a.txt", "created"]]);
  fs.writeFileSync(path.join(root, "a.txt"), "first\nsecond\n");
  const changed = compareWorkspaceSnapshots(after, snapshotWorkspace(root)).find(change => change.path === "a.txt");
  assert.equal(changed.status, "modified"); assert.equal(changed.additions, 2); assert.equal(changed.deletions, 1);
});

test("ordinary files with generated-environment names remain in change receipts", t => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, "venv"), "original");
  fs.writeFileSync(path.join(root, ".venv"), "original");
  const before = snapshotWorkspace(root);
  assert.equal(before.coverage.generatedDirectories, 0);
  for (const name of ["venv", ".venv"]) fs.appendFileSync(path.join(root, name), " changed");
  assert.deepEqual(compareWorkspaceSnapshots(before, snapshotWorkspace(root)).map(({ path, status }) => [path, status]), [
    [".venv", "modified"], ["venv", "modified"],
  ]);
});

test("an approved command persists scan coverage and only reports actual read limits", async t => {
  const root = fixture(t);
  for (let index = 0; index < 10; index++) fs.writeFileSync(path.join(root, `${index}.txt`), "a".repeat(900_000));
  fs.mkdirSync(path.join(root, ".venv"));
  fs.writeFileSync(path.join(root, ".venv", "generated.py"), "generated environment");
  const store = require("./store.cjs"), agent = require("./agent.cjs");
  store.openWorkspace(root);
  const thread = store.createResearchThread({ prompt: "Snapshot command coverage", mode: "free-chat" });
  const task = store.startTask({ prompt: "Create a result file" });
  const events = [], recorded = [];
  const context = {
    root, taskId: task.id, threadId: thread.id, turnId: "snapshot-coverage-turn",
    call: { id: "snapshot-command", type: "function", function: { name: "propose_command", arguments: JSON.stringify({ command: 'node -e "require(\'fs\').writeFileSync(\'result.txt\', \'command output\')"' }) } },
    capabilities: { write: "deny", command: "ask" }, contextItems: [], foundPapers: new Map(), pdfCache: new Map(),
    signal: new AbortController().signal,
    emit(event) {
      events.push(event);
      if (event.type === "approval") {
        store.resolveAction(event.action.id, "approved");
        agent.resolveApproval(event.action.id, true, "snapshot test");
      }
    },
    recordEvent: event => recorded.push(event),
  };
  const result = await agent.executeTool(context);
  const action = store.getAction(JSON.parse(result.content).action_id);
  assert.equal(fs.readFileSync(path.join(root, "result.txt"), "utf8"), "command output");
  assert.ok(action.payload.snapshotCoverage.after.textBytesRead <= 8_000_000);
  assert.ok(action.payload.snapshotCoverage.after.metadataOnly > 0);
  assert.ok(action.payload.snapshotCoverage.after.ignoredDirectories > 0);
  assert.ok(action.payload.snapshotCoverage.after.generatedDirectories > 0);
  assert.ok(action.payload.changes.some(change => change.path === "result.txt" && change.status === "created"));
  const coverageEvent = recorded.find(event => event.type === "workspace_snapshot_coverage");
  assert.equal(coverageEvent.payload.after.metadataOnly, action.payload.snapshotCoverage.after.metadataOnly);
  const limitedNotice = events.find(event => event.title === "Workspace change scan is limited");
  assert.ok(limitedNotice);
  assert.deepEqual(limitedNotice.snapshotCoverage, action.payload.snapshotCoverage);
  fs.rmSync(path.join(root, ".venv"), { recursive: true, force: true });
  for (let index = 0; index < 10; index++) fs.unlinkSync(path.join(root, `${index}.txt`));
  fs.mkdirSync(path.join(root, ".git"));
  events.length = 0; recorded.length = 0;
  const ordinary = await agent.executeTool({ ...context, call: { ...context.call, id: "ordinary-command" } });
  const ordinaryCoverage = store.getAction(JSON.parse(ordinary.content).action_id).payload.snapshotCoverage.after;
  assert.ok(ordinaryCoverage.ignoredDirectories > 0);
  assert.equal(ordinaryCoverage.generatedDirectories, 0);
  assert.equal(ordinaryCoverage.byteBudgetReached, false);
  assert.equal(events.some(event => event.title === "Workspace change scan is limited"), false);
  assert.equal(recorded.some(event => event.type === "workspace_snapshot_coverage"), false);
});

test("a command that removes its own large files still reports the limited before snapshot", async t => {
  const root = fixture(t);
  for (let index = 0; index < 10; index++) fs.writeFileSync(path.join(root, `${index}.txt`), "a".repeat(900_000));
  fs.mkdirSync(path.join(root, ".git"));
  const store = require("./store.cjs"), agent = require("./agent.cjs");
  store.openWorkspace(root);
  const thread = store.createResearchThread({ prompt: "Snapshot before coverage", mode: "free-chat" });
  const task = store.startTask({ prompt: "Delete large files" });
  const events = [], recorded = [];
  const context = {
    root, taskId: task.id, threadId: thread.id, turnId: "snapshot-before-turn",
    call: { id: "snapshot-delete", type: "function", function: { name: "propose_command", arguments: JSON.stringify({ command: 'node -e "const fs=require(\'fs\'); for (let i=0;i<10;i++) fs.rmSync(i+\'.txt\'); fs.writeFileSync(\'result.txt\', \'command output\')"' }) } },
    capabilities: { write: "deny", command: "ask" }, contextItems: [], foundPapers: new Map(), pdfCache: new Map(),
    signal: new AbortController().signal,
    emit(event) {
      events.push(event);
      if (event.type === "approval") {
        store.resolveAction(event.action.id, "approved");
        agent.resolveApproval(event.action.id, true, "snapshot test");
      }
    },
    recordEvent: event => recorded.push(event),
  };
  const result = await agent.executeTool(context);
  const action = store.getAction(JSON.parse(result.content).action_id);
  const { before, after } = action.payload.snapshotCoverage;
  assert.equal(before.byteBudgetReached, true);
  assert.equal(before.entryLimitReached, false);
  assert.equal(after.byteBudgetReached, false);
  assert.equal(after.entryLimitReached, false);
  assert.ok(before.ignoredDirectories >= 2);
  assert.equal(before.generatedDirectories, 0);
  assert.deepEqual(action.payload.changes.map(change => [change.path, change.status]), [
    ...Array.from({ length: 10 }, (_, index) => [`${index}.txt`, "deleted"]),
    ["result.txt", "created"],
  ]);
  const coverageEvent = recorded.find(event => event.type === "workspace_snapshot_coverage");
  assert.ok(coverageEvent);
  assert.deepEqual(coverageEvent.payload, action.payload.snapshotCoverage);
  const limitedNotice = events.find(event => event.title === "Workspace change scan is limited");
  assert.ok(limitedNotice);
  assert.deepEqual(limitedNotice.snapshotCoverage, action.payload.snapshotCoverage);
  const ordinary = await agent.executeTool({
    ...context,
    call: { id: "ordinary-small-command", type: "function", function: { name: "propose_command", arguments: JSON.stringify({ command: 'node -e "require(\'fs\').writeFileSync(\'second.txt\', \'ok\')"' }) } },
  });
  const ordinaryCoverage = store.getAction(JSON.parse(ordinary.content).action_id).payload.snapshotCoverage;
  assert.equal(ordinaryCoverage.before.byteBudgetReached, false);
  assert.equal(ordinaryCoverage.after.byteBudgetReached, false);
  assert.ok(ordinaryCoverage.before.ignoredDirectories >= 2);
  assert.ok(ordinaryCoverage.after.ignoredDirectories >= 2);
  assert.equal(ordinaryCoverage.before.generatedDirectories, 0);
  assert.equal(ordinaryCoverage.after.generatedDirectories, 0);
  assert.equal(events.filter(event => event.title === "Workspace change scan is limited").length, 1);
  assert.equal(recorded.filter(event => event.type === "workspace_snapshot_coverage").length, 1);
});
