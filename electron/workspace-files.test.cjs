const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  compareWorkspaceSnapshots,
  fileChangeForContent,
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

test("Windows scripts remain editable and appear in change summaries", (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const before = snapshotWorkspace(root);
  for (const name of ["setup.ps1", "profile.psm1", "config.psd1", "start.cmd", "build.bat"]) {
    const content = "echo hello\r\n";
    const file = writeWorkspaceTextFile(root, name, content);
    assert.equal(file.kind, "text", name);
    assert.equal(file.content, content);
  }
  const changes = compareWorkspaceSnapshots(before, snapshotWorkspace(root));
  assert.equal(changes.length, 5);
  assert.ok(changes.every((change) => change.additions > 0));
});

test("writes and previews reject escaping directory links before changing files", (t) => {
  const root = fixture();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-outside-"));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });
  fs.writeFileSync(path.join(outside, "existing.txt"), "keep me");
  fs.symlinkSync(outside, path.join(root, "link"), process.platform === "win32" ? "junction" : "dir");
  for (const name of ["link/existing.txt", "link/nested/new.txt"]) {
    assert.throws(() => fileChangeForContent(root, name, "changed"), /outside/);
    assert.throws(() => writeWorkspaceTextFile(root, name, "changed"), /outside/);
  }
  assert.equal(fs.readFileSync(path.join(outside, "existing.txt"), "utf8"), "keep me");
  assert.equal(fs.existsSync(path.join(outside, "nested")), false);
  // A workspace selected via a junction and links within it still work.
  fs.symlinkSync(path.join(root, "src"), path.join(root, "internal"), process.platform === "win32" ? "junction" : "dir");
  assert.equal(writeWorkspaceTextFile(root, "internal/new.txt", "inside").content, "inside");
});
