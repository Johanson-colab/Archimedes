const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const test = require("node:test");

const { createSshBackend, parseProbe, probeCommand, remoteRoot, shellQuote } = require("./reproduction/remote.cjs");

function sshChild(t, onStart) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new PassThrough();
  child.kill = () => {
    setImmediate(() => child.emit("close", null, "SIGKILL"));
    return true;
  };
  t.after(() => child.emit("close", null, "SIGKILL"));
  if (onStart) onStart(child);
  return child;
}

function countSignalListeners(signal) {
  let added = 0, removed = 0;
  const add = signal.addEventListener.bind(signal);
  const remove = signal.removeEventListener.bind(signal);
  signal.addEventListener = (...args) => { added++; return add(...args); };
  signal.removeEventListener = (...args) => { removed++; return remove(...args); };
  return () => ({ added, removed });
}

const sshServer = { user: "ubuntu", host: "10.150.16.11", port: 22, workspace: "~/.archimedes" };

test("one repository and branch maps to one directory on the server", () => {
  const main = remoteRoot("~/.archimedes", "https://github.com/A-EVO-Lab/a-evolve", "");
  const release = remoteRoot("~/.archimedes", "https://github.com/A-EVO-Lab/a-evolve", "release/evo-harness");
  assert.match(main, /^~\/\.archimedes\/repro\/A-EVO-Lab--a-evolve--[0-9a-f]{10}$/);
  assert.notEqual(main, release, "two branches must not share a directory");
  assert.equal(remoteRoot("~/.archimedes", "https://github.com/A-EVO-Lab/a-evolve", ""), main, "the same input is stable");
});

test("a trailing slash or .git in the URL does not change the directory", () => {
  const plain = remoteRoot("~/.archimedes", "https://github.com/owner/repo");
  const dotted = remoteRoot("~/.archimedes/", "https://github.com/owner/repo.git");
  assert.equal(plain, dotted);
});

test("a non-GitHub URL still produces a usable directory", () => {
  const root = remoteRoot("~/.archimedes", "", "main");
  assert.match(root, /^~\/\.archimedes\/repro\/repo--checkout--[0-9a-f]{10}$/);
});

test("commands survive quoting, including single quotes in a path", () => {
  assert.equal(shellQuote("plain"), "'plain'");
  assert.equal(shellQuote("it's"), "'it'\\''s'");
  assert.equal(shellQuote(""), "''");
});

test("the probe output is parsed into facts", () => {
  const probe = parseProbe([
    "OS=Linux 5.15.0-91-generic",
    "PY=3.10.12",
    "DOCKER=24.0.7",
    "GPU=NVIDIA A100-SXM4-40GB",
    "DISK_KB=209715200",
  ].join("\n"));
  assert.equal(probe.os, "Linux 5.15.0-91-generic");
  assert.equal(probe.python, "3.10.12");
  assert.equal(probe.docker, "24.0.7");
  assert.equal(probe.gpu, "NVIDIA A100-SXM4-40GB");
  assert.equal(probe.diskFreeGb, 200);
});

test("a machine without docker or a GPU says so instead of guessing", () => {
  const probe = parseProbe(["OS=Darwin 23.0", "PY=3.11.4", "DOCKER=none", "GPU=none", "DISK_KB=1048576"].join("\n"));
  assert.equal(probe.docker, "");
  assert.equal(probe.gpu, "");
  assert.equal(probe.diskFreeGb, 1);
});

test("the probe command asks only for things it can report", () => {
  const command = probeCommand();
  for (const key of ["OS=", "PY=", "DOCKER=", "GPU=", "DISK_KB="]) {
    assert.ok(command.includes(key), `${key} missing from the probe`);
  }
  assert.ok(!/sudo/.test(command), "never escalate to find out what a machine has");
});

test("a remote path lets the server expand the home directory", () => {
  const { quoteRemotePath } = require("./reproduction/remote.cjs");
  assert.equal(quoteRemotePath("~/.archimedes/repro/x"), `"$HOME"/'.archimedes/repro/x'`);
  assert.equal(quoteRemotePath("~"), '"$HOME"');
  assert.equal(quoteRemotePath("/abs/path"), "'/abs/path'");
  assert.equal(quoteRemotePath("~/with space"), `"$HOME"/'with space'`);
});

test("commands run through a login shell so the profile's proxy applies", () => {
  const { loginCommand } = require("./reproduction/remote.cjs");
  assert.equal(loginCommand("git status"), "bash -lc 'git status'");
  assert.ok(loginCommand("echo 'a b'").startsWith("bash -lc "));
  assert.ok(loginCommand("echo 'a b'").includes("a b"));
});

test("the backend implements everything the runner calls", () => {
  const { createSshBackend } = require("./reproduction/remote.cjs");
  const backend = createSshBackend({
    server: { user: "ubuntu", host: "10.150.16.11", port: 22, workspace: "~/.archimedes" },
    repoUrl: "https://github.com/A-EVO-Lab/a-evolve",
    branch: "release/evo-harness",
  });
  for (const name of ["prepare", "exec", "readFile", "httpStatus", "dispose"]) {
    assert.equal(typeof backend[name], "function", `${name} is part of the runner contract`);
  }
  assert.equal(backend.describe(), "SSH · ubuntu@10.150.16.11");
});

test("reproduction run passes its abort signal into SSH probe and preparation", () => {
  const source = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
  const start = source.indexOf("const backend = createSshBackend(");
  assert.ok(start >= 0, "SSH reproduction wiring was not found");
  const wiring = source.slice(start, start + 1_600);
  assert.match(wiring, /backend\.probe\(\{\s*signal: controller\.signal\s*\}\)/);
  assert.match(wiring, /backend\.prepare\(\{\s*signal: controller\.signal\s*\}\)/);
});

test("SSH probe aborts its command and releases the abort listener", { timeout: 8_000 }, async t => {
  let start;
  const ready = new Promise(resolve => { start = resolve; });
  const backend = createSshBackend({ server: sshServer, spawnImpl: () => sshChild(t, start) });
  const controller = new AbortController();
  const counts = countSignalListeners(controller.signal);
  const pending = backend.probe({ signal: controller.signal });
  await ready;
  const began = Date.now();
  controller.abort();
  await assert.rejects(pending);
  assert.ok(Date.now() - began < 3_000, "the probe did not stop promptly");
  assert.deepEqual(counts(), { added: 1, removed: 1 });
});

test("SSH preparation aborts a slow provisioning command and releases its listeners", { timeout: 8_000 }, async t => {
  let start;
  const ready = new Promise(resolve => { start = resolve; });
  const spawnImpl = (_program, args) => {
    const command = args.at(-1);
    if (command.includes("mkdir -p")) return sshChild(t, child => setImmediate(() => { child.stdout.write("ok\n"); child.emit("close", 0); }));
    if (command.includes("test -d")) return sshChild(t, child => setImmediate(() => { child.stdout.write("yes\n"); child.emit("close", 0); }));
    if (command.includes("rev-parse HEAD")) return sshChild(t, start);
    return sshChild(t, child => setImmediate(() => child.emit("close", 0)));
  };
  const backend = createSshBackend({ server: sshServer, repoUrl: "https://github.com/example/fixture", spawnImpl });
  const controller = new AbortController();
  const counts = countSignalListeners(controller.signal);
  const pending = backend.prepare({ signal: controller.signal });
  await ready;
  const began = Date.now();
  controller.abort();
  await assert.rejects(pending);
  assert.ok(Date.now() - began < 3_000, "preparation did not stop promptly");
  assert.deepEqual(counts(), { added: 3, removed: 3 });
});
