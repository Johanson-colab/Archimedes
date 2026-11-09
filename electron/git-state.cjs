const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const GIT_TIMEOUT_MS = 5_000;

function runGit(root, args) {
  return spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    timeout: GIT_TIMEOUT_MS,
    windowsHide: true,
  });
}

function gitOutput(root, args) {
  const result = runGit(root, args);
  if (result.error || result.status !== 0) return null;
  return String(result.stdout || "").trim();
}

/**
 * A project binds a folder, not a VCS. This probe keeps the four states the UI
 * needs without making Git a requirement:
 *
 * - none: no `.git` at the project root
 * - empty: a repository with no commit yet
 * - ready: a normal work tree with at least one commit
 * - nested: `.git` is a pointer (linked worktree or submodule)
 * - suspicious: `.git` exists but Git cannot use the folder as a work tree
 */
function detectGitState(root) {
  if (typeof root !== "string" || !root.trim()) return "none";
  const resolved = path.resolve(root);
  let stat;
  try {
    stat = fs.statSync(resolved);
  } catch {
    return "none";
  }
  if (!stat.isDirectory()) return "none";

  const dotGit = path.join(resolved, ".git");
  let gitStat;
  try {
    gitStat = fs.statSync(dotGit);
  } catch {
    return "none";
  }

  if (gitStat.isFile()) {
    try {
      const pointer = fs.readFileSync(dotGit, "utf8").trim();
      return pointer.startsWith("gitdir:") ? "nested" : "suspicious";
    } catch {
      return "suspicious";
    }
  }
  if (!gitStat.isDirectory()) return "suspicious";

  const inside = gitOutput(resolved, ["rev-parse", "--is-inside-work-tree"]);
  if (inside !== "true") return "suspicious";
  // A malformed `.git` can fall through to a repository in a parent folder.
  // The project root must be the actual top-level work tree.
  const topLevel = gitOutput(resolved, ["rev-parse", "--show-toplevel"]);
  if (!topLevel || path.resolve(topLevel) !== resolved) return "suspicious";
  const head = runGit(resolved, ["rev-parse", "--verify", "--quiet", "HEAD"]);
  if (head.error || head.status !== 0) {
    const hasRefs = gitOutput(resolved, ["for-each-ref", "--count=1", "--format=%(refname)"]);
    return hasRefs === null ? "suspicious" : "empty";
  }
  return "ready";
}

function gitBranch(root) {
  if (detectGitState(root) !== "ready") return null;
  return gitOutput(root, ["rev-parse", "--abbrev-ref", "HEAD"]) || null;
}

module.exports = { detectGitState, gitBranch };
