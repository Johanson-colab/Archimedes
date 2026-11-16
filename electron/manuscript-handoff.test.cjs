const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const { EventEmitter } = require("node:events");
const test = require("node:test");
const library = require("./store.cjs");
const reviews = require("./paper-review-store.cjs");
const { compileLatexDocument } = require("./latex-workspace.cjs");
const { verifyManuscriptOrigin } = require("./manuscript-handoff.cjs");
const { stageManuscriptPdf } = require("./paper-to-slides.cjs");

function deferred() { let resolve; const promise = new Promise(value => { resolve = value; }); return { promise, resolve }; }
async function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-handoff-")));
  const data = path.join(root, "data"), source = path.join(root, "source"), target = path.join(root, "target");
  for (const directory of [data, source, target]) fs.mkdirSync(directory);
  const owner = library.createWorkspaceStore(data), project = owner.createResearchProject({ name: "Manuscript", workspacePath: source });
  const workspace = owner.defaultProjectWorkspace(project.id);
  const thread = owner.createResearchThread({ projectId: project.id, workspaceId: workspace.id, mode: "free-chat", prompt: "Source manuscript" });
  fs.mkdirSync(path.join(source, "paper")); fs.writeFileSync(path.join(source, "paper/main.tex"), "\\input{section}\n"); fs.writeFileSync(path.join(source, "paper/section.tex"), "Actual input\n");
  const compiled = await compileLatexDocument(source, "paper/main.tex", { executable: "tectonic", spawnImpl(_command, args) {
    const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = () => {};
    queueMicrotask(() => { fs.writeFileSync(path.join(args[args.indexOf("--outdir") + 1], "main.pdf"), "%PDF-1.7\ncontrolled consumer fixture\n"); child.emit("close", 0, null); });
    return child;
  } });
  assert.equal(compiled.ok, true);
  const build = compiled.source_snapshot;
  const origin = { dataRoot: data, projectId: project.id, workspaceId: workspace.id, threadId: thread.id, workspace: source,
    mainPath: "paper/main.tex", selectedPath: "paper/section.tex", manifestPath: build.manifest_path,
    sourceVersion: build.requested_source.source_version, pdfPath: build.pdf.path, pdfSha256: build.pdf.sha256, buildId: build.build_id };
  const marker = path.join(source, path.dirname(build.manifest_path), "retained-inputs.json");
  t.after(() => { reviews.close(); library.closeAllWorkspaces(); fs.rmSync(root, { recursive: true, force: true }); });
  return { root, data, source, target, owner, project, workspace, thread, origin, marker };
}

function reviewModule({ extract, failCreate = false } = {}) {
  const filename = path.join(__dirname, "paper-review.cjs"), loaded = new Module(filename, module);
  loaded.filename = filename; loaded.paths = Module._nodeModulePaths(__dirname);
  const requireOriginal = loaded.require.bind(loaded);
  loaded.require = name => {
    if (name === "./paper-review-model.cjs") return { resolveReviewModel: () => ({ provider: "custom", model: "fixture", baseUrl: "https://fixture.invalid", apiKey: "fake" }), buildModelLabel: () => "fixture" };
    if (name === "./agent/pdf-reader.cjs") return { extractPdfPagesData: extract || (async () => ({ pageCount: 1, pages: [{ page: 1, text: "Controlled manuscript text" }] })) };
    if (name === "./paper-review-pipeline.cjs") return { runPipeline: async () => ({ gate: { status: "failed", reason: "Fixture does not simulate scientific review." }, usage: { inputTokens: 0, outputTokens: 0 } }) };
    if (name === "./paper-review-store.cjs" && failCreate) return { ...reviews, createRun() { throw new Error("Controlled persistence failure"); } };
    return requireOriginal(name);
  };
  // Entire production orchestration, with fee-free model/PDF dependency seams.
  loaded._compile(fs.readFileSync(filename, "utf8"), filename);
  return loaded.exports;
}

test("review retains the real build with its generated run ID and keeps its data-store lease through background ingestion", async t => {
  const f = await fixture(t), entered = deferred(), resume = deferred(), finished = deferred();
  const review = reviewModule({ extract: async () => {
    entered.resolve(); await resume.promise;
    library.saveTask({ prompt: "Background ingestion receipt", response: "Still owned by A", status: "completed" });
    return { pageCount: 1, pages: [{ page: 1, text: "Controlled manuscript input" }] };
  } });
  review.initialize(path.join(f.root, "settings"));
  f.owner.setResearchProjectWorkspace(f.project.id, f.target);
  const started = await f.owner.run(() => review.createRun({ projectId: f.project.id, manuscript: f.origin, source: { kind: "pdf", filePath: "/ignored/untrusted.pdf" } }, {
    dataStore: f.owner, workspace: f.source, emit: event => { if (["complete", "error"].includes(event.type)) finished.resolve(event); },
  }));
  await entered.promise;
  assert.deepEqual(reviews.getRun(started.runId).manuscript, f.origin);
  assert.equal(reviews.getRun(started.runId).ownerDataRoot, f.data);
  assert.ok(JSON.parse(fs.readFileSync(f.marker)).some(reference => reference.run_id === started.runId && reference.kind === "paper-review"));
  f.owner.close(); library.createWorkspaceStore(f.target); resume.resolve();
  assert.equal((await finished.promise).type, "complete");
  assert.equal(library.createWorkspaceStore(f.data).getSnapshot().tasks[0].response, "Still owned by A");
  assert.ok(fs.existsSync(f.marker), "normal terminal history retains the actual PDF input");
});

test("failed run creation rolls back only its pin, and stale or mismatched inputs cannot create a new review", async t => {
  const f = await fixture(t), review = reviewModule({ failCreate: true }); review.initialize(path.join(f.root, "settings"));
  await assert.rejects(f.owner.run(() => review.createRun({ manuscript: f.origin }, { dataStore: f.owner })), /persistence failure/);
  assert.equal(fs.existsSync(f.marker), false);
  assert.equal(reviews.listRuns().length, 0);
  assert.throws(() => verifyManuscriptOrigin(f.owner, { ...f.origin, pdfSha256: "f".repeat(64) }), /version/);
  fs.appendFileSync(path.join(f.source, "paper/section.tex"), "Changed after the build\n");
  await assert.rejects(f.owner.run(() => review.createRun({ manuscript: f.origin }, { dataStore: f.owner })), /Save and compile/);
  assert.equal(reviews.listRuns().length, 0);
});

test("slides copy a historical manuscript to the real target session root with a durable source receipt and reject other projects", async t => {
  const f = await fixture(t);
  f.owner.setResearchProjectWorkspace(f.project.id, f.target);
  const slides = f.owner.createResearchThread({ projectId: f.project.id, workspaceId: f.workspace.id, prompt: "Slides", mode: "free-chat" });
  const pdf = path.join(f.source, f.origin.pdfPath);
  const staged = stageManuscriptPdf(f.owner, f.target, pdf, { manuscript: f.origin, threadId: slides.id });
  assert.ok(staged.startsWith(`${f.target}${path.sep}`)); assert.deepEqual(fs.readFileSync(staged), fs.readFileSync(pdf));
  const receipt = JSON.parse(fs.readFileSync(path.join(path.dirname(staged), "manuscript-origin.json")));
  assert.equal(receipt.origin.workspace, f.source); assert.equal(receipt.target.executionRoot, f.target); assert.equal(receipt.target.threadId, slides.id);
  assert.ok(JSON.parse(fs.readFileSync(f.marker)).some(reference => reference.run_id === slides.id && reference.kind === "paper-to-slides"));
  const other = f.owner.createResearchProject({ name: "Other", workspacePath: f.target });
  const otherThread = f.owner.createResearchThread({ projectId: other.id, prompt: "Other", mode: "free-chat" });
  assert.throws(() => stageManuscriptPdf(f.owner, f.target, pdf, { manuscript: f.origin, threadId: otherThread.id }), /another manuscript project/);
  assert.throws(() => stageManuscriptPdf(f.owner, f.target, pdf, { manuscript: { ...f.origin, dataRoot: f.target }, threadId: slides.id }), /another data workspace/);
});

test("the global review database filters same-project-ID histories by data root without fabricating provenance for legacy rows", async t => {
  const f = await fixture(t), review = reviewModule(); review.initialize(path.join(f.root, "settings"));
  const fields = { projectId: f.project.id, paperTitle: "Same cloud/project identity", sourceKind: "pdf" };
  const local = reviews.createRun({ ...fields, ownerDataRoot: f.data, manuscript: f.origin });
  reviews.createRun({ ...fields, ownerDataRoot: f.target, manuscript: { ...f.origin, dataRoot: f.target } });
  const legacy = reviews.createRun(fields);
  const visible = review.listRuns({ projectId: f.project.id, ownerDataRoot: f.data });
  assert.deepEqual(visible.map(run => run.id).sort(), [local, legacy].sort());
  assert.equal(visible.find(run => run.id === legacy).manuscript, null);
  assert.deepEqual(reviews.getRun(local).manuscript, f.origin);
});
