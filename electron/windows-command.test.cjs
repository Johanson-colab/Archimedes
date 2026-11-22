const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const windows = { skip: process.platform !== "win32", timeout: 20000 };
const { spawn, spawnSync } = require("node:child_process");
const { once } = require("node:events");
const { commandShell } = require("./command-shell.cjs");
const { resolveTerminalShell } = require("./terminal-shell.cjs");
const { stopProcessTree } = require("./process-tree.cjs");

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
