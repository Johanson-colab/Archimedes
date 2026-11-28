const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");
const { setImmediate: nextTick } = require("node:timers/promises");

const { detectGitState, gitBranch, gitOutput } = require("./git-state.cjs");

function folder(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `archimedes-${name}-`));
}

function runGit(root, ...args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
}

test("git state distinguishes none, empty, and ready folders", async () => {
  const plain = folder("git-none");
  assert.equal(await detectGitState(plain), "none");
  assert.equal(await detectGitState(path.join(plain, "missing")), "none");

  const repo = folder("git-ready");
  runGit(repo, "init");
  assert.equal(await detectGitState(repo), "empty");
  assert.equal(await gitBranch(repo), null);

  fs.writeFileSync(path.join(repo, "README.md"), "# Test\n");
  runGit(repo, "config", "user.email", "test@example.com");
  runGit(repo, "config", "user.name", "Test");
  runGit(repo, "add", "README.md");
  runGit(repo, "commit", "-m", "Initial commit");
  assert.equal(await detectGitState(repo), "ready");
  assert.match(await gitBranch(repo), /^(main|master)$/);

  fs.rmSync(plain, { recursive: true, force: true });
  fs.rmSync(repo, { recursive: true, force: true });
});

test("a linked worktree is reported as nested instead of a project root", async () => {
  const repo = folder("git-worktree-root");
  runGit(repo, "init");
  fs.writeFileSync(path.join(repo, "README.md"), "# Test\n");
  runGit(repo, "config", "user.email", "test@example.com");
  runGit(repo, "config", "user.name", "Test");
  runGit(repo, "add", "README.md");
  runGit(repo, "commit", "-m", "Initial commit");
  const worktree = path.join(repo, ".worktrees", "one");
  runGit(repo, "worktree", "add", "-b", "one", worktree, "HEAD");
  assert.equal(await detectGitState(worktree), "nested");
  assert.equal(await detectGitState(repo), "ready");
  fs.rmSync(repo, { recursive: true, force: true });
});

test("a broken .git entry is suspicious", async () => {
  const folderPath = folder("git-broken");
  fs.mkdirSync(path.join(folderPath, ".git"));
  fs.writeFileSync(path.join(folderPath, ".git", "HEAD"), "not a repository");
  assert.equal(await detectGitState(folderPath), "suspicious");
  fs.rmSync(folderPath, { recursive: true, force: true });
});



test("a symlink to a repository root is recognized without accepting a subdirectory", async () => {
  const parent = folder("git-symlink");
  const repo = path.join(parent, "repo");
  const alias = path.join(parent, "alias");
  fs.mkdirSync(repo);
  try {
    runGit(repo, "init");
    runGit(repo, "config", "user.email", "test@example.com");
    runGit(repo, "config", "user.name", "Test");
    fs.writeFileSync(path.join(repo, "file"), "test");
    runGit(repo, "add", "file");
    runGit(repo, "commit", "-m", "Initial commit");
    fs.symlinkSync(repo, alias, "dir");
    assert.equal(await detectGitState(alias), "ready");
    fs.mkdirSync(path.join(repo, "child"));
    assert.equal(await detectGitState(path.join(alias, "child")), "none");
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("directory aliases share Git state without accepting a parent repository", async () => {
  const root = folder("git-alias");
  const repo = path.join(root, "repo");
  const alias = path.join(root, "alias");
  fs.mkdirSync(repo);
  fs.symlinkSync(repo, alias, process.platform === "win32" ? "junction" : "dir");
  try {
    runGit(repo, "init");
    assert.equal(await detectGitState(fs.realpathSync(repo)), "empty");
    assert.equal(await detectGitState(alias), "empty");
    fs.writeFileSync(path.join(repo, "README.md"), "# Alias\n");
    runGit(repo, "config", "user.email", "test@example.com");
    runGit(repo, "config", "user.name", "Test");
    runGit(repo, "add", "README.md");
    runGit(repo, "commit", "-m", "Initial commit");
    assert.equal(await detectGitState(fs.realpathSync(repo)), "ready");
    assert.equal(await detectGitState(alias), "ready");
    assert.equal(await gitBranch(alias), await gitBranch(fs.realpathSync(repo)));

    fs.mkdirSync(path.join(repo, "child", ".git"), { recursive: true });
    assert.equal(await detectGitState(path.join(alias, "child")), "suspicious");
    assert.equal(await detectGitState(path.join(fs.realpathSync(repo), "child")), "suspicious");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });

  }
});

test("a slow Git process yields to main-process work", { skip: process.platform === "win32" }, async (t) => {
  const root = folder("slow-git");
  const priorPath = process.env.PATH;
  t.after(() => {
    process.env.PATH = priorPath;
    fs.rmSync(root, { recursive: true, force: true });
  });
  fs.writeFileSync(path.join(root, "git"), "#!/bin/sh\n/bin/sleep 0.15\nprintf 'fixture-commit\\n'\n", { mode: 0o700 });
  process.env.PATH = `${root}${path.delimiter}${priorPath}`;
  let settled = false;
  const probe = gitOutput(root, ["rev-parse", "HEAD"]).then(value => { settled = true; return value; });
  await nextTick();
  assert.equal(settled, false);
  assert.equal(await probe, "fixture-commit");
});
