const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const store = require("../store.cjs");

const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_ARTIFACTS = 12;

async function describeFile(root, input, signal) {
  if (typeof input !== "string" || !input.trim() || path.isAbsolute(input)) throw new Error("Artifact paths must be relative to the run workspace.");
  const parts = input.replaceAll("\\", "/").split("/");
  if (parts.some((part) => part === ".." || part.startsWith("."))) throw new Error("Artifact paths cannot contain hidden folders or parent traversal.");
  const realRoot = fs.realpathSync(root);
  const target = fs.realpathSync(path.resolve(realRoot, input));
  if (!target.startsWith(`${realRoot}${path.sep}`)) throw new Error("Artifact path resolves outside the run workspace.");
  const before = fs.statSync(target);
  if (!before.isFile()) throw new Error("An experiment artifact must be a file.");
  if (before.size > MAX_FILE_BYTES) throw new Error("Experiment artifacts are limited to 2 GiB for hashing.");
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(target, signal ? { signal } : {})) hash.update(chunk);
  const after = fs.statSync(target);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ino !== after.ino) throw new Error("An artifact changed while it was being recorded; try again.");
  return { path: path.relative(realRoot, target).split(path.sep).join("/"), sha256: hash.digest("hex"), sizeBytes: after.size };
}

async function recordExperimentEvidence({ runId, threadId, workspace, metrics = {}, artifacts = [], turnId = null, signal = null, isRequestActive = () => true } = {}) {
  const run = store.getExperimentRun(runId);
  if (!run || run.thread_id !== threadId) throw new Error("Experiment run not found in this session.");
  if (!store.canAccessProject(run.project_id, "editor")) throw new Error("You do not have permission to record experiment evidence.");
  if (!["succeeded", "failed", "cancelled"].includes(run.status)) throw new Error("Wait for the run to finish before recording evidence.");
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics) || Object.keys(metrics).length > 30) throw new Error("Metrics must be an object with at most 30 numeric values.");
  for (const [key, value] of Object.entries(metrics)) {
    if (!key.trim() || key.length > 80 || typeof value !== "number" || !Number.isFinite(value)) throw new Error("Each metric needs a short name and a finite numeric value.");
  }
  if (!Array.isArray(artifacts) || artifacts.length > MAX_ARTIFACTS) throw new Error("At most 12 artifact paths can be recorded at once.");
  if (!Object.keys(metrics).length && !artifacts.length) throw new Error("Provide at least one metric or artifact.");
  const root = run.provenance?.workspace?.root || run.cwd;
  const activeRoot = fs.realpathSync(workspace);
  const runRoot = fs.realpathSync(root);
  if (runRoot !== activeRoot && !runRoot.startsWith(`${activeRoot}${path.sep}`)) throw new Error("The run workspace is outside the active workspace.");
  const files = [];
  for (const file of artifacts) files.push(await describeFile(runRoot, file, signal));
  if (signal?.aborted || !isRequestActive()) throw new Error("Experiment evidence recording was interrupted.");
  return store.addExperimentEvidence({ runId, turnId, metrics, artifacts: files });
}

module.exports = { recordExperimentEvidence };
