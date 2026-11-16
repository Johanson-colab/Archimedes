const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { DatabaseSync } = require('node:sqlite');
const metrics = require('./metric-comparison.cjs');
const store = require('./store.cjs');
const mapping = { metricColumn: 'metric', expectedColumn: 'expected', actualColumn: 'actual', unitColumn: 'unit', actualUnitColumn: 'actual_unit', datasetColumn: 'dataset', actualDatasetColumn: 'actual_dataset', toleranceColumn: 'tolerance', absoluteTolerance: 0 };
const csv = 'metric,expected,actual,unit,actual_unit,dataset,actual_dataset,tolerance\nexact,0,0,ratio,ratio,test,test,0\nboundary,0.1,0.4,ratio,ratio,test,test,0.3\noutside,1,1.2,ratio,ratio,test,test,0.1\nmissing,1,,ratio,ratio,test,test,0.1\ntext,1,unknown,ratio,ratio,test,test,0.1\nunits,1,1000,s,ms,test,test,0.1\ndatasets,1,1,ratio,ratio,train,test,0.1\ntolerance,1,1,ratio,ratio,test,test,-1\n';

function fixture(t) {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'archimedes-metrics-'))), dataRoot = path.join(directory, 'data'), executionRoot = path.join(directory, 'execution');
  fs.mkdirSync(dataRoot); fs.mkdirSync(executionRoot);
  const owner = store.createWorkspaceStore(dataRoot);
  const project = owner.createResearchProject({ name: 'Numerical checks', workspacePath: executionRoot }), workspace = owner.defaultProjectWorkspace(project.id);
  const record = owner.createReproduction({ projectId: project.id, workspaceId: workspace.id, title: 'Recorded experiment' });
  const run = owner.createReproductionRun({ reproductionId: record.id, backend: 'docker' });
  const snapshot = require('./reproduction/run-snapshot.cjs').initialSnapshot(record, owner, { backend: 'docker' });
  const db = new DatabaseSync(path.join(dataRoot, '.archimedes/archimedes.db'));
  db.prepare('UPDATE reproduction_runs SET snapshot_json=? WHERE id=?').run(JSON.stringify(snapshot), run.id);
  t.after(() => { db.close(); store.closeAllWorkspaces(); fs.rmSync(directory, { recursive: true, force: true }); });
  const scope = { dataRoot, projectId: project.id, workspaceId: workspace.id, executionRoot, reproductionId: record.id, runId: run.id };
  return { directory, dataRoot, executionRoot, owner, record, run, snapshot, db, scope };
}

test('CSV/JSON comparisons distinguish missing, incomparable, within and outside with explicit units/datasets/tolerance', async () => {
  const table = await metrics.parseInput('metrics.csv', Buffer.from(csv)), result = metrics.compare(table, mapping);
  assert.deepEqual(result.rows.map(row => row.status), ['within', 'within', 'outside', 'missing', 'incomparable', 'incomparable', 'incomparable', 'incomparable']);
  assert.deepEqual(result.counts, { missing: 1, incomparable: 4, within: 2, outside: 1 });
  assert.match(result.rows[5].reason, /no conversion/);
  assert.equal(result.rows[2].expected, '1'); assert.equal(result.rows[2].actual, '1.2');
  const json = await metrics.parseInput('metrics.json', Buffer.from(JSON.stringify([{ metric: 'small', expected: 0, actual: 1e-17 }, { metric: 'missing', expected: 2, actual: null }])));
  const checked = metrics.compare(json, { expectedColumn: 'expected', actualColumn: 'actual', metricColumn: 'metric', unitValue: 'ratio', datasetValue: 'confirmed test dataset', absoluteTolerance: 0 });
  assert.equal(checked.rows[0].status, 'outside', 'zero tolerance remains exact even for small values');
  assert.equal(checked.rows[1].status, 'missing');
  assert.equal(metrics.compare(json, { expectedColumn: 'expected', actualColumn: 'actual', absoluteTolerance: 1 }).rows[0].status, 'incomparable', 'missing unit/dataset is not guessed');
});

test('ambiguous or unsupported inputs and mappings fail rather than choosing a column or flattening records', async () => {
  await assert.rejects(metrics.parseInput('a.csv', Buffer.from('value,value\n1,2')), /unique/);
  await assert.rejects(metrics.parseInput('a.json', Buffer.from('[{"expected":{"nested":1},"actual":2}]')), /scalar/);
  await assert.rejects(metrics.parseInput('a.json', Buffer.from('{"expected":1}')), /array/);
  await assert.rejects(metrics.parseInput('a.csv', Buffer.alloc(metrics.MAX_INPUT_BYTES + 1)), /2 MiB/);
  const table = await metrics.parseInput('a.csv', Buffer.from('expected,actual\n1,1'));
  assert.throws(() => metrics.compare(table, { expectedColumn: 'expected', actualColumn: 'expected', absoluteTolerance: 0 }), /separate/);
  assert.throws(() => metrics.compare(table, { expectedColumn: 'expected', actualColumn: 'actual', absoluteTolerance: -1 }), /nonnegative/);
  assert.throws(() => metrics.compare(table, { expectedColumn: 'unknown', actualColumn: 'actual', absoluteTolerance: 0 }), /not present/);
});

test('decimal/scientific source and tolerance text decide exact boundaries without binary rounding or hidden slack', async () => {
  const fixed = { expectedColumn: 'expected', actualColumn: 'actual', unitValue: 'ratio', datasetValue: 'test', absoluteTolerance: '1' };
  const big = await metrics.parseInput('big.csv', Buffer.from('expected,actual\n10000000000000000,10000000000000002\n'));
  const outside = metrics.compare(big, fixed).rows[0];
  assert.equal(outside.status, 'outside'); assert.equal(outside.difference, '2');
  const preciseJson = await metrics.parseInput('precise.json', Buffer.from('[{"expected":1,"actual":1.0000000000000001},{"expected":7e-1,"actual":8e-1}]'));
  assert.equal(preciseJson.rows[0][1], '1.0000000000000001', 'JSON numeric literal is not rounded by JSON.parse');
  const exact = metrics.compare(preciseJson, { ...fixed, absoluteTolerance: '0' });
  assert.equal(exact.rows[0].status, 'outside'); assert.equal(exact.rows[0].difference, '1e-16');
  assert.equal(metrics.compare(preciseJson, { ...fixed, absoluteTolerance: '0.1' }).rows[1].status, 'within');
  const threshold = await metrics.parseInput('threshold.csv', Buffer.from('expected,actual\n0,10000000000000001\n'));
  assert.equal(metrics.compare(threshold, { ...fixed, absoluteTolerance: '10000000000000001' }).rows[0].status, 'within');
  const unsupported = await metrics.parseInput('extreme.csv', Buffer.from('expected,actual\n1e1001,1e1001\n'));
  assert.equal(metrics.compare(unsupported, fixed).rows[0].status, 'incomparable');
  await assert.rejects(metrics.parseInput('invalid.json', Buffer.from('[{"expected":01,"actual":1}]')), SyntaxError, 'preserving numeric text must not accept invalid JSON syntax');
});

test('a saved report reopens with source/run fingerprints, while changes remain visible as stale history', async t => {
  const f = fixture(t);
  const saved = await metrics.saveComparison({ owner: f.scope, runSnapshot: f.snapshot, sourceName: 'metrics.csv', sourceBytes: Buffer.from(csv), title: 'Table 2 numerical checks', mapping });
  assert.equal(saved.source.origin, 'user-selected-file'); assert.match(saved.coverage, /does not establish/);
  assert.equal(metrics.getComparison(f.scope, saved.id, f.snapshot).state, 'recorded');
  const list = metrics.listComparisons(f.scope, f.snapshot);
  assert.equal(list.length, 1); assert.equal('rows' in list[0], false, 'history listing does not send every result row');
  const finalSnapshot = { ...f.snapshot, final: { status: 'verified' } };
  const changedRun = metrics.getComparison(f.scope, saved.id, finalSnapshot);
  assert.equal(changedRun.state, 'stale'); assert.equal(changedRun.runSnapshotMatches, false); assert.equal(changedRun.rows.length, 8);
  fs.appendFileSync(path.join(f.dataRoot, saved.source.path), 'external change');
  assert.equal(metrics.getComparison(f.scope, saved.id, finalSnapshot).sourceState, 'changed');
  assert.equal(metrics.listComparisons({ ...f.scope, runId: 'another-run' }, f.snapshot).length, 0);
  assert.throws(() => metrics.getComparison({ ...f.scope, projectId: 'another-project' }, saved.id, f.snapshot), /does not belong/);
  const file = path.join(f.dataRoot, saved.manifestPath), receipt = JSON.parse(fs.readFileSync(file)); receipt.rows[2].status = 'within'; fs.writeFileSync(file, JSON.stringify(receipt));
  assert.equal(metrics.getComparison(f.scope, saved.id, f.snapshot).reasons.some(reason => /values or mapping/.test(reason)), true);
});

test('actual IPC freezes chosen bytes, rejects cross-run tokens and binds saved numbers to the real current run', async t => {
  const f = fixture(t), vm = require('node:vm'), handlers = new Map();
  const { registerMetricComparisonCommands } = require('./metric-comparison-commands.cjs');
  const { createWorkspaceIpc } = require('./workspace-context.cjs');
  let choose;
  const parent = { id: 'comparison-window' };
  const ipc = createWorkspaceIpc({ ipcMain: { handle: (name, callback) => handlers.set(name, callback) }, store, workspaceForEvent: () => f.dataRoot });
  registerMetricComparisonCommands({ ipcMain: ipc, store, BrowserWindow: { fromWebContents: sender => { assert.equal(sender.id, 11); return parent; } }, dialog: { showOpenDialog: (window, options) => { assert.equal(window, parent); assert.equal(options.defaultPath, f.executionRoot); return new Promise(resolve => { choose = resolve; }); } } });
  const sourcePath = path.join(f.executionRoot, 'metrics.csv'); fs.writeFileSync(sourcePath, csv);
  let bridge;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'preload.cjs'), 'utf8'), { process, require(name) { assert.equal(name, 'electron'); return { contextBridge: { exposeInMainWorld: (_name, value) => { bridge = value; } }, ipcRenderer: { invoke: (name, input) => Promise.resolve().then(() => handlers.get(name)({ sender: { id: 11 } }, input)) } }; } });
  const invoke = (channel, input) => handlers.get(channel)({ sender: { id: 11 } }, input);
  const context = { reproductionId: f.record.id, runId: f.run.id };
  assert.equal(typeof bridge.chooseMetricComparisonInput, 'function');
  const loading = bridge.chooseMetricComparisonInput(context);
  await new Promise(resolve => setImmediate(resolve)); choose({ canceled: false, filePaths: [sourcePath] });
  const selected = await loading;
  fs.writeFileSync(sourcePath, 'changed after choosing');
  const other = f.owner.createReproductionRun({ reproductionId: f.record.id, backend: 'docker' });
  await assert.rejects(invoke('metric-comparison:save', { ...context, runId: other.id, inputToken: selected.input.token, title: 'Wrong run', mapping }), /for this project and run/);
  const input = { ...context, inputToken: selected.input.token, title: 'Confirmed mapping', mapping };
  const saved = await bridge.saveMetricComparison(input);
  assert.equal(fs.readFileSync(path.join(f.dataRoot, saved.source.path), 'utf8'), csv, 'source bytes are the snapshot shown in the chooser preview');
  assert.equal(saved.runSnapshotSha256, metrics.snapshotHash(f.owner.getReproductionRun(f.run.id).snapshot));
  assert.equal(saved.counts.within, 2);
  assert.equal((await bridge.listMetricComparisons(context)).length, 1);
  assert.equal((await bridge.getMetricComparison({ ...context, comparisonId: saved.id })).rows.length, 8);
});
