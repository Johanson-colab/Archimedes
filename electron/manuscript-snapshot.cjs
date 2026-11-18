const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { workspacePath } = require("./workspace-files.cjs");

const EXCLUDED_DIRECTORIES = new Set([".archimedes", ".git", "node_modules", "dist", "build", ".next", ".venv", "venv", "__pycache__", ".cache"]);
const MAX_FILES = 10000;
const MAX_BYTES = 500 * 1024 * 1024;
// The watcher needs a bounded settle window: file events are delivered by the
// OS asynchronously (macOS FSEvents batches them), so the compiler can exit
// before the last create/delete pair reaches the callback.
const OBSERVATION_SETTLE_MS = 100;
// Files LaTeX engines and helper tools regenerate next to the document.  They
// are outputs, not manuscript inputs.  Keep this list to compound suffixes so
// real inputs such as .tex, .bib, .sty, .cls, .png or .jpg are never excluded.
const COMPILER_INTERMEDIATE_SUFFIXES = Object.freeze([
  ".synctex.gz", ".synctex", ".run.xml", ".fdb_latexmk",
  ".aux", ".log", ".toc", ".out", ".fls", ".bbl", ".blg", ".nav", ".snm",
  ".vrb", ".idx", ".ind", ".ilg", ".lof", ".lot", ".bcf", ".xdv", ".dvi",
]);
const OS_METADATA_NAMES = new Set([".ds_store", "thumbs.db", "desktop.ini", ".localized"]);
const hash = data => createHash("sha256").update(data).digest("hex");
const relative = (root, file) => path.relative(root, file).split(path.sep).join("/") || ".";

function isIgnoredObservationPath(relativePath, mainStem) {
  const parts = relativePath.split("/"), name = parts.at(-1).toLowerCase();
  if (parts.some((part) => EXCLUDED_DIRECTORIES.has(part))) return true;
  if (OS_METADATA_NAMES.has(name) || name.startsWith("._")) return true;
  return COMPILER_INTERMEDIATE_SUFFIXES.some((suffix) => relativePath.toLowerCase() === mainStem + suffix);
}

function normalizeObservedPath(filename, directory) {
  const observed = String(filename).replaceAll("\\", "/");
  // A recursive watcher reports the watched directory's own name for metadata
  // changes on the root, which is not a manuscript entry.
  if (!observed || observed === "." || observed === path.basename(directory)) return "";
  if (path.posix.isAbsolute(observed) || path.win32.isAbsolute(observed)) return "";
  if (observed.split("/").some((part) => !part || part === "." || part === "..")) return "";
  return observed;
}

function pathStillExists(workspace, relativePath) {
  try { fs.lstatSync(workspacePath(workspace, relativePath, { mustExist: false })); return true; }
  catch (error) { return error.code !== "ENOENT"; }
}

// Yield to the event loop for a bounded real-time window so late OS events
// arrive.  Deliberately avoid setTimeout: compiler timeout tests replace it
// with a fake clock, while this window measures I/O delivery, not compiler time.
async function settleObservationWindow(ms) {
  const deadline = process.hrtime.bigint() + BigInt(ms) * 1_000_000n;
  while (process.hrtime.bigint() < deadline) await new Promise((resolve) => setImmediate(resolve));
}

/**
 * Watch the manuscript directory while a compiler runs.  The observer only
 * reports paths; contents are not copied because transient files may already
 * be gone when the build finishes.
 */
function watchManuscriptDirectory(root, projectPath, { knownInputs = [], directories = [], sourcePath = "", settleMs = OBSERVATION_SETTLE_MS } = {}) {
  let workspace, directory;
  try {
    workspace = workspacePath(root);
    directory = workspacePath(workspace, projectPath);
  } catch (error) {
    return { finish: async () => ({ available: false, error: error.message, transient_inputs: [] }), close: () => {} };
  }
  const changedPaths = new Set();
  const observedParents = new Set();
  const directoryTimes = new Map();
  const mainStem = path.posix.basename(sourcePath, ".tex").toLowerCase();
  let watcher, unavailable = "", unidentified = false, closed = false;
  const fail = (error) => { if (!unavailable) unavailable = error?.message || String(error); };
  const close = () => {
    if (closed) return;
    closed = true;
    try { watcher?.close(); } catch (error) { fail(error); }
  };
  const absolute = (observed) => projectPath && projectPath !== "." ? `${projectPath}/${observed}` : observed;

  try {
    for (const name of directories) {
      directoryTimes.set(name, fs.statSync(workspacePath(workspace, name), { bigint: true }).mtimeNs);
    }
    watcher = fs.watch(directory, { recursive: true, persistent: false }, (_event, filename) => {
      if (!filename) { unidentified = true; return; }
      const observed = normalizeObservedPath(filename, directory);
      if (observed) {
        observedParents.add(path.posix.dirname(absolute(observed)));
        if (!isIgnoredObservationPath(observed, mainStem)) changedPaths.add(observed);
      }
    });
    watcher.on("error", (error) => { fail(error); close(); });
  } catch (error) { fail(error); }

  async function finish() {
    if (unavailable) return { available: false, error: unavailable, transient_inputs: [] };
    try {
      if (settleMs > 0) await settleObservationWindow(settleMs);
      close();
      if (unavailable) return { available: false, error: unavailable, transient_inputs: [] };
      if (unidentified) return { available: false, error: "The manuscript directory watcher reported a change without a path.", transient_inputs: [] };
      // Some filesystems coalesce create/delete events. Directory modification
      // times still reveal an unobserved entry change across the compile.
      for (const [name, before] of directoryTimes) {
        if (!observedParents.has(name) && fs.statSync(workspacePath(workspace, name), { bigint: true }).mtimeNs !== before) {
          return { available: false, error: "A manuscript directory changed without a corresponding file event.", transient_inputs: [] };
        }
      }
      const known = new Set(knownInputs);
      const transientInputs = [...changedPaths]
        .map(absolute)
        .filter((relativePath) => !known.has(relativePath) && !pathStillExists(workspace, relativePath))
        .sort();
      return { available: true, error: "", transient_inputs: transientInputs };
    } catch (error) {
      return { available: false, error: error.message, transient_inputs: [] };
    } finally { close(); }
  }

  return { finish, close };
}

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
  const files = [], observations = [], untracked = [], directories = [];
  let bytes = 0;
  function visit(current) {
    directories.push(relative(workspace, current));
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
  return { workspace, source_path: sourcePath, project_path: relative(workspace, directory), coverage: "manuscript-directory", directories, source_version: hash(JSON.stringify({ files, untracked })), observation_version: hash(JSON.stringify(observations)), files, total_bytes: bytes, untracked_inputs: untracked, excluded_directories: [...EXCLUDED_DIRECTORIES] };
}

function artifact(root, file) {
  const digest = fileDigest(file);
  return { path: relative(root, file), bytes: digest.bytes, sha256: digest.sha256 };
}

function writeManuscriptSnapshot({ root, buildDirectory, buildId, requested, started, finished, pdfPath, log, compiled, engine, observation = {} }) {
  const sourceChanged = requested.source_version !== started.source_version || started.source_version !== finished.source_version || started.observation_version !== finished.observation_version;
  const transientInputs = Array.isArray(observation.transient_inputs) ? observation.transient_inputs : [];
  const observationAvailable = observation.available !== false;
  const logFile = path.join(buildDirectory, "build-output.log");
  fs.writeFileSync(logFile, log);
  const pdf = pdfPath && fs.existsSync(pdfPath) ? artifact(root, pdfPath) : null;
  const snapshot = {
    version: 1, build_id: buildId, workspace: root, source_path: requested.source_path, project_path: requested.project_path,
    created_at: new Date().toISOString(), engine, requested_source: requested,
    started_source_version: started.source_version, finished_source_version: finished.source_version,
    source_changed: sourceChanged,
    // A transient manuscript input means the compiler may have read bytes that
    // no longer exist, so the finished hashes cannot certify the artifact even
    // when the build itself succeeded.  Untracked inputs and an unavailable
    // watcher have the same effect: the preview exists but is not certifiable.
    status: sourceChanged ? "stale"
      : !compiled || !pdf ? "failed"
        : transientInputs.length || !observationAvailable || requested.untracked_inputs.length ? "unverified" : "current",
    transient_inputs: transientInputs,
    observation: { available: observationAvailable, error: observation.error || "" },
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
  const transientInputs = Array.isArray(snapshot.transient_inputs) ? snapshot.transient_inputs : [];
  const observationAvailable = snapshot.observation?.available !== false;
  const reasons = [];
  if (verificationError) reasons.push(verificationError);
  if (transientInputs.length) reasons.push(`Compilation created and removed manuscript inputs: ${transientInputs.join(", ")}. The saved PDF cannot be certified against the current sources; compile again.`);
  else if (!observationAvailable) reasons.push(`The manuscript directory could not be observed during compilation${snapshot.observation.error ? `: ${snapshot.observation.error}` : ""}. The saved PDF cannot be certified against the current sources; compile again.`);
  if (!sourceMatches) reasons.push("The manuscript sources no longer match the saved build.");
  if (!pdfMatches) reasons.push("The saved PDF is missing or its bytes changed after compilation.");
  const isCurrent = snapshot.status === "current" && sourceMatches && pdfMatches && !transientInputs.length && observationAvailable;
  return {
    ...snapshot, current_source_version: current?.source_version || null, source_matches: sourceMatches, pdf_matches: pdfMatches,
    verification_error: verificationError, verification_reason: isCurrent ? "" : reasons.join(" ") || `This build is not current (${snapshot.status}).`,
    current: isCurrent,
  };
}

/** Retain five completed previews per document; never active builds. */
function pruneManuscriptPreviews(root, manifestPath, keep = 5) {
  const workspace = workspacePath(root), currentFile = workspacePath(workspace, manifestPath);
  const current = JSON.parse(fs.readFileSync(currentFile, "utf8"));
  const parent = path.dirname(path.dirname(currentFile));
  const previews = [], removed = [], errors = [];
  for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[a-f0-9-]+$/.test(entry.name)) continue;
    const directory = path.join(parent, entry.name), manifest = path.join(directory, "source-snapshot.json");
    if (!fs.existsSync(manifest)) continue;
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

module.exports = { captureManuscriptSources, fileDigest, writeManuscriptSnapshot, readManuscriptSnapshot, pruneManuscriptPreviews, watchManuscriptDirectory };
