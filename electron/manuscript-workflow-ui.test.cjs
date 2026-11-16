const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { EventEmitter } = require("node:events");
const { test } = require("node:test");
const store = require("./store.cjs");
const { stageManuscriptPdf } = require("./paper-to-slides.cjs");

async function actualAppFunction(name, scope) {
  const filename = path.join(__dirname, "../src/App.tsx"), source = fs.readFileSync(filename, "utf8");
  const start = source.indexOf(`  async function ${name}(`), end = source.indexOf("\n  }\n", start) + 4;
  assert.ok(start >= 0 && end > start, `Actual App callback ${name}`);
  const { transformWithOxc } = await import("vite");
  const { code } = await transformWithOxc(source.slice(start, end), "callback.ts", {});
  return new Function(...Object.keys(scope), `${code}\nreturn ${name};`)(...Object.values(scope));
}
function deferred() { let resolve; const promise = new Promise((value) => { resolve = value; }); return { promise, resolve }; }
async function fixture(t) {
  const task = await import("../src/task-selection.ts");
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-manuscript-ui-")));
  const dataRoot = path.join(root, "data"), oldRoot = path.join(root, "old-source"), newRoot = path.join(root, "new-target");
  for (const directory of [dataRoot, oldRoot, newRoot]) fs.mkdirSync(directory);
  const database = store.createWorkspaceStore(dataRoot), project = database.createResearchProject({ name: "Manuscript", workspacePath: oldRoot });
  const workspace = database.defaultProjectWorkspace(project.id), original = database.createResearchThread({ projectId: project.id, workspaceId: workspace.id, mode: "free-chat", title: "Original research task" });
  fs.mkdirSync(path.join(oldRoot, "paper")); fs.writeFileSync(path.join(oldRoot, "paper/main.tex"), "\\input{section}\n"); fs.writeFileSync(path.join(oldRoot, "paper/section.tex"), "Actual original manuscript\n");
  const build = await require("./latex-workspace.cjs").compileLatexDocument(oldRoot, "paper/main.tex", { executable: "tectonic", spawnImpl: (_command, args) => {
    const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = () => {};
    queueMicrotask(() => { fs.writeFileSync(path.join(args[args.indexOf("--outdir") + 1], "main.pdf"), "%PDF-controlled-UI-workflow\n"); child.emit("close", 0, null); }); return child;
  } });
  assert.equal(build.ok, true);
  database.setResearchProjectWorkspace(project.id, newRoot);
  const workspaces = database.listProjectWorkspaces(project.id), selection = task.threadTaskSelection(dataRoot, original, workspaces);
  const origin = { dataRoot, projectId: project.id, workspaceId: workspace.id, threadId: original.id, workspace: oldRoot, mainPath: "paper/main.tex", selectedPath: "paper/section.tex", manifestPath: build.source_snapshot.manifest_path, sourceVersion: build.source_snapshot.requested_source.source_version, pdfPath: build.source_snapshot.pdf.path, pdfSha256: build.source_snapshot.pdf.sha256, buildId: build.source_snapshot.build_id };
  const drafts = new Map([[task.taskDraftKey(selection), { text: "ORIGINAL_UNSENT_PLAN", selectionStart: 0, selectionEnd: 0 }]]), contexts = new Map(), settings = new Map(), sent = [], shown = [];
  let threads = [];
  const scope = { ...task, t: (value) => value, workspaces, dataFolderLoadingRef: { current: false }, taskSelectionRef: { current: selection }, activeRunRef: { current: null }, commandLockRef: { current: false }, threadOpenRequestRef: { current: 0 }, reasoningEffort: "medium", contextLength: "standard",
    manuscriptChatsRef: { current: new Map() }, window: { localStorage: { getItem: (key) => settings.get(key) ?? null, setItem: (key, value) => settings.set(key, value) } },
    readComposerDraft: (key) => drafts.get(key) ?? null, writeComposerDraft: (key, value) => drafts.set(key, value), appendComposerText: (first, next) => first ? `${first}\n\n${next}` : next,
    queueComposerText: (key, text) => { const old = drafts.get(key)?.text || ""; drafts.set(key, { text: old ? `${old}\n\n${text}` : text }); },
    setContextItems: (update, key) => contexts.set(key, update(contexts.get(key) || [])),
    setThreads: (update) => { threads = update(threads); }, setMainSection: (section) => shown.push(section),
    submitPrompt: async (...args) => { sent.push({ selection: scope.taskSelectionRef.current, args }); return true; },
    desktopBridge: { createResearchThread: async (input) => database.createResearchThread(input), getResearchThread: async (id) => database.getResearchThread(id), stagePaperToSlidesPdf: async (target, input, options) => stageManuscriptPdf(database, target, input, options) },
    displayThread: (thread, data) => { scope.taskSelectionRef.current = task.threadTaskSelection(data, thread, workspaces); },
  };
  t.after(() => { database.close(); fs.rmSync(root, { recursive: true, force: true }); });
  return { ...task, scope, database, project, workspace, root, dataRoot, oldRoot, newRoot, origin, selection, drafts, contexts, sent, shown };
}

test("actual App slides callback creates its target before copying the old-root build, preserving the original draft", async (t) => {
  const f = await fixture(t), start = await actualAppFunction("startSlidesFromPaper", f.scope);
  const target = f.newTaskSelection(f.dataRoot, { id: f.project.id, workspace_path: f.newRoot }, f.scope.workspaces, f.workspace.id);
  await start({ pdfPath: path.join(f.oldRoot, f.origin.pdfPath), backend: "codex", language: "English", length: "auto", instructions: "Keep the method", mineruToken: "", manuscript: f.origin }, target);
  assert.equal(f.sent.length, 1); assert.notEqual(f.sent[0].selection.threadId, f.selection.threadId);
  assert.equal(f.sent[0].selection.executionRoot, f.newRoot);
  const attachment = f.sent[0].args[4][0]; assert.ok(attachment.path.startsWith(f.newRoot + path.sep));
  assert.equal(fs.readFileSync(attachment.path, "utf8"), "%PDF-controlled-UI-workflow\n");
  const receipt = JSON.parse(fs.readFileSync(path.join(path.dirname(attachment.path), "manuscript-origin.json")));
  assert.equal(receipt.origin.workspace, f.oldRoot); assert.equal(receipt.target.executionRoot, f.newRoot); assert.equal(receipt.origin.pdfSha256, f.origin.pdfSha256);
  assert.match(f.sent[0].args[0], /Compiled manuscript provenance/);
  assert.equal(f.drafts.get(f.taskDraftKey(f.selection)).text, "ORIGINAL_UNSENT_PLAN");
});

test("late App slides staging stays with its original owner and stores a recoverable draft rather than sending in the newly selected task", async (t) => {
  const f = await fixture(t), gate = deferred(), entered = deferred();
  const stage = f.scope.desktopBridge.stagePaperToSlidesPdf;
  f.scope.desktopBridge.stagePaperToSlidesPdf = async (...args) => { const result = await stage(...args); entered.resolve(); await gate.promise; return result; };
  const start = await actualAppFunction("startSlidesFromPaper", f.scope), target = f.newTaskSelection(f.dataRoot, { id: f.project.id, workspace_path: f.newRoot }, f.scope.workspaces, f.workspace.id);
  const pending = start({ pdfPath: path.join(f.oldRoot, f.origin.pdfPath), backend: "codex", language: "English", length: "auto", instructions: "", mineruToken: "", manuscript: f.origin }, target);
  await entered.promise;
  const other = { ...f.selection, threadId: "another-selected-session", executionRoot: f.newRoot };
  f.scope.taskSelectionRef.current = other; gate.resolve();
  await assert.rejects(pending, /saved as a draft in its own session/);
  assert.equal(f.sent.length, 0); assert.deepEqual(f.scope.taskSelectionRef.current, other);
  const saved = [...f.drafts.entries()].find(([key]) => key !== f.taskDraftKey(f.selection));
  assert.ok(saved); assert.match(saved[1].text, /Input PDF:/); assert.match(saved[1].text, new RegExp(f.origin.pdfSha256));
  assert.equal(f.drafts.get(f.taskDraftKey(f.selection)).text, "ORIGINAL_UNSENT_PLAN");
  assert.equal(f.contexts.get(saved[0]).length, 1);
});

test("actual App manuscript discussion/revision uses an empty based-on historical-root session and reuses it without replacing drafts", async (t) => {
  const f = await fixture(t), open = await actualAppFunction("openManuscriptChat", f.scope);
  await open(f.origin, "Selected feedback, page 3, reviewed version " + f.origin.sourceVersion, "revision");
  const first = f.scope.taskSelectionRef.current, key = f.taskDraftKey(first), thread = f.database.getResearchThread(first.threadId);
  assert.equal(first.executionRoot, f.oldRoot); assert.notEqual(first.threadId, f.selection.threadId); assert.equal(thread.based_on_thread_id, f.selection.threadId); assert.equal(thread.turns.length, 0);
  f.drafts.set(key, { text: "USER_REVISION_NOTES\n" + f.drafts.get(key).text });
  await open(f.origin, "A second selected finding", "revision");
  assert.equal(f.scope.taskSelectionRef.current.threadId, first.threadId);
  assert.match(f.drafts.get(key).text, /^USER_REVISION_NOTES/); assert.match(f.drafts.get(key).text, /A second selected finding/);
  assert.equal(f.drafts.get(f.taskDraftKey(f.selection)).text, "ORIGINAL_UNSENT_PLAN");
  assert.equal(f.contexts.get(key).length, 1); assert.ok(f.contexts.get(key)[0].path.startsWith(f.oldRoot + path.sep));
});


test("a reopened unlinked analysis creates its session at its registered old root after the project default moves", async t => {
  const f = await fixture(t), packages = require("./project-results.cjs");
  const result = packages.savePackage({ id: "historical-analysis", projectId: f.project.id, workspaceId: f.workspace.id, executionRoot: f.oldRoot, threadId: null, kind: "analysis", title: "Original CSV", manifest: { source: { file: "source.csv" } }, files: [{ name: "source.csv", role: "source", encoding: "utf8", content: "x,y\n1,2\n2,ORIGINAL_LAST_ROW\n" }] });
  f.database.setResearchProjectWorkspace(f.project.id, f.oldRoot);
  f.database.registerProjectResult(result);
  f.database.setResearchProjectWorkspace(f.project.id, f.newRoot);
  const scope = { ...f.scope, analysisSessionsRef: { current: new Map() }, analysisHandoffsRef: { current: new Map() } };
  scope.desktopBridge.getProjectResult = async id => packages.readPackage(f.database.getProjectResultRecord(id));
  const continueAnalysis = await actualAppFunction("continueAnalysisInChat", scope);
  const owner = f.newTaskSelection(f.dataRoot, { id: f.project.id, workspace_path: f.newRoot }, scope.workspaces, f.workspace.id);
  const id = await continueAnalysis("Explain the full file", { id: "original-input", name: "original.csv", resultId: result.id, sourcePath: result.files[0].path, attachSource: true }, owner, () => true);
  const thread = f.database.getResearchThread(id), key = f.taskDraftKey(f.threadTaskSelection(f.dataRoot, thread, scope.workspaces));
  assert.equal(thread.workspace_path, f.oldRoot); assert.equal(thread.workspace_id, f.workspace.id);
  assert.equal(f.contexts.get(key)[0].path, path.join(f.oldRoot, result.files[0].path));
  assert.match(require("./agent/workspace-tools.cjs").readLines(f.oldRoot, result.files[0].path, 3, 3).content, /ORIGINAL_LAST_ROW/);
  assert.match(f.drafts.get(key).text, /Explain the full file/);
  assert.equal(f.drafts.get(f.taskDraftKey(f.selection)).text, "ORIGINAL_UNSENT_PLAN");
  await continueAnalysis("Append a follow-up", { id: "original-input", name: "original.csv", resultId: result.id }, owner, () => true);
  assert.equal(scope.analysisSessionsRef.current.size, 1); assert.match(f.drafts.get(key).text, /Append a follow-up/);
});
