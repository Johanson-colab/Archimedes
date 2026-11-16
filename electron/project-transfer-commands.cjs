const fs = require('node:fs');
const path = require('node:path');
const transfer = require('./project-transfer.cjs');

function registerProjectTransferCommands({ ipcMain, store, dialog, BrowserWindow, reviewDbPath }) {
  const choose = (event, options) => {
    const parent = BrowserWindow.fromWebContents(event.sender);
    return parent ? dialog.showOpenDialog(parent, options) : dialog.showOpenDialog(options);
  };
  const context = projectId => {
    const owner = store.currentStore(), project = owner.getResearchProject(projectId);
    if (!project || !owner.canAccessProject(projectId, 'viewer')) throw new Error('You do not have access to export this project.');
    return { owner, project };
  };
  ipcMain.handle('project-transfer:preview', (_event, { projectId, selection } = {}) => {
    const { owner } = context(projectId);
    return owner.previewProjectTransfer(projectId, { selection, reviewDbPath });
  });
  ipcMain.handle('project-transfer:export', async (event, { projectId, selection } = {}) => {
    const { owner } = context(projectId);
    const destination = await choose(event, { title: 'Choose a folder for the project package', properties: ['openDirectory', 'createDirectory'] });
    if (destination.canceled || !destination.filePaths[0]) return { canceled: true };
    return { canceled: false, package: owner.exportProjectTransfer(projectId, { selection, destinationParent: destination.filePaths[0], reviewDbPath }) };
  });
  ipcMain.handle('project-transfer:inspect', async event => {
    const selected = await choose(event, { title: 'Choose an Archimedes project package folder', properties: ['openDirectory'] });
    if (selected.canceled || !selected.filePaths[0]) return { canceled: true };
    return { canceled: false, package: transfer.inspectPackage(selected.filePaths[0]) };
  });
  ipcMain.handle('project-transfer:import', async (event, { packagePath, name } = {}) => {
    const owner = store.currentStore();
    // Validate before showing the destination chooser, then validate again in the import.
    transfer.inspectPackage(packagePath);
    const destination = await choose(event, { title: 'Choose a folder for the restored project', properties: ['openDirectory', 'createDirectory'] });
    if (destination.canceled || !destination.filePaths[0]) return { canceled: true };
    const imported = owner.importProjectTransfer(packagePath, { name, targetParent: destination.filePaths[0], reviewDbPath });
    return { canceled: false, ...imported, project: owner.getResearchProject(imported.projectId) };
  });
  ipcMain.handle('project-transfer:sources', async (event, { projectId, mode } = {}) => {
    const { owner } = context(projectId);
    const workspaces = owner.previewProjectTransfer(projectId, { selection: { pdfs: false, annotations: false, reports: false, conversations: false, results: false, artifacts: false, reproductions: false } }).sourceRoots.flatMap(item => {
      try { return [{ ...item, root: fs.realpathSync(item.root) }]; } catch { return []; }
    });
    const selected = await choose(event, { title: mode === 'folder' ? 'Choose a manuscript folder' : 'Choose manuscript or result source files', defaultPath: workspaces[0]?.root, properties: mode === 'folder' ? ['openDirectory'] : ['openFile', 'multiSelections'] });
    if (selected.canceled) return { canceled: true, files: [], excluded: 0 };
    const files = []; let excluded = 0;
    const skipped = new Set(['.git', '.archimedes', 'node_modules', '.venv', 'venv', '__pycache__', '.cache', 'dist', 'build']);
    const visit = (file, workspace) => {
      if (files.length >= 10000) throw new Error('Choose at most 10,000 source files.');
      const relative = path.relative(fs.realpathSync(workspace.root), file).split(path.sep).join('/');
      if (relative.split('/').some(part => skipped.has(part) || /^\.env(?:\.|$)|\.(?:pem|key)$/i.test(part))) { excluded++; return; }
      const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) { excluded++; return; }
      if (stat.isDirectory()) for (const name of fs.readdirSync(file)) visit(path.join(file, name), workspace);
      else if (stat.isFile()) files.push({ workspaceId: workspace.workspaceId, ...(workspace.threadId ? { threadId: workspace.threadId } : {}), path: relative });
    };
    for (const file of selected.filePaths) {
      const actual = fs.realpathSync(file);
      const workspace = [...workspaces].sort((a, b) => b.root.length - a.root.length).find(item => { const root = fs.realpathSync(item.root); return actual === root || actual.startsWith(`${root}${path.sep}`); });
      if (!workspace) throw new Error('Choose source files inside this project workspace.');
      visit(actual, workspace);
    }
    return { canceled: false, files, excluded };
  });
}

module.exports = { registerProjectTransferCommands };
