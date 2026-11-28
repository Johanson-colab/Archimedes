const { spawn } = require("node:child_process");
const { createHash } = require("node:crypto");
const { once } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const { pipeline } = require("node:stream/promises");
const { gitOutput, runGit } = require("../git-state.cjs");

// Check the whole worktree, not just the command's working directory. Runtime
// logs are excluded; Git-ignored files and submodule contents are not captured.
async function inspectCodeState(root) {
  const commit = await gitOutput(root, ["rev-parse", "--verify", "HEAD"]);
  if (!commit) throw new Error("Cannot inspect the experiment's Git commit.");
  const [tracked, untracked] = await Promise.all([
    runGit(root, ["diff", "--quiet", "--ignore-submodules=none", "HEAD", "--"], { timeout: 120_000 }),
    runGit(root, ["ls-files", "--others", "--exclude-standard", "-z"], { timeout: 120_000, maxBuffer: 8 * 1024 * 1024 }),
  ]);
  if (![0, 1].includes(tracked.status) || untracked.status !== 0) {
    throw new Error("Cannot inspect the experiment worktree for uncommitted changes.");
  }
  const unknownFiles = String(untracked.stdout || "").split("\0").filter(Boolean)
    .filter((file) => !file.startsWith(".archimedes/experiment-runs/"));
  if (tracked.status === 1 || unknownFiles.length) {
    throw new Error("The experiment workspace contains uncommitted or untracked files. Review and commit the code before running; ignored files are not included in the snapshot.");
  }
  return { commit };
}

async function sha256File(file) {
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function createCodeSnapshot(root, directory) {
  const before = await inspectCodeState(root);
  const file = path.join(directory, "code.tar");
  const archive = spawn("git", ["-C", root, "archive", "--format=tar", before.commit], {
    stdio: ["ignore", "pipe", "ignore"], windowsHide: true, signal: AbortSignal.timeout(120_000),
  });
  let code;
  try {
    const [exit] = await Promise.all([
      once(archive, "close"),
      pipeline(archive.stdout, fs.createWriteStream(file, { flags: "wx", mode: 0o600 })),
    ]);
    [code] = exit;
  } catch (error) {
    archive.kill();
    throw new Error("Could not save the experiment code snapshot.", { cause: error });
  }
  if (code !== 0) throw new Error("Could not save the experiment code snapshot.");
  const after = await inspectCodeState(root);
  if (before.commit !== after.commit) throw new Error("The experiment commit changed while saving its code snapshot. Try again.");
  return {
    kind: "git-archive", commit: before.commit, path: file,
    sha256: await sha256File(file), sizeBytes: (await fs.promises.stat(file)).size,
    limitations: "Git archive excludes uncommitted and ignored files, submodule contents, and files marked export-ignore; Git LFS objects may be pointers. Runtime data and environment are not captured.",
  };
}

module.exports = { inspectCodeState, createCodeSnapshot };
