const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
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
    const nested = "escape/notes/result.md";
    assert.throws(() => fileChangeForContent(root, nested, "note"), /outside/);
    assert.throws(() => writeWorkspaceTextFile(root, nested, "note"), /outside/);
    assert.deepEqual(fs.readdirSync(outside), []);
    fs.symlinkSync(path.join(root, "src"), path.join(root, "linked-src"));
    writeWorkspaceTextFile(root, "linked-src/notes/result.md", "note");
    assert.equal(fs.readFileSync(path.join(root, "src/notes/result.md"), "utf8"), "note");
  }
});

test("reads and writes text without allowing workspace escapes", () => {
  const root = fixture();
  const file = readWorkspaceFile(root, "src/index.js");
  assert.match(file.content, /answer/);
  writeWorkspaceTextFile(root, "notes/result.md", "# Result\n");
  assert.equal(readWorkspaceFile(root, "notes/result.md").kind, "markdown");
  if (process.platform !== "win32") assert.equal(fs.statSync(path.join(root, "notes/result.md")).mode & 0o777, 0o666 & ~process.umask());
  fs.writeFileSync(path.join(root, "references.bib"), "@article{archimedes, title={Paper}}\n");
  fs.writeFileSync(path.join(root, "paper.sty"), "\\ProvidesPackage{paper}\n");
  assert.match(readWorkspaceFile(root, "references.bib").content, /@article/);
  assert.equal(readWorkspaceFile(root, "paper.sty").kind, "text");
  fs.writeFileSync(path.join(root, "paper.pdf"), "%PDF-1.7\n");
  assert.equal(readWorkspaceFile(root, "paper.pdf").kind, "pdf");
  assert.throws(() => workspacePath(root, "../outside.txt", { mustExist: false }), /outside/);
  fs.rmSync(root, { recursive: true, force: true });
});

test("a failed write or replacement preserves the saved source and allows a retry", async (t) => {
  for (const operation of ["writeFileSync", "renameSync"]) {
    await t.test(operation, (t) => {
      const root = fixture();
      t.after(() => fs.rmSync(root, { recursive: true, force: true }));
      const target = "src/index.js";
      const sibling = path.join(root, "src", ".archimedes-save-unrelated.tmp");
      fs.writeFileSync(sibling, "another operation's file");
      const original = fs.readFileSync(path.join(root, target), "utf8");
      const draft = "const answer = 42;\n";
      const write = fs.writeFileSync;
      t.mock.method(fs, operation, (...args) => {
        if (operation === "writeFileSync") write(args[0], draft.slice(0, 8), args[2]);
        throw new Error("Simulated save failure");
      });

      assert.throws(() => writeWorkspaceTextFile(root, target, draft), /Simulated save failure/);
      assert.equal(fs.readFileSync(path.join(root, target), "utf8"), original);
      assert.deepEqual(fs.readdirSync(path.join(root, "src")).sort(), [path.basename(sibling), "index.js"]);
      assert.equal(fs.readFileSync(sibling, "utf8"), "another operation's file");

      t.mock.restoreAll();
      assert.equal(writeWorkspaceTextFile(root, target, draft).content, draft);
    });
  }
});

test("saving an existing symlink target preserves the link and its file permissions", { skip: process.platform === "win32" }, (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const target = path.join(root, "src", "index.js");
  const alias = path.join(root, "linked.js");
  const draft = "const answer = 42;\n";
  fs.chmodSync(target, 0o731);
  fs.symlinkSync("src/index.js", alias);

  assert.equal(writeWorkspaceTextFile(root, "linked.js", draft).path, "src/index.js");
  assert.equal(fs.readlinkSync(alias), "src/index.js");
  assert.equal(fs.readFileSync(target, "utf8"), draft);
  assert.equal(fs.statSync(target).mode & 0o777, 0o731);
  if (process.getuid() !== 0) {
    fs.chmodSync(target, 0o444);
    assert.throws(() => writeWorkspaceTextFile(root, "linked.js", "must not replace this file"), { code: "EACCES" });
    assert.equal(fs.readFileSync(target, "utf8"), draft);
  }
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

test("a workspace watcher error closes and removes only that watcher", (t) => {
  const source = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
  const section = (start, end) => source.slice(source.indexOf(`function ${start}(`), source.indexOf(`function ${end}(`));
  const workspaceWatchers = new Map();
  const watchers = [];
  const watch = (_root, _options, onChange) => {
    const watcher = Object.assign(new EventEmitter(), { close: t.mock.fn(), onChange });
    watchers.push(watcher);
    return watcher;
  };
  const watchWorkspace = new Function("fs", "workspaceWatchers", `
    ${section("stopWorkspaceWatcher", "setWindowWorkspace")}
    ${section("watchWorkspace", "titleBarOverlay")}
    return watchWorkspace;
  `)({ watch }, workspaceWatchers);
  const sender = { id: 1 };
  watchWorkspace(sender, "/first");
  watchWorkspace(sender, "/second");
  const [old, current] = watchers;
  old.emit("error", new Error("Stale watcher"));
  assert.equal(workspaceWatchers.get(sender.id).watcher, current);
  current.onChange("rename", "README.md");
  current.emit("error", new Error("Workspace unmounted"));
  assert.equal(current.close.mock.callCount(), 1);
  assert.equal(workspaceWatchers.has(sender.id), false);
});
