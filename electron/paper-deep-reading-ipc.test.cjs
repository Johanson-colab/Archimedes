const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');
const test = require('node:test');
const { report } = require('./test-support/deep-reading.cjs');
const { renderReport, markdown } = require('./paper-deep-reading-render.cjs');
const workspaceFiles = require('./workspace-files.cjs');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-reading-ipc-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const reading = report(root); fs.writeFileSync(path.join(root, 'source.pdf'), '%PDF');
  const handlers = new Map(), runs = new Map(); const source = fs.readFileSync(path.join(__dirname, 'main.cjs'), 'utf8');
  const chunk = source.slice(source.indexOf('  ipcMain.handle("paper-review:run"'), source.indexOf('  ipcMain.handle("project:list-members"'));
  let saved = { reading }, calls = 0, allowed = true, pick = { canceled: true, filePaths: [] };
  let generate = async () => ({ reading, summary: { response: 'Complete' } });
  const store = { openWorkspace: value => assert.equal(value, root), getPaper: () => ({ id: 'paper', title: 'Canonical title' }), canAccessProject: () => allowed, getPaperReader: () => ({ asset: { status: 'ready', relative_path: 'source.pdf' } }), savePaperReview: (_id, value) => { saved = value; }, getPaperReview: () => saved };
  const build = new Function('ipcMain', 'workspaceForWindow', 'BrowserWindow', 'resolveWorkspace', 'store', 'modelConfig', 'generateDeepReading', 'renderDeepReading', 'deepReadingMarkdown', 'deepReadingRuns', 'workspaceFiles', 'dialog', 'randomUUID', 'path', 'fs', chunk);
  build({ handle: (channel, fn) => handlers.set(channel, fn) }, () => root, { fromWebContents: () => ({}) }, () => { throw Error('Should use window workspace'); }, store, { getActiveModelConfig: () => ({ apiKey: 'test' }) }, args => { calls++; return generate(args); }, renderReport, markdown, runs, workspaceFiles, { showOpenDialog: async () => pick }, randomUUID, path, fs);
  const sender = new EventEmitter(); Object.assign(sender, { id: 1, isDestroyed: () => false, send: () => {} });
  return { root, reading, event: { sender }, handlers, runs, get saved() { return saved; }, get calls() { return calls; }, setGenerate: fn => { generate = fn; }, setAllowed: value => { allowed = value; }, setPick: value => { pick = value; } };
}
test('generation uses the window workspace and canonical paper, then saves a renderable report', async t => {
  const f = fixture(t); f.setGenerate(async args => { assert.equal(args.workspace, f.root); assert.equal(args.paper.title, 'Canonical title'); return { reading: f.reading, summary: { response: 'Complete' } }; });
  const result = await f.handlers.get('paper-review:run')(f.event, { paper: { id: 'paper', title: 'Untrusted title' }, workspace: '/wrong', projectId: 'project', clientRunId: 'run' });
  assert.match(result.readingHtml, /data:image\/jpeg/); assert.equal(f.saved.reading.title.en, f.reading.title.en); assert.equal(f.runs.size, 0);
});
test('cancel is sender-scoped and failed regeneration preserves the previous report', async t => {
  const f = fixture(t), previous = f.saved; let started;
  const ready = new Promise(r => { started = r; });
  f.setGenerate(({ signal }) => new Promise((_resolve, reject) => { started(); signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }); }));
  const promise = f.handlers.get('paper-review:run')(f.event, { paper: { id: 'paper' }, projectId: 'project', clientRunId: 'run' }); await ready;
  await assert.rejects(f.handlers.get('paper-review:run')(f.event, { paper: { id: 'paper' }, projectId: 'project' }), /already/);
  assert.equal(f.handlers.get('paper-deep-reading:cancel')({ sender: { id: 2 } }, { clientRunId: 'run' }).cancelled, false);
  assert.equal(f.handlers.get('paper-deep-reading:cancel')(f.event, { clientRunId: 'run' }).cancelled, true);
  await assert.rejects(promise, /cancelled/); assert.equal(f.saved, previous); assert.equal(f.runs.size, 0);
  f.setAllowed(false); await assert.rejects(f.handlers.get('paper-review:run')(f.event, { paper: { id: 'paper' }, projectId: 'project' }), /permission/); assert.equal(f.calls, 1);
});
test('export cancellation writes nothing; successful export contains offline HTML, both Markdown files and images', async t => {
  const f = fixture(t), exports = path.join(f.root, 'exports'); fs.mkdirSync(exports);
  assert.equal((await f.handlers.get('paper-deep-reading:export')(f.event, { paperId: 'paper', projectId: 'project' })).saved, false);
  assert.deepEqual(fs.readdirSync(exports), []);
  f.setPick({ canceled: false, filePaths: [exports] });
  const result = await f.handlers.get('paper-deep-reading:export')(f.event, { paperId: 'paper', projectId: 'project' });
  for (const name of ['paper_report.html', 'paper_report.zh.md', 'paper_report.en.md', 'report.json']) assert.ok(fs.existsSync(path.join(result.path, name)));
  assert.equal(fs.readdirSync(path.join(result.path, 'assets')).length, 1);
  assert.match(fs.readFileSync(path.join(result.path, 'paper_report.html'), 'utf8'), /data:image\/jpeg/);
});
