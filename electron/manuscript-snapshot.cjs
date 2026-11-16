const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { workspacePath } = require("./workspace-files.cjs");

const EXCLUDED_DIRECTORIES = new Set([".archimedes", ".git", "node_modules", "dist", "build", ".next", ".venv", "venv", "__pycache__", ".cache"]);
const MAX_FILES = 10000;
const MAX_BYTES = 500 * 1024 * 1024;
const hash = data => createHash("sha256").update(data).digest("hex");
const relative = (root, file) => path.relative(root, file).split(path.sep).join("/") || ".";

function fileDigest(file) {
  const digest = createHash("sha256"), buffer = Buffer.allocUnsafe(64 * 1024);
  const descriptor = fs.openSync(file, "r");
  try {
    const before = fs.fstatSync(descriptor, { bigint: true });
    let bytes = 0, count;
    while ((count = fs.readSync(descriptor, buffer, 0, buffer.length, null)) > 0) { digest.update(buffer.subarray(0, count)); bytes += count; }
    const after = fs.fstatSync(descriptor, { bigint: true });
    if (before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) throw new Error("Manuscript sources changed while being read. Save and compile again.");
    return { sha256: digest.digest("hex"), bytes, observation: `${after.dev}:${after.ino}:${after.mtimeNs}:${after.ctimeNs}` };
  } finally { fs.closeSync(descriptor); }
}

/** Version the manuscript directory, including sections, bibliography and assets. */
function captureManuscriptSources(root, sourcePath) {
  const workspace = workspacePath(root);
  const source = workspacePath(workspace, sourcePath);
  const directory = path.dirname(source);
  const files = [], observations = [], untracked = [];
  let bytes = 0;
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) { if (!EXCLUDED_DIRECTORIES.has(entry.name)) visit(file); continue; }
      if (entry.isSymbolicLink()) { untracked.push({ path: relative(workspace, file), target: fs.readlinkSync(file), reason: "symbolic-link input is not included in this directory snapshot" }); continue; }
      if (!entry.isFile()) continue;
      const size = fs.statSync(file).size;
      if (files.length >= MAX_FILES || bytes + size > MAX_BYTES) throw new Error("The manuscript directory exceeds the 10,000 file / 500 MiB source snapshot limit. Choose a dedicated paper folder.");
      const digest = fileDigest(file), name = relative(workspace, file);
      bytes += digest.bytes;
      files.push({ path: name, bytes: digest.bytes, sha256: digest.sha256 });
      observations.push([name, digest.observation]);
    }
  }
  visit(directory);
  return { workspace, source_path: sourcePath, project_path: relative(workspace, directory), coverage: "manuscript-directory", source_version: hash(JSON.stringify({ files, untracked })), observation_version: hash(JSON.stringify(observations)), files, total_bytes: bytes, untracked_inputs: untracked, excluded_directories: [...EXCLUDED_DIRECTORIES] };
}

function artifact(root, file) {
  const digest = fileDigest(file);
  return { path: relative(root, file), bytes: digest.bytes, sha256: digest.sha256 };
}

function writeManuscriptSnapshot({ root, buildDirectory, buildId, requested, started, finished, pdfPath, log, compiled, engine }) {
  const sourceChanged = requested.source_version !== started.source_version || started.source_version !== finished.source_version || started.observation_version !== finished.observation_version;
  const logFile = path.join(buildDirectory, "build-output.log");
  fs.writeFileSync(logFile, log);
  const pdf = pdfPath && fs.existsSync(pdfPath) ? artifact(root, pdfPath) : null;
  const snapshot = {
    version: 1, build_id: buildId, workspace: root, source_path: requested.source_path, project_path: requested.project_path,
    created_at: new Date().toISOString(), engine, requested_source: requested,
    started_source_version: started.source_version, finished_source_version: finished.source_version,
    source_changed: sourceChanged,
    status: sourceChanged ? "stale" : !compiled || !pdf ? "failed" : requested.untracked_inputs.length ? "unverified" : "current",
    pdf, log: { ...artifact(root, logFile), retention: "bounded compiler output" },
    manifest_path: relative(root, path.join(buildDirectory, "source-snapshot.json")),
  };
  fs.writeFileSync(path.join(buildDirectory, "source-snapshot.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  return snapshot;
}

/** Read the saved build and compare live input/PDF bytes before a review handoff. */
function readManuscriptSnapshot(root, manifestPath) {
  const workspace = workspacePath(root);
  if (!/^\.archimedes\/latex-build\/[a-f0-9]+\/[a-f0-9-]+\/source-snapshot\.json$/.test(manifestPath)) throw new Error("Choose a saved manuscript build snapshot.");
  const snapshot = JSON.parse(fs.readFileSync(workspacePath(workspace, manifestPath), "utf8"));
  if (snapshot.version !== 1 || snapshot.workspace !== workspace || snapshot.manifest_path !== manifestPath) throw new Error("This build snapshot does not belong to the selected workspace.");
  let current, verificationError = "";
  try { current = captureManuscriptSources(workspace, snapshot.source_path); } catch (error) { verificationError = error.message; }
  let pdfMatches = false;
  try { pdfMatches = Boolean(snapshot.pdf && fileDigest(workspacePath(workspace, snapshot.pdf.path)).sha256 === snapshot.pdf.sha256); } catch (error) { verificationError ||= error.message; }
  const sourceMatches = Boolean(current && current.source_version === snapshot.requested_source.source_version);
  return { ...snapshot, current_source_version: current?.source_version || null, source_matches: sourceMatches, pdf_matches: pdfMatches, verification_error: verificationError, current: snapshot.status === "current" && sourceMatches && pdfMatches };
}

/** Called when a real review/slides run takes ownership, never for a preview. */
function pinManuscriptSnapshot(root, manifestPath, reference) {
  if (!["paper-review", "paper-to-slides"].includes(reference?.kind) || typeof reference.run_id !== "string" || !reference.run_id.trim() || reference.run_id.length > 200) throw new Error("A review or slides run ID is required to retain this manuscript build.");
  const checked = readManuscriptSnapshot(root, manifestPath);
  if (!checked.current) throw new Error("This manuscript build is no longer current. Save and compile again before handing it off.");
  const file = path.join(path.dirname(workspacePath(checked.workspace, manifestPath)), "retained-inputs.json");
  const references = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
  if (!references.some(item => item.kind === reference.kind && item.run_id === reference.run_id)) {
    references.push({ kind: reference.kind, run_id: reference.run_id, created_at: new Date().toISOString() });
    fs.writeFileSync(`${file}.tmp`, `${JSON.stringify(references, null, 2)}\n`);
    fs.renameSync(`${file}.tmp`, file);
  }
  return checked;
}

/** Roll back a pin only when its run could not be created; cancelled runs keep inputs. */
function unpinManuscriptSnapshot(root, manifestPath, reference) {
  const checked = readManuscriptSnapshot(root, manifestPath);
  const file = path.join(path.dirname(workspacePath(checked.workspace, manifestPath)), "retained-inputs.json");
  if (!fs.existsSync(file)) return;
  const references = JSON.parse(fs.readFileSync(file, "utf8")).filter(item => item.kind !== reference.kind || item.run_id !== reference.run_id);
  if (!references.length) fs.rmSync(file);
  else {
    fs.writeFileSync(`${file}.tmp`, `${JSON.stringify(references, null, 2)}\n`);
    fs.renameSync(`${file}.tmp`, file);
  }
}

/** Retain five completed, unreferenced previews per document; never active builds. */
function pruneManuscriptPreviews(root, manifestPath, keep = 5) {
  const workspace = workspacePath(root), currentFile = workspacePath(workspace, manifestPath);
  const current = JSON.parse(fs.readFileSync(currentFile, "utf8"));
  const parent = path.dirname(path.dirname(currentFile));
  const previews = [], removed = [], errors = [];
  for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[a-f0-9-]+$/.test(entry.name)) continue;
    const directory = path.join(parent, entry.name), manifest = path.join(directory, "source-snapshot.json");
    if (!fs.existsSync(manifest) || fs.existsSync(path.join(directory, "retained-inputs.json"))) continue;
    try {
      const snapshot = JSON.parse(fs.readFileSync(manifest, "utf8"));
      if (snapshot.workspace === workspace && snapshot.source_path === current.source_path) previews.push({ directory, created: snapshot.created_at, current: manifest === currentFile });
    } catch { /* Unknown or incomplete directories are not disposable previews. */ }
  }
  previews.sort((a, b) => Number(b.current) - Number(a.current) || b.created.localeCompare(a.created) || b.directory.localeCompare(a.directory));
  for (const item of previews.slice(keep)) {
    try { fs.rmSync(item.directory, { recursive: true }); removed.push(relative(workspace, item.directory)); }
    catch (error) { errors.push({ path: relative(workspace, item.directory), message: error.message }); }
  }
  return { removed, errors };
}

module.exports = { captureManuscriptSources, fileDigest, writeManuscriptSnapshot, readManuscriptSnapshot, pinManuscriptSnapshot, unpinManuscriptSnapshot, pruneManuscriptPreviews };
