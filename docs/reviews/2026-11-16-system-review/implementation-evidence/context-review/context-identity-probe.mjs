import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const require = createRequire(import.meta.url);
const store = require(path.join(repository, 'electron/store.cjs'));
const { resolveResearchContext } = require(path.join(repository, 'electron/workspace-context.cjs'));
const { taskDraftKey, threadTaskSelection } = await import(path.join(repository, 'src/task-selection.ts'));
const { updateComposerSession, getComposerSession } = await import(path.join(repository, 'src/composer-session.ts'));
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'archimedes-independent-context-')));
const results = [];
try {
  const dataA = path.join(root, 'data-a'), dataB = path.join(root, 'data-b'), execution = path.join(root, 'project');
  for (const directory of [dataA, dataB, execution]) fs.mkdirSync(directory);
  const a = store.createWorkspaceStore(dataA), b = store.createWorkspaceStore(dataB);
  const cloudId = 'same-cloud-thread-id';
  const projectA = a.createResearchProject({ name: 'Project with separate execution folder', workspacePath: execution });
  const projectB = b.defaultResearchProject();
  for (const [owner, project] of [[a, projectA], [b, projectB]]) {
    owner.applyCloudThread(project.id, { thread: { id: cloudId, title: 'Imported', status: 'idle' }, turns: [] });
  }
  const selectionA = threadTaskSelection(dataA, a.getResearchThread(cloudId), a.listProjectWorkspaces());
  const selectionB = threadTaskSelection(dataB, b.getResearchThread(cloudId), b.listProjectWorkspaces());
  const keyA = taskDraftKey(selectionA), keyB = taskDraftKey(selectionB);
  let sessions = updateComposerSession({}, keyA, session => ({ ...session, items: [{ id: 'private-A-file' }], request: { id: 'A-request', text: 'A only' } }));
  const sameKey = keyA === keyB;
  const leakedAttachment = getComposerSession(sessions, keyB).items.some(item => item.id === 'private-A-file');
  results.push({ scenario: 'same cloud thread id across two data roots', sameKey, leakedAttachment, keyA, keyB });
  let rejection = '';
  try { resolveResearchContext(a, { threadId: cloudId, projectId: selectionA.projectId, workspaceId: selectionA.workspaceId, workspace: selectionA.executionRoot }); }
  catch (error) { rejection = String(error.message); }
  results.push({ scenario: 'fresh cloud import into project whose folder differs from data root', frontendExecutionRoot: selectionA.executionRoot, expectedExecutionRoot: execution, rejection });
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  // This probe passes only once both independently identified regressions are fixed.
  assert.equal(sameKey, false, 'data roots must isolate imported-thread composer identities');
  assert.equal(leakedAttachment, false, 'A attachment must never appear in B composer');
  assert.equal(rejection, '', 'frontend task identity must match backend canonical resolution');
} finally {
  store.closeAllWorkspaces();
  fs.rmSync(root, { recursive: true, force: true });
}
