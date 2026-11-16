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
