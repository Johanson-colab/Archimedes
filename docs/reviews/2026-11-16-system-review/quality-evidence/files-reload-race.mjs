// Execute App's actual reload callback with a deferred, no-network bridge.
// No Electron or real user files; this isolates delayed-return draft behavior.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const helpers = await import(path.join(repo, 'src/file-editor.ts'));
const source = fs.readFileSync(path.join(repo, 'src/App.tsx'), 'utf8');
const start = source.indexOf('  async function reloadFile(');
const end = source.indexOf('  function dismissFileConflict(', start);
if (start < 0 || end <= start) throw new Error('Reassess callback boundaries');
const scopeStart = source.indexOf('  function isCurrentFileWorkspace(');
const scopeEnd = source.indexOf('  function updateFileScope(', scopeStart);
const scopeCode = scopeStart >= 0 && scopeEnd > scopeStart ? source.slice(scopeStart, scopeEnd) : '';
const observations = [];
for (const switchRoots of [false, true]) {
  const file = { path: 'README.md', name: 'README.md', kind: 'markdown', size: 8, content: 'Original A', modifiedAt: 'initial' };
  let release;
  const response = new Promise(resolve => { release = resolve; });
  const fileEditorScopesRef = { current: helpers.updateFileEditorScope({}, '/A', scope => ({ ...scope, drafts: { [file.path]: helpers.createFileDraft(file) } })) };
  const executionWorkspaceRef = { current: '/A' };
  const fileWorkspaceVersionRef = { current: 0 };
  const openFilesRef = { current: [file] };
  const env = {
    executionWorkspace: '/A', executionWorkspaceRef, fileEditorScopesRef, openFilesRef,
    fileWorkspaceVersion: 0, fileWorkspaceVersionRef,
    desktopBridge: { readWorkspaceFile: () => response },
    createFileDraft: helpers.createFileDraft, getFileEditorScope: helpers.getFileEditorScope,
    setDrafts: drafts => { fileEditorScopesRef.current = helpers.updateFileEditorScope(fileEditorScopesRef.current, '/A', scope => ({ ...scope, drafts })); },
    setOpenFiles: () => {}, setSelectedFile: () => {}, setFileConflicts: () => {}, setFileErrors: () => {},
    withoutKey: (value, key) => { const next = { ...value }; delete next[key]; return next; },
  };
  const callback = new Function(...Object.keys(env), `${stripTypeScriptTypes(scopeCode + source.slice(start, end))}\nreturn reloadFile;`)(...Object.values(env));
  const pending = callback(file.path);
  if (switchRoots) {
    executionWorkspaceRef.current = '/B'; fileWorkspaceVersionRef.current += 1;
    executionWorkspaceRef.current = '/A'; fileWorkspaceVersionRef.current += 1;
  }
  fileEditorScopesRef.current = helpers.updateFileEditorScope(fileEditorScopesRef.current, '/A', scope => ({ ...scope, drafts: { ...scope.drafts, [file.path]: { ...scope.drafts[file.path], content: 'A edit typed after returning' } } }));
  release(file);
  await pending;
  const after = helpers.getFileEditorScope(fileEditorScopesRef.current, '/A').drafts[file.path];
  observations.push({ probe: switchRoots ? 'stale-reload-after-return' : 'stale-reload-while-typing', actualDraft: after.content, newerDraftRetained: after.content === 'A edit typed after returning' });
}
console.log(JSON.stringify(observations, null, 2));
