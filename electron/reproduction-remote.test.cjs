const assert = require("node:assert/strict");
const test = require("node:test");

const { parseProbe, probeCommand, remoteRoot, shellQuote } = require("./reproduction/remote.cjs");

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
