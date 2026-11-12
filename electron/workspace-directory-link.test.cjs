const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');
const { inspectWorkspacePath, listWorkspaceDirectory, readWorkspaceFile } = require('./workspace-files.cjs');

function section(source, start, end) {
  const left = source.indexOf(start), right = source.indexOf(end, left);
  assert.ok(left >= 0 && right > left, `${start} is present`);
  return source.slice(left, right);
}

test('a clicked directory link expands nested Files entries and can still open a skill file', async t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'archimedes-directory-link-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.codex/skills/idea-spark'), { recursive: true });
  fs.mkdirSync(path.join(root, '.codex/skills/paper-search'), { recursive: true });
  fs.writeFileSync(path.join(root, '.codex/skills/idea-spark/SKILL.md'), '# IdeaSpark skill');
  fs.writeFileSync(path.join(root, 'old.md'), '# Existing draft');
  fs.mkdirSync(path.join(root, 'node_modules', 'nested'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules', 'nested', 'info.md'), '# Nested');
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
  const previous = { window: global.window, document: global.document, ResizeObserver: global.ResizeObserver, act: global.IS_REACT_ACT_ENVIRONMENT };
  global.window = dom.window;
  global.document = dom.window.document;
  global.ResizeObserver = class { observe() {} disconnect() {} };
  global.IS_REACT_ACT_ENVIRONMENT = true;
  dom.window.HTMLElement.prototype.scrollIntoView = function() {};
  const React = require('react');
  const { createRoot } = require('react-dom/client');
  const { transformWithOxc } = await import('vite');
  const markdown = await import('react-markdown');
  const helpers = await import('../src/workspace-links.ts');
  const { workspacePathName } = await import('../src/workspace-path.ts');
  const linkSource = fs.readFileSync(path.join(__dirname, '../src/WorkspaceMarkdownLink.tsx'), 'utf8');
  const { code: linkCode } = await transformWithOxc(linkSource.replace(/^import .*;$/gm, '').replace(/^export /gm, ''), 'link.tsx', { jsx: { runtime: 'classic' } });
  const links = new Function('React', 'createContext', 'useContext', 'useMemo', 'defaultUrlTransform', 'workspaceFileLink', `${linkCode}\nreturn { WorkspaceMarkdownProvider, WorkspaceMarkdownLink, workspaceMarkdownUrlTransform };`)(React, React.createContext, React.useContext, React.useMemo, markdown.defaultUrlTransform, helpers.workspaceFileLink);
  const app = fs.readFileSync(path.join(__dirname, '../src/App.tsx'), 'utf8');
  const extracts = [
    section(app, 'function setDirectoryChildren(', '\nconst DEFAULT_WORKSPACE'),
    section(app, 'function WorkspaceTreeNode(', '\nfunction FilePreview('),
    section(app, 'const FILES_PANE_DEFAULT_WIDTH', '\nfunction WorkspaceModal('),
  ];
  const { code } = await transformWithOxc(extracts.join('\n'), 'files-view.tsx', { jsx: { runtime: 'classic' } });
  const icon = () => null;
  const FilePreview = ({ file, error }) => React.createElement('div', { 'data-testid': 'file-preview' }, error || file?.content || 'no file');
  const names = ['React','useState','useEffect','useRef','useCallback','useUISettings','WorkspaceFileGlyph','workspaceFileTone','FilePreview','FolderOpen','RefreshCw','Plus','ChevronDown','ChevronRight','ChevronLeft','ChevronsLeft','ChevronsRight','Maximize2','Minimize2','X','MenuSurface','MenuItem','MenuDivider'];
  const values = [React,React.useState,React.useEffect,React.useRef,React.useCallback,() => ({ t: value => value }),icon,() => 'file',FilePreview,...Array(names.length - 9).fill(icon)];
  const { FilesView, setDirectoryChildren, ensureDirectoryPath } = new Function(...names, 'workspacePathName', `${code}\nreturn { FilesView, setDirectoryChildren, ensureDirectoryPath };`)(...values, workspacePathName);
  const { code: openerCode } = await transformWithOxc(section(app, '  async function openChangedFile(', '\n  function askAIAboutPaper('), 'path-opener.tsx');
  const openerFactory = new Function('pathOpenRequestRef','executionWorkspace','executionWorkspaceRef','desktopBridge','setFileTree','setFileError','setDirectoryRequest','openWorkbench','setPaperOpenRequest','setMainSection','openFilePane','setSelectedFilePath','setSelectedFile','setFileLoading','setDirectoryChildren','ensureDirectoryPath', `${openerCode}\nreturn openChangedFile;`);
  const noOp = () => {};
  const fileReads = [];
  function Harness() {
    const [tree, setFileTree] = React.useState(() => listWorkspaceDirectory(root));
    const [directoryRequest, setDirectoryRequest] = React.useState(null);
    const [selectedPath, setSelectedFilePath] = React.useState('old.md');
    const [file, setSelectedFile] = React.useState(() => readWorkspaceFile(root, 'old.md'));
    const [error, setFileError] = React.useState('previous error');
    const [, setFileLoading] = React.useState(false);
    const pathOpenRequestRef = React.useRef(0), executionWorkspaceRef = React.useRef(root);
    const clearRequest = React.useCallback(id => setDirectoryRequest(current => current?.id === id ? null : current), []);
    const openFilePane = React.useCallback(async filePath => {
      fileReads.push(filePath);
      setSelectedFilePath(filePath);
      setSelectedFile(readWorkspaceFile(root, filePath));
      setFileError('');
    }, []);
    const onLoadDirectory = React.useCallback(directory => {
      const listing = listWorkspaceDirectory(root, directory);
      setFileTree(current => ({ ...current, entries: setDirectoryChildren(current.entries, directory, listing.entries) }));
    }, []);
    const bridge = { inspectWorkspacePath: async (_workspace, filePath) => inspectWorkspacePath(root, filePath), listWorkspaceFiles: async (_workspace, directory = "") => listWorkspaceDirectory(root, directory) };
    const openChangedFile = openerFactory(pathOpenRequestRef, root, executionWorkspaceRef, bridge, setFileTree, setFileError, setDirectoryRequest, noOp, noOp, noOp, openFilePane, setSelectedFilePath, setSelectedFile, setFileLoading, setDirectoryChildren, ensureDirectoryPath);
    return React.createElement(React.Fragment, null,
      React.createElement(links.WorkspaceMarkdownProvider, { workspace: root, onOpenFile: openChangedFile }, React.createElement(markdown.default, { urlTransform: links.workspaceMarkdownUrlTransform, components: { a: links.WorkspaceMarkdownLink } }, '[Skills](.codex/skills) [Nested](node_modules/nested) [Missing](missing-folder)')),
      React.createElement(FilesView, { workspace: root, tree, selectedPath, directoryRequest, onDirectoryRequestHandled: clearRequest, file, error,
        openFiles: [readWorkspaceFile(root, 'old.md')], loading: false, loadingDirectories: new Set(), drafts: {}, dirtyFiles: new Set(), savingFiles: new Set(), conflicts: {}, saveErrors: {}, compact: true, compactWidth: 400,
        onOpenFile: openFilePane, onSelectOpenFile: f => openFilePane(f.path), onCloseFile: noOp, onCloseOtherFiles: noOp, onCloseAllFiles: noOp, onLoadDirectory, onRefresh: noOp, onNewFile: noOp, onDraftChange: noOp, onSave: noOp, onReload: noOp, onDismissConflict: noOp, onAddComment: noOp }));
  }
  const container = document.getElementById('root');
  const reactRoot = createRoot(container);
  try {
    await React.act(async () => reactRoot.render(React.createElement(Harness)));
    const link = container.querySelector('a');
    const event = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true });
    await React.act(async () => { link.dispatchEvent(event); await new Promise(resolve => setImmediate(resolve)); });
    assert.equal(event.defaultPrevented, true);
    assert.deepEqual(fileReads, [], 'opening a directory must not try to read it as a file');
    const directory = container.querySelector('button[title=".codex/skills"]');
    assert.ok(directory?.classList.contains('active'), 'the requested directory is visible and selected');
    assert.ok(container.querySelector('button[title=".codex/skills/idea-spark"]'));
    assert.ok(container.querySelector('button[title=".codex/skills/paper-search"]'));
    assert.doesNotMatch(container.textContent, /previous error/);
    await React.act(async () => container.querySelector('button[title=".codex/skills/idea-spark"]').click());
    await React.act(async () => container.querySelector('button[title=".codex/skills/idea-spark/SKILL.md"]').click());
    assert.equal(container.querySelector('[data-testid="file-preview"]').textContent, '# IdeaSpark skill');
    assert.deepEqual(fileReads, ['.codex/skills/idea-spark/SKILL.md']);
    await React.act(async () => { link.click(); await new Promise(resolve => setImmediate(resolve)); });
    assert.ok(container.querySelector('button[title=".codex/skills"]')?.classList.contains('active'), 'reopening switches back from preview to the folder');
    const ignoredLink = [...container.querySelectorAll('a')].find(anchor => anchor.textContent === 'Nested');
    await React.act(async () => { ignoredLink.click(); await new Promise(resolve => setImmediate(resolve)); });
    assert.ok(container.querySelector('button[title="node_modules/nested"]')?.classList.contains('active'), 'an explicitly linked ignored directory can still be revealed');
    assert.ok(container.querySelector('button[title="node_modules/nested/info.md"]'));
    const missingLink = [...container.querySelectorAll('a')].find(anchor => anchor.textContent === 'Missing');
    await React.act(async () => { missingLink.click(); await new Promise(resolve => setImmediate(resolve)); });
    assert.match(container.querySelector('[data-testid="file-preview"]').textContent, /ENOENT/);
    assert.deepEqual(fileReads, ['.codex/skills/idea-spark/SKILL.md']);
  } finally {
    await React.act(async () => reactRoot.unmount());
    dom.window.close();
    global.window = previous.window; global.document = previous.document; global.ResizeObserver = previous.ResizeObserver; global.IS_REACT_ACT_ENVIRONMENT = previous.act;
  }
});

test('newer path requests win over slower directory inspection', async () => {
  const app = fs.readFileSync(path.join(__dirname, '../src/App.tsx'), 'utf8');
  const { transformWithOxc } = await import('vite');
  const { code } = await transformWithOxc(section(app, '  async function openChangedFile(', '\n  function askAIAboutPaper('), 'path-opener-race.tsx');
  const openerFactory = new Function('pathOpenRequestRef','executionWorkspace','executionWorkspaceRef','desktopBridge','setFileTree','setFileError','setDirectoryRequest','openWorkbench','setPaperOpenRequest','setMainSection','openFilePane','setSelectedFilePath','setSelectedFile','setFileLoading','setDirectoryChildren','ensureDirectoryPath', `${code}\nreturn openChangedFile;`);
  const request = { current: 0 }, workspace = { current: '/workspace' }, actions = [];
  let release;
  const delayed = new Promise(resolve => { release = resolve; });
  const bridge = { inspectWorkspacePath: async (_root, filePath) => filePath === 'slow' ? delayed : { path: filePath, type: 'file' }, listWorkspaceFiles: async () => ({ entries: [] }) };
  const noOp = () => {};
  const open = openerFactory(request, '/workspace', workspace, bridge, noOp, noOp, value => actions.push(['directory', value.path]), noOp, noOp, noOp, value => actions.push(['file', value]), noOp, noOp, noOp, noOp, noOp);
  const first = open('slow');
  await open('current.md');
  release({ path: 'slow', type: 'directory' });
  await first;
  assert.deepEqual(actions, [['file', 'current.md']]);

  let releaseNext;
  const pending = new Promise(resolve => { releaseNext = resolve; });
  bridge.inspectWorkspacePath = async () => pending;
  const staleWorkspace = open('stale');
  workspace.current = '/another-workspace';
  releaseNext({ path: 'stale', type: 'directory' });
  await staleWorkspace;
  assert.deepEqual(actions, [['file', 'current.md']]);
});
