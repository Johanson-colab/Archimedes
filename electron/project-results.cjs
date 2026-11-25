const fs = require("node:fs");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const { parseDelimited, summarizeColumn } = require("../shared/analysis-dataset.mjs");
const { writableTarget } = require("./agent/workspace-tools.cjs");

const MAX_BYTES = 10 * 1024 * 1024;
const resultId = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

function directory(projectId) {
  if (typeof projectId !== "string" || !/^[\w-]{1,128}$/.test(projectId)) throw new Error("Invalid project ID.");
  return `research-results/analysis/${projectId}`;
}

function manifestPath(root, projectId, id) {
  if (!resultId.test(id)) throw new Error("Invalid analysis ID.");
  return writableTarget(root, `${directory(projectId)}/${id}/manifest.json`).target;
}

function manifest(root, projectId, id) {
  const file = manifestPath(root, projectId, id);
  const record = JSON.parse(fs.readFileSync(file, "utf8"));
  if (record.version !== 1 || record.id !== id || record.projectId !== projectId) throw new Error("The saved analysis does not match this project.");
  return record;
}

function listAnalyses(root, projectId) {
  const dir = path.dirname(writableTarget(root, `${directory(projectId)}/manifest.json`).target);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((item) => item.isDirectory() && resultId.test(item.name))
    .map((item) => {
      const { id, source, createdAt } = manifest(root, projectId, item.name);
      return { id, name: source.name, createdAt };
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function saveAnalysis(root, projectId, { bytes, name, recipe }) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_BYTES || typeof name !== "string" || !/\.(?:csv|tsv)$/i.test(name)) {
    throw new Error("Choose a CSV or TSV file of up to 10 MB.");
  }
  const data = parseDelimited(new TextDecoder().decode(bytes), /\.tsv$/i.test(name) ? "\t" : ",");
  const field = (value) => Number.isInteger(value) && value >= 0 && value < data.headers.length;
  const { column, config, unit, seedColumn } = recipe;
  if (!field(column) || !(seedColumn === null || field(seedColumn)) || typeof unit !== "string" || unit.length > 80 ||
      !["line", "scatter", "bar", "histogram"].includes(config?.type) || !field(config.x) ||
      !(config.y === -1 || field(config.y)) || !(config.group === -1 || field(config.group))) throw new Error("Invalid analysis recipe.");
  const id = randomUUID();
  const record = { version: 1, id, projectId, createdAt: new Date().toISOString(), source: { name: path.basename(name), sha256: digest(bytes) },
    recipe: { column, seedColumn, unit: unit.trim(), config: { type: config.type, x: config.x, y: config.y, group: config.group } },
    summary: summarizeColumn(data.rows, column) };
  const parent = path.dirname(writableTarget(root, `${directory(projectId)}/manifest.json`, true).target);
  const staging = fs.mkdtempSync(path.join(parent, ".saving-"));
  try {
    fs.writeFileSync(path.join(staging, "source"), bytes, { mode: 0o600 });
    fs.writeFileSync(path.join(staging, "manifest.json"), JSON.stringify(record), { mode: 0o600 });
    fs.renameSync(staging, path.join(parent, id));
  } finally { fs.rmSync(staging, { recursive: true, force: true }); }
  return { id, name: record.source.name, createdAt: record.createdAt };
}

function loadAnalysis(root, projectId, id) {
  const record = manifest(root, projectId, id);
  const file = writableTarget(root, `${directory(projectId)}/${id}/source`).target;
  const stat = fs.statSync(file, { throwIfNoEntry: false });
  const bytes = stat && stat.size <= MAX_BYTES ? fs.readFileSync(file) : null;
  const state = !stat ? "missing" : bytes && digest(bytes) === record.source.sha256 ? "ready" : "changed";
  return { ...record, source: { ...record.source, state, ...(state === "ready" ? { bytes } : {}) } };
}

module.exports = { listAnalyses, loadAnalysis, saveAnalysis };
