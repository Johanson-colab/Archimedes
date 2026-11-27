const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const repository = path.resolve(__dirname, '../../../..');
const store = require(path.join(repository, 'electron/store.cjs'));
const { createThreadSync } = require(path.join(repository, 'electron/thread-sync.cjs'));
const { createLibrarySync } = require(path.join(repository, 'electron/library-sync.cjs'));

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'archimedes-cloud-before-')));
  const owner = store.createWorkspaceStore(root);
  t.after(() => { store.closeAllWorkspaces(); fs.rmSync(root, { recursive: true, force: true }); });
  const project = owner.createResearchProject({ name: 'Cloud regression' });
  owner.linkResearchProjectToCloud(project.id, 'cloud-project');
  return { owner, project };
}
test('an already uploaded running turn reaches its same-ID incomplete final state', async t => {
  const { owner, project } = fixture(t), rows = new Map();
  const api = {
    async saveThread(_project, thread) { rows.set(thread.id, { thread: { ...thread, updated_at: new Date().toISOString() }, turns: rows.get(thread.id)?.turns || [], events: [] }); },
    async getThread(id) { return structuredClone(rows.get(id)); }, async listThreads() { return [...rows.values()].map(row => row.thread); },
    async saveTurn(id, turn) { const row = rows.get(id); row.turns = [...row.turns.filter(value => value.id !== turn.id), turn]; },
    async saveEvents() {}, async listComments() { return []; },
  };
  const thread = owner.createResearchThread({ projectId: project.id, mode: 'free-chat', prompt: 'Question' });
  const task = owner.startTask({ prompt: 'Question' });
  const turn = owner.startResearchTurn({ threadId: thread.id, taskId: task.id, mode: 'free-chat', prompt: 'Question' });
  const sync = createThreadSync({ store: owner, api });
  await sync.syncProjectThreads(project.id, { localUserId: 'local-user' });
  owner.finishTask(task.id, { response: 'Partial result', status: 'incomplete' });
  owner.finishResearchTurn(turn.id, { response: 'Partial result', status: 'incomplete' });
  await sync.syncProjectThreads(project.id, { localUserId: 'local-user' });
  console.log(JSON.stringify({ scenario: 'same-id-final', remote: rows.get(thread.id).turns[0] }));
  assert.equal(rows.get(thread.id).turns[0].status, 'incomplete');
});
test('a deleted synced library stays deleted on reconnect', async t => {
  const { owner, project } = fixture(t);
  let next = 0; const remote = [];
  const api = { async listLibraries() { return structuredClone(remote); }, async createLibrary(_id, value) { const row = { ...value, id: `cloud-${++next}` }; remote.push(row); return row; }, async updateLibrary() {}, async listPapers() { return []; } };
  const library = owner.createLibrary({ projectId: project.id, name: 'Delete me' });
  const sync = createLibrarySync({ store: owner, api });
  await sync.syncProjectLibraries(project.id);
  const linked = owner.listLibraries(project.id).find(row => row.id === library.id);
  owner.deleteLibrary(library.id);
  await sync.syncProjectLibraries(project.id);
  const resurrected = owner.listLibraries(project.id).some(row => row.cloud_library_id === linked.cloud_library_id);
  console.log(JSON.stringify({ scenario: 'library-reconnect', resurrected }));
  assert.equal(resurrected, false);
});
