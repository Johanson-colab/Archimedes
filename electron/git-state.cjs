const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");

const GIT_TIMEOUT_MS = 5_000;

function runGit(root, args, options) {
  return new Promise(resolve => {
    execFile("git", ["-C", root, ...args], {
      encoding: "utf8", timeout: GIT_TIMEOUT_MS, windowsHide: true, ...options,
    }, (error, stdout, stderr) => {
      resolve({ status: error ? error.code : 0, error, stdout, stderr });
    });
  });
}

async function gitOutput(root, args) {
  const result = await runGit(root, args);
  return result.status === 0 ? result.stdout.trim() : null;
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
async function detectGitState(root) {
  if (typeof root !== "string" || !root.trim()) return "none";
  let resolved;
  let stat;
  try {
    resolved = fs.realpathSync(path.resolve(root));
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

  const inside = await gitOutput(resolved, ["rev-parse", "--is-inside-work-tree"]);
  if (inside !== "true") return "suspicious";
  // A malformed `.git` can fall through to a repository in a parent folder.
  // The project root must be the actual top-level work tree.
  const topLevel = await gitOutput(resolved, ["rev-parse", "--show-toplevel"]);
  if (!topLevel) return "suspicious";
  // Both paths resolve to the actual directory, including symlinked workspaces.
  try {
    if (fs.realpathSync(topLevel) !== resolved) return "suspicious";
  } catch {
    return "suspicious";
  }
  const head = await gitOutput(resolved, ["rev-parse", "--verify", "--quiet", "HEAD"]);
  if (head === null) {
    const hasRefs = await gitOutput(resolved, ["for-each-ref", "--count=1", "--format=%(refname)"]);
    return hasRefs === null ? "suspicious" : "empty";
  }
  return "ready";
}

async function gitBranch(root, state) {
  if ((state ?? await detectGitState(root)) !== "ready") return null;
  return (await gitOutput(root, ["rev-parse", "--abbrev-ref", "HEAD"])) || null;
}

module.exports = { detectGitState, gitBranch, gitOutput, runGit };
