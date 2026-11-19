const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawnCommand } = require("./command-runner.cjs");
const { stopProcessTree } = require("./process-tree.cjs");

test("CMD runner preserves mixed Unicode output, quoted scripts and exit codes", { skip: process.platform !== "win32", timeout: 20000 }, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes runner 中文 "));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  fs.writeFileSync(path.join(root, "check.cjs"), "console.log('native 输出'); process.exit(7)");
  const child = spawnCommand(`echo 内置输出 & "${process.execPath}" "${path.join(root, "check.cjs")}"`, { shell: process.env.COMSPEC }, { cwd: root });
  t.after(() => stopProcessTree(child));
  let output = "";
  child.stdout.setEncoding("utf8").on("data", (data) => { output += data; });
  const code = await new Promise((resolve, reject) => { child.once("close", resolve); child.once("error", reject); });
  assert.equal(code, 7, output);
  assert.match(output, /内置输出/);
  assert.match(output, /native 输出/);
  assert.doesNotMatch(output, /\u001b/);
});

test("stopping a CMD command also stops its helper and native descendant", { skip: process.platform !== "win32", timeout: 20000 }, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes cancel "));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  fs.writeFileSync(path.join(root, "wait.cjs"), "console.log('NATIVE_PID=' + process.pid); setInterval(() => {}, 1000)");
  const child = spawnCommand(`"${process.execPath}" "${path.join(root, "wait.cjs")}"`, { shell: process.env.COMSPEC }, { cwd: root });
  t.after(() => stopProcessTree(child));
  const exited = new Promise((resolve, reject) => { child.once("close", resolve); child.once("error", reject); });
  let output = "";
  const nativePid = await new Promise((resolve) => child.stdout.on("data", (data) => {
    output += data;
    const match = /NATIVE_PID=(\d+)/.exec(output);
    if (match) resolve(Number(match[1]));
  }));
  stopProcessTree(child);
  await exited;
  for (const pid of [child.pid, nativePid]) assert.throws(() => process.kill(pid, 0), /ESRCH/);
});
