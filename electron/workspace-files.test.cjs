const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  compareWorkspaceSnapshots,
  fileChangeForContent,
  listWorkspaceTree,
  readWorkspaceFile,
  snapshotWorkspace,
  workspacePath,
  writeWorkspaceTextFile,
} = require("./workspace-files.cjs");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-workspace-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "src", "index.js"), "const answer = 41;\n");
  fs.mkdirSync(path.join(root, "node_modules"));
  fs.writeFileSync(path.join(root, "node_modules", "ignored.js"), "ignored\n");
  return root;
}

test("lists a bounded workspace tree and ignores dependency folders", () => {
  const root = fixture();
  const tree = listWorkspaceTree(root);
  assert.equal(tree.entries[0].name, "src");
  assert.equal(tree.entries[0].children[0].path, "src/index.js");
  assert.equal(tree.entries.some((entry) => entry.name === "node_modules"), false);
  fs.rmSync(root, { recursive: true, force: true });
});

test("reads and writes text without allowing workspace escapes", () => {
  const root = fixture();
  const file = readWorkspaceFile(root, "src/index.js");
  assert.match(file.content, /answer/);
  writeWorkspaceTextFile(root, "notes/result.md", "# Result\n");
  assert.equal(readWorkspaceFile(root, "notes/result.md").kind, "markdown");
  fs.writeFileSync(path.join(root, "paper.pdf"), "%PDF-1.7\n");
  assert.equal(readWorkspaceFile(root, "paper.pdf").kind, "pdf");
  assert.throws(() => workspacePath(root, "../outside.txt", { mustExist: false }), /outside/);
  fs.rmSync(root, { recursive: true, force: true });
});

test("computes line changes for direct writes and command snapshots", () => {
  const root = fixture();
  const change = fileChangeForContent(root, "src/index.js", "const answer = 42;\nconsole.log(answer);\n");
  assert.equal(change.status, "modified");
  assert.equal(change.additions, 2);
  assert.equal(change.deletions, 1);

  const before = snapshotWorkspace(root);
  fs.writeFileSync(path.join(root, "src", "index.js"), "const answer = 42;\n");
  fs.writeFileSync(path.join(root, "src", "new.js"), "export default answer;\n");
  const changes = compareWorkspaceSnapshots(before, snapshotWorkspace(root));
  assert.deepEqual(changes.map((item) => [item.path, item.status]), [["src/index.js", "modified"], ["src/new.js", "created"]]);
  fs.rmSync(root, { recursive: true, force: true });
});
