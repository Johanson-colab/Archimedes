const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const windows = { skip: process.platform !== "win32", timeout: 20000 };
const { workspacePath, writeWorkspaceTextFile, readWorkspaceFile } = require("./workspace-files.cjs");
const { findExecutable } = require("./latex-workspace.cjs");

test("Windows TeX detection respects Path casing and installation paths with spaces", windows, () => {
  const executable = findExecutable(["cmd.exe"], { Path: path.dirname(process.env.COMSPEC) });
  assert.equal(executable.toLowerCase(), process.env.COMSPEC.toLowerCase());
});

test("Windows TeX detection handles quoted PATH entries and rejects directories", windows, (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes TeX 中文 "));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "latexmk.exe"));
  fs.writeFileSync(path.join(root, "tectonic.exe"), "fixture");
  assert.equal(findExecutable(["latexmk.exe"], { Path: `"${root}"` }), "");
  assert.equal(findExecutable(["tectonic.exe"], { Path: `"${root}"` }), path.join(root, "tectonic.exe"));
});

test("Windows workspaces accept case variants and Unicode but reject sibling paths and escaping junctions", windows, (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes 路径 "));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-outside-"));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });
  writeWorkspaceTextFile(root, "中文 目录/数据.txt", "内容");
  const target = workspacePath(root.toUpperCase(), "中文 目录/数据.txt");
  assert.ok(fs.existsSync(target));
  assert.equal(readWorkspaceFile(root, "中文 目录/数据.txt").content, "内容");
  assert.throws(() => workspacePath(root, "../outside.txt", { mustExist: false }), /outside/);
  const otherDrive = path.parse(root).root[0].toLowerCase() === "z" ? "Y:" : "Z:";
  assert.throws(() => workspacePath(root, `${otherDrive}\\outside.txt`, { mustExist: false }), /outside/);
  fs.writeFileSync(path.join(outside, "secret.txt"), "outside");
  fs.symlinkSync(outside, path.join(root, "link"), "junction");
  assert.throws(() => readWorkspaceFile(root, "link/secret.txt"), /outside/);
});

