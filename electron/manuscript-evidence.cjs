const fs = require("node:fs");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const { readWorkspaceFile, workspacePath } = require("./workspace-files.cjs");
const { readManuscriptSnapshot } = require("./manuscript-snapshot.cjs");
const { readExperimentRunLog } = require("./research-graph/experiment-runs.cjs");
const { parseDelimited, numericValue, summarizeColumn } = require("../shared/analysis-dataset.mjs");
const { listAnalyses, loadAnalysis } = require("./project-results.cjs");

const digest = value => createHash("sha256").update(value).digest("hex");
const ID = /^[a-f0-9-]{36}$/;
const TRACKED_KINDS = ["target", "baseline", "difference"];

function projectScope(store, projectId, role = "viewer") {
  if (typeof projectId !== "string" || !store.canAccessProject(projectId, role)) {
    throw new Error("You do not have access to these manuscript results.");
  }
  const project = store.getResearchProject(projectId);
  if (!project) throw new Error("You do not have access to these manuscript results.");
  return project;
}

function sourceWorkspace(store, project, requested) {
  if (typeof requested !== "string" || !path.isAbsolute(requested)) {
    throw new Error("Choose a manuscript workspace from this project.");
  }
  const workspace = workspacePath(requested);
  const candidates = [project.workspace_path || store.workspace, ...store.listProjectWorkspaces(project.id).map(item => item.root)];
  const registered = candidates.some(candidate => candidate && fs.existsSync(candidate) && fs.realpathSync(candidate) === workspace);
  if (!registered) throw new Error("Choose a manuscript workspace from this project.");
  return workspace;
}

function evidenceDirectory(store, projectId, create = false) {
  const segments = [".archimedes", "manuscript-evidence", digest(projectId)];
  let directory = store.workspace;
  for (const segment of segments) {
    const child = path.join(directory, segment);
    if (create) fs.mkdirSync(child, { recursive: true, mode: 0o700 });
    else if (!fs.existsSync(child)) return null;
    directory = workspacePath(store.workspace, path.relative(store.workspace, child));
  }
  return directory;
}

function pinnedManifestPath(workspace, projectId, buildId) {
  if (!/^[a-f0-9-]{36}$/.test(String(buildId || ""))) return "";
  return path.join(workspace, ".archimedes", "manuscript-evidence", digest(projectId), "builds", buildId, "source-snapshot.json");
}

function relativeWorkspacePath(workspace, file) {
  return path.relative(workspace, file).split(path.sep).join("/");
}

function pinManuscriptBuild(workspace, projectId, snapshot) {
  const target = pinnedManifestPath(workspace, projectId, snapshot.build_id);
  if (!target) throw new Error("The manuscript build has no usable identifier.");
  const directory = path.dirname(target);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (!fs.existsSync(target)) {
    const pdf = path.join(directory, "manuscript.pdf");
    const log = path.join(directory, "build-output.log");
    if (snapshot.pdf?.path) fs.copyFileSync(workspacePath(workspace, snapshot.pdf.path), pdf);
    fs.copyFileSync(workspacePath(workspace, snapshot.log.path), log);
    const pinned = {
      ...snapshot,
      manifest_path: relativeWorkspacePath(workspace, target),
      pdf: snapshot.pdf ? { ...snapshot.pdf, path: relativeWorkspacePath(workspace, pdf) } : snapshot.pdf,
      log: { ...snapshot.log, path: relativeWorkspacePath(workspace, log) },
    };
    fs.writeFileSync(target, `${JSON.stringify(pinned, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  }
  return relativeWorkspacePath(workspace, target);
}

function visibleRun(store, projectId, runId) {
  const run = store.getExperimentRun(runId);
  return run?.project_id === projectId ? run : null;
}

function hasLog(run) {
  return Boolean(run?.log_path && fs.statSync(run.log_path, { throwIfNoEntry: false })?.isFile());
}

function decodedAnalysis(analysis) {
  if (!analysis || analysis.source.state !== "ready" || !analysis.source.bytes) return null;
  const delimiter = /\.tsv$/i.test(analysis.source.name) ? "\t" : ",";
  return parseDelimited(new TextDecoder().decode(analysis.source.bytes), delimiter);
}

function summarize(dat, analysis, baselineColumn, kind, includeRows = false) {
  const column = analysis.recipe.column;
  const unit = analysis.recipe.unit || "";
  const seedColumn = analysis.recipe.seedColumn;
  const selected = summarizeColumn(dat.rows, column);
  const hasBaseline = baselineColumn !== null;
  if (hasBaseline && (!Number.isInteger(baselineColumn) || baselineColumn < 0 || baselineColumn >= dat.headers.length || baselineColumn === column || baselineColumn === seedColumn)) {
    throw new Error("Choose a different baseline column.");
  }
  const compare = hasBaseline ? summarizeColumn(dat.rows, baselineColumn) : null;
  if (selected.mean === null || (hasBaseline && compare.mean === null) || (kind !== "target" && !compare)) {
    throw new Error("The selected data does not contain the numeric values for this result.");
  }
  const difference = compare ? selected.mean - compare.mean : null;
  const percent = /^(?:%|percent|percentage)$/i.test(unit.trim());
  const result = {
    sourceName: analysis.source.name,
    inputSha256: analysis.source.sha256,
    target: { name: dat.headers[column], mean: selected.mean, count: selected.count },
    baseline: compare ? { name: dat.headers[baselineColumn], mean: compare.mean, count: compare.count } : null,
    difference,
    unit,
    resultUnit: kind === "difference" && percent ? "percentage points" : unit,
    value: kind === "target" ? selected.mean : kind === "baseline" ? compare.mean : difference,
    seedColumn: Number.isInteger(seedColumn) ? dat.headers[seedColumn] : null,
  };
  if (includeRows) result.rows = dat.rows.map((row, index) => ({
    seed: Number.isInteger(seedColumn) ? row[seedColumn] : String(index + 1),
    target: numericValue(row[column]),
    baseline: hasBaseline ? numericValue(row[baselineColumn]) : null,
  }));
  return result;
}

function evidenceOptions(store, { projectId, analysisId }) {
  const project = projectScope(store, projectId);
  if (analysisId) {
    const analysis = loadAnalysis(store.workspace, project.id, analysisId);
    const dat = decodedAnalysis(analysis);
    if (!dat) throw new Error("The saved analysis input is unavailable.");
    return {
      column: dat.headers[analysis.recipe.column],
      columns: dat.headers.flatMap((name, index) => index !== analysis.recipe.column && index !== analysis.recipe.seedColumn && dat.rows.some(row => numericValue(row[index]) !== null) ? [{ index, name }] : []),
    };
  }
  return {
    analyses: listAnalyses(store.workspace, project.id),
    runs: store.listExperimentRuns({ projectId: project.id }).filter(run => run.status === "succeeded").map(run => ({
      id: run.id,
      command: run.command.slice(0, 120),
      startedAt: run.started_at || run.created_at,
    })).reverse(),
  };
}

function saveEvidence(store, input) {
  const project = projectScope(store, input.projectId, "editor");
  const workspace = sourceWorkspace(store, project, input.workspace);
  const run = visibleRun(store, project.id, input.runId);
  if (run?.status !== "succeeded") throw new Error("Choose a completed experiment run from this project.");
  if (!hasLog(run)) throw new Error("The experiment run log is missing.");
  const analysis = loadAnalysis(store.workspace, project.id, input.analysisId);
  const dat = decodedAnalysis(analysis);
  if (!dat) throw new Error("The saved analysis input is unavailable.");
  if (!TRACKED_KINDS.includes(input.kind)) throw new Error("Choose a result to link.");
  const baselineColumn = input.baselineColumn ?? null;
  const result = summarize(dat, analysis, baselineColumn, input.kind);
  const snapshot = readManuscriptSnapshot(workspace, input.manifestPath);
  if (!snapshot.current || snapshot.source_path !== input.mainPath) {
    throw new Error("Compile the current manuscript before linking a result.");
  }
  const source = readWorkspaceFile(workspace, input.sourcePath);
  const file = snapshot.requested_source.files.find(item => item.path === source.path);
  if (!file || typeof source.content !== "string" || digest(source.content) !== file.sha256) {
    throw new Error("The selected source does not match the compiled manuscript.");
  }
  const { line, column, length } = input.anchor ?? {};
  if (![line, column, length].every(Number.isSafeInteger) || line < 1 || column < 1 || length < 1 || length > 120) {
    throw new Error("Select one number in the manuscript source.");
  }
  const text = source.content.split(/\r?\n/)[line - 1]?.slice(column - 1, column - 1 + length);
  if (text?.length !== length || numericValue(text) === null) throw new Error("Select one number in the manuscript source.");

  const manifestPath = pinManuscriptBuild(workspace, project.id, snapshot);
  const id = randomUUID();
  const record = {
    version: 1,
    id,
    projectId: project.id,
    workspace,
    createdAt: new Date().toISOString(),
    manuscript: {
      mainPath: snapshot.source_path, sourcePath: source.path, line, column, text,
      buildId: snapshot.build_id, manifestPath, sourceVersion: snapshot.requested_source.source_version,
    },
    run: { id: run.id, nodeId: run.node_id, threadId: run.thread_id, command: run.command, commit: run.commit_sha },
    analysis: { id: analysis.id, baselineColumn, kind: input.kind },
    result,
  };
  const directory = evidenceDirectory(store, project.id, true);
  const temp = path.join(directory, `${id}.tmp`);
  fs.writeFileSync(temp, JSON.stringify(record), { flag: "wx", mode: 0o600 });
  fs.renameSync(temp, path.join(directory, `${id}.json`));
  return record;
}

function getEvidence(store, { projectId, workspace: sourceRoot, id }) {
  const project = projectScope(store, projectId);
  const workspace = sourceWorkspace(store, project, sourceRoot);
  const directory = evidenceDirectory(store, project.id);
  const file = directory && typeof id === "string" && ID.test(id) && path.join(directory, `${id}.json`);
  if (!file || !fs.lstatSync(file, { throwIfNoEntry: false })?.isFile()) throw new Error("The manuscript result does not exist in this project.");
  const record = JSON.parse(fs.readFileSync(file, "utf8"));
  if (record.workspace !== workspace || record.projectId !== project.id) throw new Error("The manuscript result does not exist in this project.");

  const pinned = pinnedManifestPath(workspace, record.projectId, record.manuscript.buildId);
  const manifest = pinned && fs.existsSync(pinned) ? relativeWorkspacePath(workspace, pinned) : record.manuscript.manifestPath;
  let build = "missing";
  try {
    const snapshot = readManuscriptSnapshot(workspace, manifest);
    build = snapshot.current && snapshot.requested_source.source_version === record.manuscript.sourceVersion ? "ready" : "stale";
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const run = visibleRun(store, project.id, record.run.id);
  let analysis;
  try { analysis = loadAnalysis(store.workspace, project.id, record.analysis.id); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const sameInput = analysis?.source.sha256 === record.result.inputSha256;
  const dataset = sameInput ? decodedAnalysis(analysis) : null;
  const log = hasLog(run) ? store.run(() => readExperimentRunLog({ runId: run.id })) : null;
  return {
    ...record,
    status: { build, run: run ? "ready" : "missing", log: log ? "ready" : "missing", data: !sameInput ? (analysis ? "changed" : "missing") : analysis.source.state },
    log: log?.text ?? null,
    rows: dataset ? summarize(dataset, analysis, record.analysis.baselineColumn, record.analysis.kind, true).rows : [],
  };
}

function listEvidence(store, { projectId, workspace: sourceRoot, mainPath }) {
  const project = projectScope(store, projectId);
  const workspace = sourceWorkspace(store, project, sourceRoot);
  const directory = evidenceDirectory(store, project.id);
  if (!directory) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(file => {
    if (!file.isFile() || !file.name.endsWith(".json")) return [];
    const record = JSON.parse(fs.readFileSync(path.join(directory, file.name), "utf8"));
    return record.projectId === project.id && record.workspace === workspace && record.manuscript.mainPath === mainPath
      ? [{ id: record.id, manuscript: record.manuscript, value: record.result.value, unit: record.result.resultUnit, createdAt: record.createdAt }] : [];
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

module.exports = { evidenceOptions, getEvidence, listEvidence, saveEvidence };
