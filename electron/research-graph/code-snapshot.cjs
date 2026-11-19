const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function git(root, args, options = {}) {
  return spawnSync("git", ["-C", root, ...args], {
    timeout: 120_000, windowsHide: true, ...options,
  });
}

// Check the whole worktree, not just the command's working directory. Runtime
// logs are excluded; Git-ignored files and submodule contents are not captured.
function inspectCodeState(root) {
  const head = git(root, ["rev-parse", "--verify", "HEAD"], { encoding: "utf8" });
  if (head.error || head.status !== 0) throw new Error("Cannot inspect the experiment's Git commit.");
  const tracked = git(root, ["diff", "--quiet", "--ignore-submodules=none", "HEAD", "--"], { encoding: "utf8" });
  const untracked = git(root, ["ls-files", "--others", "--exclude-standard", "-z"], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (tracked.error || ![0, 1].includes(tracked.status) || untracked.error || untracked.status !== 0) {
    throw new Error("Cannot inspect the experiment worktree for uncommitted changes.");
  }
  const unknownFiles = String(untracked.stdout || "").split("\0").filter(Boolean)
    .filter((file) => !file.startsWith(".archimedes/experiment-runs/"));
  if (tracked.status === 1 || unknownFiles.length) {
    throw new Error("The experiment workspace contains uncommitted or untracked files. Review and commit the code before running; ignored files are not included in the snapshot.");
  }
  return { commit: String(head.stdout).trim() };
}

function sha256File(file) {
  const hash = createHash("sha256");
  const fd = fs.openSync(file, "r");
  const buffer = Buffer.alloc(1024 * 1024);
  try {
    let bytes;
    while ((bytes = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, bytes));
  } finally { fs.closeSync(fd); }
  return hash.digest("hex");
}

function createCodeSnapshot(root, directory) {
  const before = inspectCodeState(root);
  const file = path.join(directory, "code.tar");
  const fd = fs.openSync(file, "wx", 0o600);
  let result;
  try {
    result = git(root, ["archive", "--format=tar", before.commit], { stdio: ["ignore", fd, "pipe"], maxBuffer: 1024 * 1024 });
  } finally { fs.closeSync(fd); }
  if (result.error || result.status !== 0) throw new Error("Could not save the experiment code snapshot.");
  const after = inspectCodeState(root);
  if (before.commit !== after.commit) throw new Error("The experiment commit changed while saving its code snapshot. Try again.");
  return {
    kind: "git-archive", commit: before.commit, path: file,
    sha256: sha256File(file), sizeBytes: fs.statSync(file).size,
    limitations: "Git archive excludes uncommitted and ignored files, submodule contents, and files marked export-ignore; Git LFS objects may be pointers. Runtime data and environment are not captured.",
  };
}

module.exports = { inspectCodeState, createCodeSnapshot };
