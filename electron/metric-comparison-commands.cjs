const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const metrics = require('./metric-comparison.cjs');

function registerMetricComparisonCommands({ ipcMain, store, dialog, BrowserWindow }) {
  const inputs = new Map(), watched = new Set();
  const context = (input, write = false) => {
    const storeOwner = store.currentStore(), record = storeOwner.getReproduction(input.reproductionId);
    if (!record?.project_id || !record.workspace_id || !record.execution_root) throw new Error('Bind this reproduction to a project workspace before comparing numbers.');
    if (!storeOwner.canAccessProject(record.project_id, write ? 'editor' : 'viewer')) throw new Error('You do not have permission to compare numbers in this project.');
    const run = storeOwner.getReproductionRun(input.runId);
    if (!run || run.reproduction_id !== record.id) throw new Error('Choose a recorded run from this reproduction.');
    return { record, run, owner: { dataRoot: storeOwner.workspace, projectId: record.project_id, workspaceId: record.workspace_id, executionRoot: record.execution_root, reproductionId: record.id, runId: run.id } };
  };
  ipcMain.handle('metric-comparison:choose', async (event, input = {}) => {
    const captured = context(input, true);
    const options = { title: 'Choose CSV or JSON comparison data', defaultPath: captured.owner.executionRoot, filters: [{ name: 'Metric data', extensions: ['csv', 'json'] }], properties: ['openFile'] };
    const parent = BrowserWindow.fromWebContents(event.sender);
    const choice = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
    if (choice.canceled || !choice.filePaths[0]) return { canceled: true };
    const originalPath = fs.realpathSync(choice.filePaths[0]), stat = fs.statSync(originalPath);
    if (!stat.isFile() || stat.size > metrics.MAX_INPUT_BYTES) throw new Error('Choose a CSV or JSON file smaller than 2 MiB.');
    const bytes = fs.readFileSync(originalPath), table = await metrics.parseInput(path.basename(originalPath), bytes), token = randomUUID();
    inputs.set(event.sender.id, { token, owner: captured.owner, bytes, name: table.name, originalPath });
    if (!watched.has(event.sender.id)) { watched.add(event.sender.id); event.sender.once?.('destroyed', () => { inputs.delete(event.sender.id); watched.delete(event.sender.id); }); }
    return { canceled: false, input: { token, name: table.name, sha256: table.sha256, bytes: table.bytes, format: table.format, headers: table.headers, preview: table.rows.slice(0, 8), rowCount: table.rows.length } };
  });
  ipcMain.handle('metric-comparison:save', async (event, input = {}) => {
    const captured = context(input, true), source = inputs.get(event.sender.id);
    if (!source || source.token !== input.inputToken || JSON.stringify(source.owner) !== JSON.stringify(captured.owner)) throw new Error('Choose comparison data for this project and run again.');
    const result = await metrics.saveComparison({ owner: captured.owner, runSnapshot: captured.run.snapshot, sourceName: source.name, sourceBytes: source.bytes, originalPath: source.originalPath, title: input.title, mapping: input.mapping });
    return result;
  });
  ipcMain.handle('metric-comparison:list', (_event, input = {}) => { const captured = context(input); return metrics.listComparisons(captured.owner, captured.run.snapshot); });
  ipcMain.handle('metric-comparison:get', (_event, input = {}) => { const captured = context(input); return metrics.getComparison(captured.owner, input.comparisonId, captured.run.snapshot); });
}

module.exports = { registerMetricComparisonCommands };
