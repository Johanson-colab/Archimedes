const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { DatabaseSync } = require('node:sqlite');
const { createHash } = require('node:crypto');
const store = require('./store.cjs');
const transfer = require('./project-transfer.cjs');
const results = require('./project-results.cjs');

function fixture(t) {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'archimedes-transfer-')));
  let sourceDb, targetDb;
  t.after(() => { sourceDb?.close(); targetDb?.close(); store.closeAllWorkspaces(); fs.rmSync(directory, { recursive: true, force: true }); });
  const make = name => { const root = path.join(directory, name); fs.mkdirSync(root); return root; };
  const source = make('source'), target = make('target'), exported = make('exported'), restored = make('restored'), execution = make('execution');
  const sourceStore = store.createWorkspaceStore(source), targetStore = store.createWorkspaceStore(target);
  const project = sourceStore.createResearchProject({ name: 'Shared project', workspacePath: execution });
  const workspace = sourceStore.defaultProjectWorkspace(project.id);
  const library = sourceStore.createLibrary({ projectId: project.id, name: 'Selected literature' });
  const paper = sourceStore.addPaper(library.id, { title: 'A selected paper', doi: '10.1000/transfer', authors: ['Author'] });
  fs.mkdirSync(path.join(source, '.archimedes/papers'), { recursive: true });
  fs.writeFileSync(path.join(source, `.archimedes/papers/${paper.id}.pdf`), '%PDF-1.4 selected fixture');
  sourceStore.replacePaperReaderAsset(paper.id, { relative_path: `.archimedes/papers/${paper.id}.pdf`, sha256: createHash('sha256').update('%PDF-1.4 selected fixture').digest('hex'), size_bytes: 25, page_count: 1, pages: [{ page_number: 1, text: 'Selected full text' }] });
  sourceStore.createPaperHighlight(paper.id, { page_number: 1, quote: 'Selected full text', note: 'Keep this note' }, project.id);
  fs.mkdirSync(path.join(execution, 'paper')); fs.writeFileSync(path.join(execution, 'paper/main.tex'), 'Original manuscript');
  const thread = sourceStore.createResearchThread({ projectId: project.id, workspaceId: workspace.id, title: 'Research history', mode: 'work' });
  const task = sourceStore.saveTask({ prompt: 'Explain this result', response: 'Partial historical output', status: 'running' });
  const turn = sourceStore.startResearchTurn({ threadId: thread.id, taskId: task.id, prompt: 'Explain this result', mode: 'work' });
  sourceStore.createAction({ taskId: task.id, kind: 'command', payload: { command: 'must-not-resume', apiKey: 'configuration-secret' } });
  const receipt = results.savePackage({ id: 'saved-analysis', projectId: project.id, workspaceId: workspace.id, threadId: thread.id, executionRoot: execution, kind: 'analysis', title: 'Full data', manifest: { version: 1, config: { x: 0, y: 1 } }, files: [{ name: 'source.csv', role: 'source', encoding: 'utf8', content: 'expected,actual\n1,1.1\n' }, { name: 'chart.svg', role: 'output', encoding: 'utf8', content: '<svg>Saved chart</svg>' }] });
  sourceStore.registerProjectResult(receipt);
  sourceStore.linkResearchProjectToCloud(project.id, 'old-cloud-project');
  sourceStore.linkLibraryToCloud(library.id, 'old-cloud-library');
  sourceDb = new DatabaseSync(path.join(source, '.archimedes/archimedes.db'));
  targetDb = new DatabaseSync(path.join(target, '.archimedes/archimedes.db'));
  return { directory, source, target, exported, restored, execution, project, workspace, paper, thread, turn, sourceDb, targetDb, sourceStore, targetStore, options: { dataRoot: source, userId: 'local-user', destinationParent: exported, selection: { sourceFiles: [{ workspaceId: workspace.id, path: 'paper/main.tex' }] } } };
}

test('a real SQLite and disk package restores new local owners, source, PDFs, annotations, history and editable results', t => {
  const f = fixture(t);
  const preview = transfer.previewProject(f.sourceDb, f.project.id, f.options);
  assert.equal(preview.unavailable.length, 0);
  const exported = transfer.exportProject(f.sourceDb, f.project.id, f.options);
  const manifest = transfer.inspectPackage(exported.path);
  assert.equal(manifest.counts.project_results, 1);
  const recordsText = fs.readFileSync(path.join(exported.path, 'records.json'), 'utf8');
  assert.doesNotMatch(recordsText, /configuration-secret|old-cloud-project|old-cloud-library|resource_json|native_agent_bindings|agent_actions/);
  const imported = transfer.importProject(f.targetDb, exported.path, { dataRoot: f.target, userId: 'local-user', targetParent: f.restored });
  assert.notEqual(imported.projectId, f.project.id);
  assert.equal(fs.readFileSync(path.join(imported.workspacePath, 'paper/main.tex'), 'utf8'), 'Original manuscript');
  const project = f.targetStore.getResearchProject(imported.projectId);
  assert.equal(project.cloud_project_id, null);
  assert.deepEqual(f.targetStore.listCloudLibraryChanges(imported.projectId), []);
  const thread = f.targetDb.prepare('SELECT * FROM research_threads WHERE project_id=?').get(imported.projectId);
  assert.notEqual(thread.id, f.thread.id); assert.equal(thread.workspace_path, imported.workspacePath); assert.equal(thread.status, 'idle');
  assert.equal(f.targetDb.prepare('SELECT status FROM research_turns WHERE thread_id=?').get(thread.id).status, 'interrupted');
  assert.equal(f.targetDb.prepare('SELECT COUNT(*) AS n FROM agent_actions').get().n, 0);
  const paper = f.targetDb.prepare('SELECT * FROM papers WHERE title=?').get('A selected paper');
  assert.notEqual(paper.id, f.paper.id);
  assert.equal(f.targetStore.getPaperReader(paper.id).pages[0].text, 'Selected full text');
  assert.equal(fs.readFileSync(path.join(f.target, f.targetStore.getPaperReader(paper.id).asset.relative_path), 'utf8'), '%PDF-1.4 selected fixture');
  assert.equal(f.targetStore.listPaperHighlights(imported.projectId, paper.id)[0].note, 'Keep this note');
  const record = f.targetStore.listProjectResultRecords({ projectId: imported.projectId })[0];
  const detail = results.readPackage(record);
  assert.equal(detail.fileState, 'ready'); assert.equal(detail.threadId, thread.id); assert.notEqual(detail.id, 'saved-analysis');
  assert.equal(results.readPackageFile(record, 'source.csv').content, 'expected,actual\n1,1.1\n');
  results.savePackage({ ...detail, manifest: { ...detail.manifest, editedAfterRestore: true }, files: detail.files.map(file => ({ ...file, content: results.readPackageFile(record, file.name).content })) });
  assert.equal(results.readPackage(record).manifest.editedAfterRestore, true);
});

test('repeated restore creates another project/root and preserves existing names and files', t => {
  const f = fixture(t), exported = transfer.exportProject(f.sourceDb, f.project.id, f.options);
  const options = { dataRoot: f.target, userId: 'local-user', targetParent: f.restored };
  const first = transfer.importProject(f.targetDb, exported.path, options);
  fs.writeFileSync(path.join(first.workspacePath, 'paper/main.tex'), 'Keep my later edit');
  const second = transfer.importProject(f.targetDb, exported.path, options);
  assert.notEqual(second.projectId, first.projectId); assert.notEqual(second.workspacePath, first.workspacePath); assert.notEqual(second.name, first.name);
  assert.equal(fs.readFileSync(path.join(first.workspacePath, 'paper/main.tex'), 'utf8'), 'Keep my later edit');
  assert.equal(fs.readFileSync(path.join(second.workspacePath, 'paper/main.tex'), 'utf8'), 'Original manuscript');
});

test('missing linked resources are explicit and configuration files cannot be selected as manuscript source', t => {
  const f = fixture(t);
  fs.unlinkSync(path.join(f.source, `.archimedes/papers/${f.paper.id}.pdf`));
  const preview = transfer.previewProject(f.sourceDb, f.project.id, f.options);
  assert.equal(preview.unavailable[0].category, 'pdfs'); assert.match(preview.unavailable[0].reason, /ENOENT/);
  fs.writeFileSync(path.join(f.execution, '.env.local'), 'SECRET=not-exportable');
  assert.throws(() => transfer.previewProject(f.sourceDb, f.project.id, { ...f.options, selection: { sourceFiles: [{ workspaceId: f.workspace.id, path: '.env.local' }] } }), /credentials/);
});

test('corrupt file bytes and record hashes fail before creating a project or target directory', t => {
  const f = fixture(t), exported = transfer.exportProject(f.sourceDb, f.project.id, f.options);
  const manifest = transfer.inspectPackage(exported.path);
  const options = { dataRoot: f.target, userId: 'local-user', targetParent: f.restored };
  const before = f.targetDb.prepare('SELECT count(*) AS n FROM research_projects').get().n;
  const blob = path.join(exported.path, 'blobs', manifest.files[0].sha256), bytes = fs.readFileSync(blob);
  fs.writeFileSync(blob, 'corrupted resource');
  assert.throws(() => transfer.importProject(f.targetDb, exported.path, options), /resource hash/);
  fs.writeFileSync(blob, bytes);
  fs.appendFileSync(path.join(exported.path, 'records.json'), ' ');
  assert.throws(() => transfer.importProject(f.targetDb, exported.path, options), /records hash/);
  assert.equal(f.targetDb.prepare('SELECT count(*) AS n FROM research_projects').get().n, before);
  assert.deepEqual(fs.readdirSync(f.restored), []);
});

test('V01 history keeps snapshots and full local logs but cannot carry Docker/SSH cleanup ownership', t => {
  const f = fixture(t);
  const record = f.sourceStore.createReproduction({ projectId: f.project.id, workspaceId: f.workspace.id, paperId: f.paper.id, title: 'Historical experiment' });
  const { run, ownerToken } = f.sourceStore.startReproductionRun({ reproductionId: record.id, backend: 'docker' });
  const snapshot = require('./reproduction/run-snapshot.cjs').initialSnapshot(f.sourceStore.getReproduction(record.id), f.sourceStore, { backend: 'docker' });
  const logPath = `.archimedes/reproduction-logs/${run.id}/step.log`;
  fs.mkdirSync(path.dirname(path.join(f.source, logPath)), { recursive: true });
  fs.writeFileSync(path.join(f.source, logPath), 'Complete historical output\n');
  snapshot.runId = run.id;
  snapshot.prepared = { at: new Date().toISOString(), backend: 'docker', image: 'historical-image', checkout: { url: 'https://example.invalid/repo', branch: 'main', commit: 'a'.repeat(40), dirty: false, location: path.join(f.execution, 'original-checkout'), storage: 'local' } };
  snapshot.final = { planVersion: snapshot.plan.version, runbook: [], findings: [], steps: [], logs: [{ index: 1, command: 'old command', storage: 'local', path: logPath }], status: 'running', summary: 'Captured before interruption', finishedAt: null };
  f.sourceDb.prepare('UPDATE reproduction_runs SET resource_json=?, snapshot_json=?, log=? WHERE id=?').run(JSON.stringify({ owner: ownerToken, pid: 12345, container: 'never-clean-original', lease: 'old-lease', releasedAt: null }), JSON.stringify(snapshot), 'Historical tail', run.id);
  const exported = transfer.exportProject(f.sourceDb, f.project.id, f.options);
  const text = fs.readFileSync(path.join(exported.path, 'records.json'), 'utf8');
  assert.doesNotMatch(text, /never-clean-original|old-lease|resource_json|12345/);
  const imported = transfer.importProject(f.targetDb, exported.path, { dataRoot: f.target, userId: 'local-user', targetParent: f.restored });
  const restored = f.targetDb.prepare('SELECT * FROM reproductions WHERE project_id=?').get(imported.projectId);
  const restoredRun = f.targetDb.prepare('SELECT * FROM reproduction_runs WHERE reproduction_id=?').get(restored.id);
  assert.equal(restored.status, 'cancelled'); assert.equal(restoredRun.status, 'interrupted'); assert.equal(restoredRun.resource_json, '{}');
  assert.deepEqual(f.targetStore.listUnreleasedReproductionResources(), []);
  const receipt = JSON.parse(restoredRun.snapshot_json);
  assert.equal(receipt.runId, restoredRun.id); assert.equal(receipt.reproductionId, restored.id); assert.equal(receipt.owner.projectId, imported.projectId); assert.equal(receipt.owner.dataRoot, f.target);
  assert.equal(receipt.restoration.originalRunId, run.id); assert.equal(receipt.restoration.originalOwner.dataRoot, f.source);
  assert.equal(receipt.restoration.originalCheckout.location, path.join(f.execution, 'original-checkout'));
  assert.equal(receipt.prepared.checkout.location, null, 'historical commit is not claimed as executed in the restored folder');
  assert.equal(fs.readFileSync(path.join(f.target, receipt.final.logs[0].path), 'utf8'), 'Complete historical output\n');
  assert.equal(f.sourceDb.prepare('SELECT resource_json FROM reproduction_runs WHERE id=?').get(run.id).resource_json.includes('never-clean-original'), true);
});

test('owned review runs retain PDF/log/manifest with new return owners, while unrelated or legacy owners are explicit', async t => {
  const f = fixture(t), reviewStore = require('./paper-review-store.cjs');
  t.after(() => reviewStore.close());
  const sourceReview = path.join(f.directory, 'source-review'), targetReview = path.join(f.directory, 'target-review');
  fs.mkdirSync(sourceReview); fs.mkdirSync(targetReview);
  const { EventEmitter } = require('node:events');
  const compiled = await require('./latex-workspace.cjs').compileLatexDocument(f.execution, 'paper/main.tex', { executable: 'tectonic', spawnImpl: (_command, args) => {
    const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = () => {};
    process.nextTick(() => { fs.writeFileSync(path.join(args[args.indexOf('--outdir') + 1], 'main.pdf'), '%PDF-controlled review input'); child.stdout.emit('data', 'Controlled compiler log'); child.emit('close', 0); }); return child;
  } });
  reviewStore.initialize(sourceReview);
  reviewStore.saveDocument({ id: 'review-document', sourceKind: 'pdf', sourceRef: 'main.pdf', title: 'Current manuscript', pageCount: 1, pages: [{ page: 1, text: 'Review text' }] });
  const origin = { workspace: f.execution, projectId: f.project.id, workspaceId: f.workspace.id, dataRoot: f.source, threadId: f.thread.id, mainPath: 'paper/main.tex', selectedPath: 'paper/main.tex', manifestPath: compiled.source_snapshot.manifest_path, pdfPath: compiled.pdf_path, pdfSha256: compiled.source_snapshot.pdf.sha256, sourceVersion: compiled.source_snapshot.requested_source.source_version, buildId: compiled.source_snapshot.build_id };
  const runId = reviewStore.createRun({ documentId: 'review-document', projectId: f.project.id, paperTitle: 'Owned review', ownerDataRoot: f.source, manuscript: origin });
  reviewStore.createRun({ documentId: 'review-document', projectId: f.project.id, paperTitle: 'Other data root review', ownerDataRoot: f.target });
  reviewStore.createRun({ documentId: 'review-document', projectId: f.project.id, paperTitle: 'Legacy unknown owner' });
  reviewStore.finishRun(runId, { result: { review: { summary: 'Keep review feedback', strengths: [{ text: 'Clear claim', page: 1 }], subdimensions: [] } } });
  reviewStore.close(); reviewStore.initialize(targetReview); reviewStore.close();
  const exported = transfer.exportProject(f.sourceDb, f.project.id, { ...f.options, reviewDbPath: path.join(sourceReview, 'paper-review.sqlite') });
  assert.equal(exported.counts.review_runs, 1); assert.equal(exported.unavailable.some(file => /Legacy report/.test(file.reason)), true);
  const imported = transfer.importProject(f.targetDb, exported.path, { dataRoot: f.target, userId: 'local-user', targetParent: f.restored, reviewDbPath: path.join(targetReview, 'paper-review.sqlite') });
  const db = new DatabaseSync(path.join(targetReview, 'paper-review.sqlite')); t.after(() => db.close());
  const run = db.prepare('SELECT * FROM paper_review_runs').get(), restoredOrigin = JSON.parse(run.manuscript_json);
  assert.notEqual(run.id, runId); assert.equal(run.project_id, imported.projectId); assert.equal(run.owner_data_root, f.target);
  assert.equal(restoredOrigin.workspace, imported.workspacePath); assert.equal(restoredOrigin.projectId, imported.projectId);
  const checked = require('./manuscript-snapshot.cjs').readManuscriptSnapshot(restoredOrigin.workspace, restoredOrigin.manifestPath);
  assert.equal(checked.current, true); assert.equal(checked.pdf.sha256, origin.pdfSha256);
  const references = JSON.parse(fs.readFileSync(path.join(path.dirname(path.join(restoredOrigin.workspace, restoredOrigin.manifestPath)), 'retained-inputs.json')));
  assert.equal(references[0].run_id, run.id);
  assert.equal(db.prepare('SELECT count(*) AS n FROM paper_review_findings WHERE run_id=?').get(run.id).n, 1);
});

test('a database constraint failure rolls back imported records and only newly created files', t => {
  const f = fixture(t), exported = transfer.exportProject(f.sourceDb, f.project.id, f.options);
  const file = path.join(exported.path, 'records.json'), records = JSON.parse(fs.readFileSync(file));
  records.library_papers[0].paper_id = 'missing-paper-reference';
  const bytes = Buffer.from(JSON.stringify(records)); fs.writeFileSync(file, bytes);
  const manifestFile = path.join(exported.path, 'manifest.json'), manifest = JSON.parse(fs.readFileSync(manifestFile));
  manifest.recordsSha256 = createHash('sha256').update(bytes).digest('hex'); fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  const before = f.targetDb.prepare('SELECT count(*) AS n FROM research_projects').get().n;
  fs.mkdirSync(path.join(f.target, '.archimedes/papers'), { recursive: true });
  fs.writeFileSync(path.join(f.target, '.archimedes/papers/keep.pdf'), 'Existing user file');
  assert.throws(() => transfer.importProject(f.targetDb, exported.path, { dataRoot: f.target, userId: 'local-user', targetParent: f.restored }), /FOREIGN KEY/);
  assert.equal(f.targetDb.prepare('SELECT count(*) AS n FROM research_projects').get().n, before);
  assert.deepEqual(fs.readdirSync(f.restored), []);
  assert.equal(fs.readFileSync(path.join(f.target, '.archimedes/papers/keep.pdf'), 'utf8'), 'Existing user file');
});

test('a historical session root remains selectable and usable after the project default root changes', t => {
  const f = fixture(t), nextRoot = path.join(f.directory, 'new-default'); fs.mkdirSync(nextRoot);
  f.sourceDb.prepare('DELETE FROM research_artifacts WHERE project_id=?').run(f.project.id);
  f.sourceDb.prepare('DELETE FROM project_results WHERE project_id=?').run(f.project.id);
  f.sourceDb.prepare('UPDATE project_workspaces SET root=? WHERE id=?').run(nextRoot, f.workspace.id);
  f.sourceDb.prepare('UPDATE research_projects SET workspace_path=? WHERE id=?').run(nextRoot, f.project.id);
  assert.equal(f.sourceStore.getResearchThread(f.thread.id).workspace_path, f.execution);
  const options = { ...f.options, selection: { sourceFiles: [{ workspaceId: f.workspace.id, threadId: f.thread.id, path: 'paper/main.tex' }] } };
  const preview = transfer.previewProject(f.sourceDb, f.project.id, options);
  assert.equal(preview.sourceRoots.some(root => root.threadId === f.thread.id && root.root === f.execution), true);
  const exported = transfer.exportProject(f.sourceDb, f.project.id, options);
  const imported = transfer.importProject(f.targetDb, exported.path, { dataRoot: f.target, userId: 'local-user', targetParent: f.restored });
  const restoredThread = f.targetStore.listResearchThreads({ projectId: imported.projectId })[0];
  const root = f.targetStore.getResearchThread(restoredThread.id).workspace_path;
  assert.notEqual(root, imported.workspacePath); assert.equal(fs.statSync(root).isDirectory(), true);
  assert.equal(require('./latex-workspace.cjs').listLatexProjects(root)[0].path, 'paper/main.tex');
  require('./workspace-files.cjs').writeWorkspaceTextFile(root, 'paper/main.tex', 'Continue the restored manuscript');
  assert.equal(fs.readFileSync(path.join(root, 'paper/main.tex'), 'utf8'), 'Continue the restored manuscript');
  assert.equal(fs.readFileSync(path.join(f.execution, 'paper/main.tex'), 'utf8'), 'Original manuscript');
});

test('a persisted directory alias and its default root restore to the same usable source directory', t => {
  const f = fixture(t), alias = path.join(f.directory, 'execution-alias');
  fs.symlinkSync(f.execution, alias, process.platform === 'win32' ? 'junction' : 'dir');
  f.sourceDb.prepare('UPDATE research_threads SET workspace_path=? WHERE id=?').run(alias, f.thread.id);
  const exported = transfer.exportProject(f.sourceDb, f.project.id, f.options);
  const imported = transfer.importProject(f.targetDb, exported.path, { dataRoot: f.target, userId: 'local-user', targetParent: f.restored });
  const thread = f.targetStore.listResearchThreads({ projectId: imported.projectId })[0];
  assert.equal(thread.workspace_path, imported.workspacePath);
  assert.equal(fs.readFileSync(path.join(thread.workspace_path, 'paper/main.tex'), 'utf8'), 'Original manuscript');
});

test('results can be restored without their optional conversation', t => {
  const f = fixture(t), exported = transfer.exportProject(f.sourceDb, f.project.id, { ...f.options, selection: { conversations: false } });
  const imported = transfer.importProject(f.targetDb, exported.path, { dataRoot: f.target, userId: 'local-user', targetParent: f.restored });
  const result = f.targetStore.listProjectResultRecords({ projectId: imported.projectId })[0];
  assert.equal(result.threadId, null);
  assert.equal(results.readPackage(result).fileState, 'ready');
});

test('changed or missing research resources do not acquire a false ready receipt on restore', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.source, `.archimedes/papers/${f.paper.id}.pdf`), '%PDF-different from indexed text');
  fs.writeFileSync(path.join(f.execution, 'research-results/analysis/saved-analysis/source.csv'), 'externally edited data');
  fs.unlinkSync(path.join(f.execution, 'research-results/analysis/saved-analysis/chart.svg'));
  const exported = transfer.exportProject(f.sourceDb, f.project.id, f.options);
  assert.equal(exported.unavailable.some(file => /changed since its text/.test(file.reason)), true);
  const imported = transfer.importProject(f.targetDb, exported.path, { dataRoot: f.target, userId: 'local-user', targetParent: f.restored });
  const result = f.targetStore.listProjectResultRecords({ projectId: imported.projectId })[0], detail = results.readPackage(result);
  assert.equal(detail.fileState, 'missing');
  assert.deepEqual(detail.changedFiles, ['source.csv']); assert.deepEqual(detail.missingFiles, ['chart.svg']);
  const paper = f.targetDb.prepare('SELECT id FROM papers WHERE title=?').get('A selected paper');
  assert.equal(f.targetStore.getPaperReader(paper.id).asset.status, 'failed');
});

test('actual preload/IPC capture the source data owner across a destination chooser and reject another project root', async t => {
  const f = fixture(t), vm = require('node:vm'), handlers = new Map();
  const { createWorkspaceIpc } = require('./workspace-context.cjs');
  const { registerProjectTransferCommands } = require('./project-transfer-commands.cjs');
  let selectedRoot = f.source, choose;
  const parent = { id: 'source-window' }, chosenParents = [];
  const ipc = createWorkspaceIpc({ ipcMain: { handle: (name, handler) => handlers.set(name, handler) }, store, workspaceForEvent: () => selectedRoot });
  registerProjectTransferCommands({ ipcMain: ipc, store, BrowserWindow: { fromWebContents: sender => { assert.equal(sender.id, 1); return parent; } }, dialog: { showOpenDialog: (window, options) => { chosenParents.push(window); assert.ok(options.title); return new Promise(resolve => { choose = resolve; }); } } });
  let bridge;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'preload.cjs'), 'utf8'), { process, require(name) {
    assert.equal(name, 'electron');
    return { contextBridge: { exposeInMainWorld: (_name, value) => { bridge = value; } }, ipcRenderer: { invoke: (name, input) => Promise.resolve().then(() => handlers.get(name)({ sender: { id: 1 } }, input)) } };
  } });
  const pending = bridge.exportProjectPackage(f.project.id, f.options.selection);
  await new Promise(resolve => setImmediate(resolve));
  selectedRoot = f.target;
  choose({ canceled: false, filePaths: [f.exported] });
  const receipt = await pending;
  assert.equal(receipt.package.name, f.project.name);
  assert.equal(transfer.inspectPackage(receipt.package.path).projectId, f.project.id);
  await assert.rejects(bridge.previewProjectPackage(f.project.id, f.options.selection), /access/);
  selectedRoot = f.source;
  const sources = bridge.chooseProjectTransferSources(f.project.id, 'files');
  await new Promise(resolve => setImmediate(resolve));
  choose({ canceled: false, filePaths: [path.join(f.execution, 'paper/main.tex')] });
  const selected = await sources;
  assert.equal(selected.files[0].workspaceId, f.workspace.id);
  assert.equal(selected.files[0].path, 'paper/main.tex');
  assert.deepEqual(chosenParents, [parent, parent]);
});

test('serialized Windows drive and UNC source roots restore on the host without interpreting them as host paths', t => {
  const f = fixture(t), exported = transfer.exportProject(f.sourceDb, f.project.id, f.options);
  const originalManifest = JSON.parse(fs.readFileSync(path.join(exported.path, 'manifest.json'))), originalRecords = JSON.parse(fs.readFileSync(path.join(exported.path, 'records.json')));
  for (const prefix of ['C:\\Research\\Fixture', '\\\\research-server\\Shared\\Fixture']) {
    const roots = originalManifest.roots.map((root, index) => ({ ...root, original: `${prefix}\\Root${index}` }));
    const map = new Map(originalManifest.roots.map((root, index) => [root.original, roots[index].original]));
    const rewrite = value => {
      if (Array.isArray(value)) return value.map(rewrite);
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, key.endsWith('_json') && typeof child === 'string' ? JSON.stringify(rewrite(JSON.parse(child))) : rewrite(child)]));
      if (typeof value === 'string') for (const [old, target] of map) if (value === old || value.startsWith(`${old}/`)) return target + value.slice(old.length).replaceAll('/', '\\');
      return value;
    };
    const records = rewrite(originalRecords), bytes = Buffer.from(JSON.stringify(records));
    const manifest = { ...originalManifest, sourcePlatform: 'win32', roots, recordsSha256: createHash('sha256').update(bytes).digest('hex') };
    fs.writeFileSync(path.join(exported.path, 'records.json'), bytes); fs.writeFileSync(path.join(exported.path, 'manifest.json'), JSON.stringify(manifest));
    assert.equal(transfer.inspectPackage(exported.path).sourcePlatform, 'win32');
    const imported = transfer.importProject(f.targetDb, exported.path, { dataRoot: f.target, userId: 'local-user', targetParent: f.restored });
    const thread = f.targetStore.listResearchThreads({ projectId: imported.projectId })[0];
    assert.equal(thread.workspace_path, imported.workspacePath);
    assert.equal(fs.readFileSync(path.join(thread.workspace_path, 'paper/main.tex'), 'utf8'), 'Original manuscript');
    const result = f.targetStore.listProjectResultRecords({ projectId: imported.projectId })[0];
    assert.equal(results.readPackage(result).fileState, 'ready');
    assert.equal(result.executionRoot, imported.workspacePath);
  }
});

test('a conversation based on a standalone historical result restores its FK after the result, or clears it when omitted', t => {
  const f = fixture(t);
  const standalone = results.savePackage({ id: 'standalone-result', projectId: f.project.id, workspaceId: f.workspace.id, executionRoot: f.execution, threadId: null, kind: 'analysis', title: 'Standalone saved data', manifest: { config: { x: 0, y: 1 } }, files: [{ name: 'source.csv', role: 'source', encoding: 'utf8', content: 'x,y\n1,2\n' }] });
  f.sourceStore.registerProjectResult(standalone);
  const nextRoot = path.join(f.directory, 'later-default'); fs.mkdirSync(nextRoot);
  f.sourceDb.prepare('UPDATE project_workspaces SET root=? WHERE id=?').run(nextRoot, f.workspace.id);
  const thread = f.sourceStore.createResearchThread({ projectId: f.project.id, basedOnResultId: standalone.id, title: 'Continue standalone data', mode: 'work' });
  assert.equal(thread.workspace_path, f.execution);
  for (const includeResults of [true, false]) {
    const exported = transfer.exportProject(f.sourceDb, f.project.id, { ...f.options, selection: { results: includeResults } });
    const imported = transfer.importProject(f.targetDb, exported.path, { dataRoot: f.target, userId: 'local-user', targetParent: f.restored });
    const restored = f.targetDb.prepare('SELECT * FROM research_threads WHERE project_id=? AND title=?').get(imported.projectId, thread.title);
    if (includeResults) {
      const result = f.targetDb.prepare('SELECT * FROM project_results WHERE id=?').get(restored.based_on_result_id);
      assert.notEqual(result.id, standalone.id); assert.equal(result.thread_id, null); assert.equal(result.execution_root, restored.workspace_path);
    } else assert.equal(restored.based_on_result_id, null);
  }
});

test('numerical source/report files migrate with new run owners and an explicit stale historical run attachment', async t => {
  const f = fixture(t), metrics = require('./metric-comparison.cjs');
  const record = f.sourceStore.createReproduction({ projectId: f.project.id, workspaceId: f.workspace.id, title: 'Numerical run' });
  const run = f.sourceStore.createReproductionRun({ reproductionId: record.id, backend: 'docker' });
  const snapshot = require('./reproduction/run-snapshot.cjs').initialSnapshot(record, f.sourceStore, { backend: 'docker' });
  f.sourceDb.prepare('UPDATE reproduction_runs SET snapshot_json=? WHERE id=?').run(JSON.stringify(snapshot), run.id);
  const owner = { dataRoot: f.source, projectId: f.project.id, workspaceId: f.workspace.id, executionRoot: f.execution, reproductionId: record.id, runId: run.id };
  const saved = await metrics.saveComparison({ owner, runSnapshot: snapshot, title: 'Explicit numeric claim', sourceName: 'metrics.csv', sourceBytes: Buffer.from('expected,actual\n0.8,0.81\n'), mapping: { expectedColumn: 'expected', actualColumn: 'actual', unitValue: 'ratio', datasetValue: 'test', absoluteTolerance: 0.02 } });
  const exported = transfer.exportProject(f.sourceDb, f.project.id, f.options);
  assert.equal(exported.counts.metric_comparisons, 1);
  const imported = transfer.importProject(f.targetDb, exported.path, { dataRoot: f.target, userId: 'local-user', targetParent: f.restored });
  const restoredRecord = f.targetDb.prepare('SELECT * FROM reproductions WHERE project_id=?').get(imported.projectId), restoredRun = f.targetStore.listReproductionRuns(restoredRecord.id)[0];
  const restoredOwner = { dataRoot: f.target, projectId: imported.projectId, workspaceId: restoredRecord.workspace_id, executionRoot: restoredRecord.execution_root, reproductionId: restoredRecord.id, runId: restoredRun.id };
  const listed = metrics.listComparisons(restoredOwner, restoredRun.snapshot);
  assert.equal(listed.length, 1); assert.notEqual(listed[0].id, saved.id); assert.equal(listed[0].state, 'stale');
  const detail = metrics.getComparison(restoredOwner, listed[0].id, restoredRun.snapshot);
  assert.equal(detail.sourceState, 'ready'); assert.equal(detail.counts.within, 1); assert.equal(detail.rows[0].actual, '0.81');
  assert.equal(detail.restoration.originalComparisonId, saved.id);
  assert.equal(fs.readFileSync(path.join(f.target, detail.source.path), 'utf8'), 'expected,actual\n0.8,0.81\n');
});
