const assert = require("node:assert/strict");
const { EventEmitter, getEventListeners } = require("node:events");
const { PassThrough } = require("node:stream");
const { spawn } = require("node:child_process");
const test = require("node:test");
const { runSshTransport, stopChild } = require("./reproduction/ssh-transport.cjs");
const { createSshBackend } = require("./reproduction/remote.cjs");

function child() {
  const value = new EventEmitter();
  Object.assign(value, { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), exitCode: null, signalCode: null, kills: [] });
  value.close = (code = 0, signal = null) => {
    value.exitCode = code; value.signalCode = signal;
    value.stdout.end(); value.stderr.end();
    value.emit("close", code, signal);
  };
  value.kill = (signal) => { value.kills.push(signal); queueMicrotask(() => value.close(null, signal)); return true; };
  return value;
}

function fixture() {
  const calls = [];
  const spawnImpl = (command, args, options) => {
    const process = child(); calls.push({ command, args, options, child: process }); return process;
  };
  return { calls, spawnImpl, run: (options = {}) => runSshTransport({ args: ["fixture-host", "fixture-command"], spawnImpl, ...options }) };
}

test("completed SSH commands release timers and abort listeners, preserve UTF-8 and nonzero exits", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture(); const controller = new AbortController(); const streamed = [];
  const pending = f.run({ signal: controller.signal, timeoutMs: 10, onData: (text) => streamed.push(text) });
  const ssh = f.calls[0].child;
  assert.equal(ssh.stdin.writableEnded, true);
  const utf8 = Buffer.from("你好"); ssh.stdout.write(utf8.subarray(0, 2)); ssh.stdout.write(utf8.subarray(2));
  ssh.close(7);
  const result = await pending;
  assert.equal(result.code, 7); assert.equal(result.output, "你好"); assert.equal(streamed.join(""), "你好");
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  t.mock.timers.tick(100); controller.abort();
  assert.deepEqual(ssh.kills, [], "a settled operation must never kill an old PID later");
});

test("SSH launch errors settle once and clean up listeners", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture(); const controller = new AbortController();
  const pending = f.run({ signal: controller.signal, timeoutMs: 10 });
  const failure = assert.rejects(pending, /SSH could not start.*ENOENT/);
  f.calls[0].child.emit("error", new Error("ENOENT"));
  await failure;
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  const kills = f.calls[0].child.kills.length;
  t.mock.timers.tick(100); controller.abort();
  assert.equal(f.calls[0].child.kills.length, kills);
});

test("pre-aborted commands and uploads do not start any process", async () => {
  const f = fixture(); const controller = new AbortController(); controller.abort();
  await assert.rejects(f.run({ signal: controller.signal }), { name: "AbortError" });
  await assert.rejects(f.run({ signal: controller.signal, copyFrom: "C:/中文 repo" }), { name: "AbortError" });
  assert.equal(f.calls.length, 0);
});

test("aborting an upload stops both tar and SSH and releases the listener", async () => {
  const f = fixture(); const controller = new AbortController();
  const pending = f.run({ copyFrom: "C:/中文 repo", signal: controller.signal });
  const failure = assert.rejects(pending, { name: "AbortError" });
  controller.abort(); await failure;
  for (const { child: process, options } of f.calls) {
    assert.deepEqual(process.kills, ["SIGKILL"]); assert.equal(options.windowsHide, true);
    assert.equal(options.shell, false); assert.equal(process.stdout.destroyed, true);
  }
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("commands and uploads have bounded timeouts and stop every local producer", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture(); const controller = new AbortController();
  const command = f.run({ signal: controller.signal, timeoutMs: 10 });
  t.mock.timers.tick(10);
  assert.equal((await command).timedOut, true);
  assert.deepEqual(f.calls[0].child.kills, ["SIGKILL"]);
  const upload = f.run({ signal: controller.signal, copyFrom: "/repo", timeoutMs: 10 });
  const failure = assert.rejects(upload, { name: "TimeoutError" });
  t.mock.timers.tick(10); await failure;
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  for (const { child: process } of f.calls) assert.deepEqual(process.kills, ["SIGKILL"]);
});

test("upload success waits for both processes even if SSH exits first", async () => {
  const f = fixture(); let complete = false;
  const pending = f.run({ copyFrom: "C:/中文 repo" }).then((result) => { complete = true; return result; });
  const [tar, ssh] = f.calls.map((call) => call.child);
  tar.stdout.write(Buffer.from("archive"));
  ssh.close(0); await Promise.resolve();
  assert.equal(complete, false);
  tar.close(0);
  assert.equal((await pending).bytes, 7);
  assert.deepEqual(f.calls[0].args, ["-czf", "-", "-C", "C:/中文 repo", "."]);
  assert.deepEqual(tar.kills, []); assert.deepEqual(ssh.kills, []);
});

test("a failed tar cannot be reported as successful when SSH exits zero", async () => {
  const f = fixture(); const pending = f.run({ copyFrom: "/repo" });
  const failure = assert.rejects(pending, /Local tar.*cannot read.*exit 2/);
  f.calls[1].child.close(0);
  f.calls[0].child.stderr.write("cannot read source file");
  f.calls[0].child.close(2);
  await failure;
});

test("an SSH upload failure terminates a still-running tar", async () => {
  const f = fixture(); const pending = f.run({ copyFrom: "/repo" });
  const failure = assert.rejects(pending, /SSH.*connection lost/);
  f.calls[1].child.stderr.write("connection lost"); f.calls[1].child.close(255);
  await failure;
  assert.deepEqual(f.calls[0].child.kills, ["SIGKILL"]);
});

test("a broken upload pipe is a failure rather than an unhandled stream error", async () => {
  const f = fixture(); const pending = f.run({ copyFrom: "/repo" });
  const failure = assert.rejects(pending, /SSH input failed.*broken pipe/);
  f.calls[1].child.stdin.emit("error", Object.assign(new Error("broken pipe"), { code: "EPIPE" }));
  await failure;
  for (const { child: process } of f.calls) assert.deepEqual(process.kills, ["SIGKILL"]);
});

test("a synchronous SSH spawn failure cleans up the already-started tar", async () => {
  const tar = child();
  await assert.rejects(runSshTransport({ args: [], copyFrom: "/repo", spawnImpl: (command) => {
    if (command === "tar") return tar; throw new Error("SSH executable missing");
  } }), /SSH executable missing/);
  assert.deepEqual(tar.kills, ["SIGKILL"]);
});

test("Windows cleanup targets only its owned PID and falls back when taskkill fails", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const owner = child(); owner.pid = 123456; const helper = child(); const calls = [];
  const pending = stopChild(owner, { platform: "win32", spawnImpl: (...args) => { calls.push(args); return helper; } });
  assert.deepEqual(calls[0][1], ["/PID", "123456", "/T", "/F"]);
  assert.equal(calls[0][2].windowsHide, true); assert.equal(calls[0][2].shell, false);
  t.mock.timers.tick(2_000); await pending;
  assert.deepEqual(helper.kills, ["SIGKILL"]); assert.deepEqual(owner.kills, ["SIGKILL"]);
  helper.emit("error", new Error("late helper error"));
  assert.equal(owner.kills.length, 1);
});

test("Windows cleanup skips exited children and handles taskkill launch errors", async () => {
  const finished = child(); finished.close(0);
  await stopChild(finished, { platform: "win32", spawnImpl: () => { throw new Error("must not spawn"); } });
  assert.deepEqual(finished.kills, []);
  const owner = child(); owner.pid = 123456;
  await stopChild(owner, { platform: "win32", spawnImpl: () => { throw new Error("missing taskkill"); } });
  assert.deepEqual(owner.kills, ["SIGKILL"]);
});

function backendFixture({ signal, secrets = {}, script } = {}) {
  const f = fixture();
  const backend = createSshBackend({ server: { user: "test", host: "fixture.invalid", port: 22 }, repoUrl: "https://github.com/owner/repo", signal, secrets,
    spawnImpl: (command, args, options) => {
      const result = f.spawnImpl(command, args, options);
      if (script) queueMicrotask(() => script(result, args.at(-1), f.calls.length));
      return result;
    },
  });
  return { ...f, backend };
}

test("the session signal cancels SSH preparation without starting later commands", async () => {
  const controller = new AbortController(); const f = backendFixture({ signal: controller.signal });
  const preparing = f.backend.prepare(); const failure = assert.rejects(preparing, { name: "AbortError" });
  controller.abort(); await failure;
  assert.equal(f.calls.length, 1); assert.deepEqual(f.calls[0].child.kills, ["SIGKILL"]);
  await f.backend.dispose();
});

test("dispose cancels active transfers and prevents new commands", async () => {
  const f = backendFixture();
  const upload = f.backend.copyCheckout("/repo"); const failure = assert.rejects(upload, { name: "AbortError" });
  await Promise.all([f.backend.dispose(), failure]);
  for (const { child: process } of f.calls) assert.deepEqual(process.kills, ["SIGKILL"]);
  await assert.rejects(f.backend.exec("echo never"), { name: "AbortError" });
  assert.equal(f.calls.length, 2);
});

test("disposal removes the remote secret file once even when the run signal is aborted", async () => {
  const controller = new AbortController();
  const f = backendFixture({ signal: controller.signal, secrets: { HF_TOKEN: "test-value" }, script: (process, command) => {
    assert.doesNotMatch(command, /test-value/);
    if (command.includes("test -d")) process.stdout.write("yes\n");
    if (command.includes("rev-parse")) process.stdout.write("a".repeat(40));
    process.close(0);
  } });
  await f.backend.prepare();
  const before = f.calls.length;
  controller.abort();
  await Promise.all([f.backend.dispose(), f.backend.dispose()]);
  assert.equal(f.calls.length, before + 1);
  assert.match(f.calls.at(-1).args.at(-1), /rm -f/);
  await assert.rejects(f.backend.exec("echo never"), { name: "AbortError" });
});

test("cancelling before secret upload does not start a fresh connection just to clean up", async () => {
  const controller = new AbortController(); const f = backendFixture({ signal: controller.signal, secrets: { HF_TOKEN: "test-value" } });
  controller.abort(); await f.backend.dispose();
  assert.equal(f.calls.length, 0);
});

for (const stage of ["commit", "marker"]) test(`prepare rejects a failed ${stage} checkpoint`, async () => {
  const f = backendFixture({ script: (process, command) => {
    if (command.includes("test -d")) process.stdout.write("yes\n");
    if (command.includes("rev-parse")) process.stdout.write("a".repeat(40));
    const failed = stage === "commit" ? command.includes("rev-parse") : command.includes("printf");
    process.close(failed ? 1 : 0);
  } });
  await assert.rejects(f.backend.prepare(), stage === "commit" ? /checkout commit/ : /run marker/);
  await f.backend.dispose();
});

test("a real local process exits on abort without any SSH server", { timeout: 10_000 }, async () => {
  const controller = new AbortController(); let process;
  const pending = runSshTransport({ args: [], signal: controller.signal, spawnImpl: (command, args, options) => {
    if (command !== "ssh") return spawn(command, args, options);
    process = spawn(global.process.execPath, ["-e", "setInterval(()=>{},1000)"], options);
    return process;
  } });
  const failure = assert.rejects(pending, { name: "AbortError" });
  const exited = new Promise((resolve) => process.once("close", resolve));
  controller.abort(); await failure; await exited;
  assert.throws(() => global.process.kill(process.pid, 0), /ESRCH/);
});
