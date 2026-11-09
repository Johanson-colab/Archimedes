const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");

const { detectGitState, gitBranch } = require("./git-state.cjs");

function folder(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `archimedes-${name}-`));
}

function runGit(root, ...args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
}

test("git state distinguishes none, empty, and ready folders", () => {
  const plain = folder("git-none");
  assert.equal(detectGitState(plain), "none");
  assert.equal(detectGitState(path.join(plain, "missing")), "none");

  const repo = folder("git-ready");
  runGit(repo, "init");
  assert.equal(detectGitState(repo), "empty");
  assert.equal(gitBranch(repo), null);

  fs.writeFileSync(path.join(repo, "README.md"), "# Test\n");
  runGit(repo, "config", "user.email", "test@example.com");
  runGit(repo, "config", "user.name", "Test");
  runGit(repo, "add", "README.md");
  runGit(repo, "commit", "-m", "Initial commit");
  assert.equal(detectGitState(repo), "ready");
  assert.match(gitBranch(repo), /^(main|master)$/);

  fs.rmSync(plain, { recursive: true, force: true });
  fs.rmSync(repo, { recursive: true, force: true });
});

test("a linked worktree is reported as nested instead of a project root", () => {
  const repo = folder("git-worktree-root");
  runGit(repo, "init");
  fs.writeFileSync(path.join(repo, "README.md"), "# Test\n");
  runGit(repo, "config", "user.email", "test@example.com");
  runGit(repo, "config", "user.name", "Test");
  runGit(repo, "add", "README.md");
  runGit(repo, "commit", "-m", "Initial commit");
  const worktree = path.join(repo, ".worktrees", "one");
  runGit(repo, "worktree", "add", "-b", "one", worktree, "HEAD");
  assert.equal(detectGitState(worktree), "nested");
  assert.equal(detectGitState(repo), "ready");
  fs.rmSync(repo, { recursive: true, force: true });
});

test("a broken .git entry is suspicious", () => {
  const folderPath = folder("git-broken");
  fs.mkdirSync(path.join(folderPath, ".git"));
  fs.writeFileSync(path.join(folderPath, ".git", "HEAD"), "not a repository");
  assert.equal(detectGitState(folderPath), "suspicious");
  fs.rmSync(folderPath, { recursive: true, force: true });
});
