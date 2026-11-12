const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { once } = require("node:events");
const test = require("node:test");
const { commandShell } = require("./command-shell.cjs");
const { resolveTerminalShell } = require("./terminal-shell.cjs");
const { stopProcessTree } = require("./process-tree.cjs");
const { workspacePath, writeWorkspaceTextFile, readWorkspaceFile } = require("./workspace-files.cjs");
const { findExecutable } = require("./latex-workspace.cjs");

const windows = { skip: process.platform !== "win32", timeout: 20000 };

test("Windows TeX detection respects Path casing and installation paths with spaces", windows, () => {
  const executable = findExecutable(["cmd.exe"], { Path: path.dirname(process.env.COMSPEC) });
  assert.equal(executable.toLowerCase(), process.env.COMSPEC.toLowerCase());
});

test("Windows commands preserve Unicode, spaced working directories and native exit codes", windows, (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes 中文 空格 "));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const launch = resolveTerminalShell();
  const { shell, args } = commandShell("Write-Output '中文 输出'; (Get-Location).Path; & '" + process.execPath.replaceAll("'", "''") + "' -e 'process.exit(7)'", launch);
  const result = spawnSync(shell, args, { cwd: root, encoding: "utf8", windowsHide: true, timeout: 10000 });
  assert.ifError(result.error);
  assert.equal(result.status, 7, result.stderr);
  assert.match(result.stdout, /中文 输出/);
  assert.doesNotMatch(result.stderr, /CLIXML|<Objs/);
  assert.ok(result.stdout.includes(root));
  const failure = commandShell("Write-Error 'expected failure'", launch);
  assert.equal(spawnSync(failure.shell, failure.args, { windowsHide: true, timeout: 10000 }).status, 1);
});

test("Windows CMD commands retain their exit status", windows, () => {
  const { shell, args, windowsVerbatimArguments } = commandShell("echo CMD_OK & exit /b 9", { shell: process.env.COMSPEC });
  const result = spawnSync(shell, args, { encoding: "utf8", windowsHide: true, windowsVerbatimArguments });
  assert.equal(result.status, 9);
  assert.match(result.stdout, /CMD_OK/);
});

test("Windows CMD runs quoted programs and preserves Unicode and shell metacharacters in arguments", windows, (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes 中文 & 空格 "));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  // A copied binary guarantees an executable path containing spaces even on CI.
  const executable = path.join(root, "node test.exe");
  fs.copyFileSync(process.execPath, executable);
  const script = path.join(root, "check.cjs");
  fs.writeFileSync(script, "console.log(JSON.stringify(process.argv.slice(2))); process.exit(7)");
  const { shell, args, windowsVerbatimArguments } = commandShell(`"${executable}" "${script}" "中文 value & (one)"`, { shell: process.env.COMSPEC });
  const result = spawnSync(shell, args, { cwd: root, encoding: "utf8", windowsHide: true, windowsVerbatimArguments, timeout: 10000 });
  assert.ifError(result.error);
  assert.equal(result.status, 7, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()), ["中文 value & (one)"]);
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

test("Windows stop kills a spawned process and its child", windows, async (t) => {
  const script = `const {spawn}=require('node:child_process');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});console.log(c.pid);setInterval(()=>{},1000)`;
  const parent = spawn(process.execPath, ["-e", script], { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
  t.after(() => stopProcessTree(parent));
  const [data] = await once(parent.stdout, "data");
  const childPid = Number(String(data).trim());
  assert.ok(childPid > 0);
  const exited = once(parent, "exit");
  stopProcessTree(parent);
  await exited;
  for (const pid of [parent.pid, childPid]) {
    assert.throws(() => process.kill(pid, 0), /ESRCH/);
  }
});
