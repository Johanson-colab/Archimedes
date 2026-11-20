const fs = require("node:fs");
const store = require("../store.cjs");

const MAX_LOG_BYTES = 120_000;

/**
 * Read the tail of a run log without loading a large training log into memory.
 * The UI only needs enough evidence to see the command, the final metrics and
 * the exit line; the full log stays on disk for deeper inspection.
 */
function readExperimentRunLog({ runId, maxBytes = 12_000 } = {}) {
  if (!runId) throw new Error("An experiment run id is required.");
  const run = store.getExperimentRun(runId);
  if (!run) throw new Error("Experiment run not found.");
  const file = run.log_path;
  if (!file) return { path: "", size: 0, text: "" };
  if (!fs.existsSync(file)) return { path: file, size: 0, text: "" };
  const stat = fs.statSync(file);
  const limit = Math.max(1_000, Math.min(MAX_LOG_BYTES, Number(maxBytes) || 12_000));
  const start = Math.max(0, stat.size - limit);
  const length = stat.size - start;
  const buffer = Buffer.alloc(length);
  const fd = fs.openSync(file, "r");
  try {
    fs.readSync(fd, buffer, 0, length, start);
  } finally {
    fs.closeSync(fd);
  }
  return {
    path: file,
    size: stat.size,
    text: `${start > 0 ? "…\n" : ""}${buffer.toString("utf8")}`,
  };
}

module.exports = { readExperimentRunLog };
