const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  compareWorkspaceSnapshots,
  fileChangeForContent,
  inspectWorkspacePath,
  listWorkspaceDirectory,
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

test("lists complete directories lazily and ignores dependency folders", () => {
  const root = fixture();
  const tree = listWorkspaceTree(root);
  assert.equal(tree.entries[0].name, "src");
  assert.equal(tree.entries[0].children, undefined);
  assert.equal(listWorkspaceDirectory(root, "src").entries[0].path, "src/index.js");
  assert.equal(tree.entries.some((entry) => entry.name === "node_modules"), false);
  fs.rmSync(root, { recursive: true, force: true });
});

test("inspects files and nested directories without escaping the workspace", (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, ".codex", "skills", "idea-spark"), { recursive: true });
  fs.writeFileSync(path.join(root, ".codex", "skills", "idea-spark", "SKILL.md"), "# Skill\n");
  fs.mkdirSync(path.join(root, "folder.md"));
  assert.deepEqual(inspectWorkspacePath(root, ".codex/skills"), { path: ".codex/skills", type: "directory" });
  assert.deepEqual(inspectWorkspacePath(root, "folder.md"), { path: "folder.md", type: "directory" });
  assert.deepEqual(inspectWorkspacePath(root, ".codex/skills/idea-spark/SKILL.md"), { path: ".codex/skills/idea-spark/SKILL.md", type: "file" });
  assert.throws(() => inspectWorkspacePath(root, "missing"), /ENOENT/);
  assert.throws(() => inspectWorkspacePath(root, "../outside"), /outside/);
  if (process.platform !== "win32") {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-outside-"));
    t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
    fs.symlinkSync(outside, path.join(root, "escape"));
    assert.throws(() => inspectWorkspacePath(root, "escape"), /outside/);
  }
});

test("reads and writes text without allowing workspace escapes", () => {
  const root = fixture();
  const file = readWorkspaceFile(root, "src/index.js");
  assert.match(file.content, /answer/);
  writeWorkspaceTextFile(root, "notes/result.md", "# Result\n");
  assert.equal(readWorkspaceFile(root, "notes/result.md").kind, "markdown");
  fs.writeFileSync(path.join(root, "references.bib"), "@article{archimedes, title={Paper}}\n");
  fs.writeFileSync(path.join(root, "paper.sty"), "\\ProvidesPackage{paper}\n");
  assert.match(readWorkspaceFile(root, "references.bib").content, /@article/);
  assert.equal(readWorkspaceFile(root, "paper.sty").kind, "text");
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

test("snapshots bound retained file contents without losing change detection", (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (let index = 0; index < 10; index += 1) fs.writeFileSync(path.join(root, `file-${index}.txt`), "x".repeat(900_000));
  const before = snapshotWorkspace(root);
  const retained = [...before.values()].reduce((sum, entry) => sum + (entry.content?.length || 0), 0);
  assert.ok(retained <= 8_000_000);
  fs.writeFileSync(path.join(root, "file-9.txt"), "y".repeat(900_000));
  assert.deepEqual(compareWorkspaceSnapshots(before, snapshotWorkspace(root)).map(change => change.path), ["file-9.txt"]);
});
