const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const test = require("node:test");
const { createWorkspaceStore } = require("./store.cjs");
const { createNode } = require("./research-graph/service.cjs");
const { captureManuscriptSources, writeManuscriptSnapshot } = require("./manuscript-snapshot.cjs");
const { saveAnalysis } = require("./project-results.cjs");
const { saveEvidence, getEvidence, listEvidence } = require("./manuscript-evidence.cjs");

test("reopen linked manuscript values, flag changed or missing evidence, and enforce project ownership", (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "manuscript-result-")));
  let store = createWorkspaceStore(root);
  t.after(() => { store.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const paper = "paper/main.tex";
  fs.mkdirSync(path.join(root, "paper"));
  fs.writeFileSync(path.join(root, paper), "Baseline 71, target 73, difference 2.\n");
  const project = store.getSnapshot().projects[0];
  const otherRoot = path.join(root, "other");
  fs.mkdirSync(otherRoot);
  const other = store.createResearchProject({ name: "Other project", workspacePath: otherRoot });
  const thread = store.createResearchThread({ projectId: project.id, workspacePath: root, prompt: "Compare experiments", mode: "research" });
  const scopeForNode = { projectId: project.id, threadId: thread.id, content: {} };
  const graph = store.run(() => {
    const question = createNode({ ...scopeForNode, kind: "question", title: "Accuracy" });
    const idea = createNode({ ...scopeForNode, kind: "idea", title: "Compare accuracy", parents: [{ nodeId: question.id }] });
    return createNode({ ...scopeForNode, kind: "experiment", title: "Compare accuracy", parents: [{ nodeId: idea.id }] });
  });
  const log = path.join(root, ".archimedes", "fixture.log");
  fs.writeFileSync(log, "seed 1: 70 73\nseed 2: 72 72\nseed 3: 71 74\n");
  const run = store.createExperimentRun({ projectId: project.id, threadId: thread.id, nodeId: graph.id, cwd: root, command: "printf fixture", logPath: log });
  store.updateExperimentRun({ runId: run.id, status: "succeeded", exitCode: 0 });
  const bytes = Buffer.from("seed,baseline,target\n1,70,73\n2,72,72\n3,71,74\n");
  const saved = saveAnalysis(root, project.id, { bytes, name: "accuracy.csv", recipe: {
    column: 2, seedColumn: 0, unit: "%", config: { type: "line", x: 0, y: 2, group: -1 },
  } });
  const buildId = randomUUID();
  const buildDirectory = path.join(root, ".archimedes", "latex-build", "aa", buildId);
  fs.mkdirSync(buildDirectory, { recursive: true });
  const pdfPath = path.join(buildDirectory, "main.pdf");
  fs.writeFileSync(pdfPath, "%PDF-1.4\n");
  const source = captureManuscriptSources(root, paper);
  const snapshot = writeManuscriptSnapshot({
    root, buildDirectory, buildId, requested: source, started: source, finished: source,
    pdfPath, log: "fixture", compiled: true, engine: "fixture",
  });
  const scope = { workspace: root, projectId: project.id, mainPath: paper };
  const selections = [
    ["baseline", 10, 2, 71, "%"], ["target", 21, 2, 73, "%"], ["difference", 36, 1, 2, "percentage points"],
  ];
  const records = selections.map(([kind, column, length, value, unit]) => {
    const record = saveEvidence(store, {
      ...scope, sourcePath: paper, manifestPath: snapshot.manifest_path, anchor: { line: 1, column, length },
      runId: run.id, analysisId: saved.id, baselineColumn: 1, kind,
    });
    assert.equal(record.manuscript.text, String(value));
    assert.equal(record.result.value, value);
    assert.equal(record.result.resultUnit, unit);
    return record;
  });
  const access = { ...scope, id: records[2].id };
  store.close();
  store = createWorkspaceStore(root);
  assert.equal(listEvidence(store, scope).length, 3);
  const reopened = getEvidence(store, access);
  assert.deepEqual(reopened.status, { build: "ready", run: "ready", log: "ready", data: "ready" });
  assert.deepEqual(reopened.rows, [
    { seed: "1", baseline: 70, target: 73 }, { seed: "2", baseline: 72, target: 72 }, { seed: "3", baseline: 71, target: 74 },
  ]);
  assert.match(reopened.log, /seed 3/);
  assert.equal(reopened.manuscript.buildId, buildId);
  assert.equal(reopened.analysis.id, saved.id);
  assert.match(reopened.result.inputSha256, /^[a-f0-9]{64}$/);

  assert.deepEqual(listEvidence(store, { ...scope, projectId: other.id, workspace: otherRoot }), []);
  assert.throws(() => getEvidence(store, { ...access, projectId: other.id, workspace: otherRoot }), /does not exist in this project/);
  assert.throws(() => getEvidence(store, { ...access, projectId: other.id }), /workspace from this project/);
  fs.appendFileSync(path.join(root, paper), "Later edit.\n");
  fs.unlinkSync(log);
  fs.unlinkSync(path.join(root, "research-results", "analysis", project.id, saved.id, "source"));
  const changed = getEvidence(store, access);
  assert.deepEqual(changed.status, { build: "stale", run: "ready", log: "missing", data: "missing" });
  assert.deepEqual(changed.rows, []);
});
