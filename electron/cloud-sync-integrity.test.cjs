const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const store = require('./store.cjs');
const { createThreadSync } = require('./thread-sync.cjs');
const { createLibrarySync } = require('./library-sync.cjs');
const { createCollaborationApi } = require('./collaboration-api.cjs');
const { createWorkspaceIpc } = require('./workspace-context.cjs');
const { createSupabaseServer } = require('../server/supabase-server.cjs');
const { createCloudSdkFixture } = require('../server/test-support/cloud-sdk.cjs');
const { mergeCloudThread, mergeTurn } = require('../shared/cloud-sync.cjs');

function deferred() { let resolve; const promise = new Promise(value => { resolve = value; }); return { promise, resolve }; }
async function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'archimedes-cloud-integrity-')));
  store.setLocalIdentity({ userId: 'local-user', displayName: 'Local user', deviceId: 'fixture', deviceName: 'Fixture' });
  const owners = ['a', 'b'].map(name => { const folder = path.join(root, name); fs.mkdirSync(folder); return store.createWorkspaceStore(folder); });
  const projects = owners.map(owner => { const project = owner.createResearchProject({ name: 'Shared project' }); owner.linkResearchProjectToCloud(project.id, 'cloud-project'); return project; });
  const sdk = createCloudSdkFixture();
  sdk.addMember('cloud-project', 'owner', 'owner'); sdk.addMember('cloud-project', 'peer', 'editor'); sdk.addMember('cloud-project', 'viewer', 'viewer');
  const server = createSupabaseServer({ supabaseUrl: 'http://fixture.invalid', publishableKey: 'fixture', createClientImpl: sdk.createClientImpl });
  const address = await server.listen(0, '127.0.0.1');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const apis = ['owner', 'peer', 'viewer', 'outsider'].map(user => createCollaborationApi({ baseUrl, getToken: async () => user }));
  t.after(async () => { await server.close(); store.closeAllWorkspaces(); fs.rmSync(root, { recursive: true, force: true }); });
  return { root, a: owners[0], b: owners[1], pa: projects[0], pb: projects[1], apiA: apis[0], apiB: apis[1], viewer: apis[2], outsider: apis[3], sdk, baseUrl };
}

test('same-ID running turns deliver completed/failed/incomplete to another SQLite client, survive retries and old snapshots', async t => {
  const f = await fixture(t), aSync = createThreadSync({ store: f.a, api: f.apiA }), bSync = createThreadSync({ store: f.b, api: f.apiB });
  for (const status of ['completed', 'failed', 'incomplete']) {
    const thread = f.a.createResearchThread({ projectId: f.pa.id, prompt: status, mode: 'free-chat' });
    const task = f.a.startTask({ prompt: status });
    const turn = f.a.startResearchTurn({ threadId: thread.id, taskId: task.id, prompt: status, mode: 'free-chat' });
    assert.deepEqual((await aSync.syncProjectThreads(f.pa.id, { currentCloudUserId: 'owner', localUserId: 'local-user' })).warnings, []);
    await bSync.syncProjectThreads(f.pb.id, { currentCloudUserId: 'peer', localUserId: 'local-user' });
    const old = await f.apiA.getThread(thread.id);
    assert.equal(f.b.getResearchThread(thread.id).turns[0].status, 'running');
    f.a.finishTask(task.id, { status, response: `${status} durable output` });
    f.a.finishResearchTurn(turn.id, { status, response: `${status} durable output` });
    if (status === 'incomplete') f.a.appendResearchEvent({ threadId: thread.id, turnId: turn.id, type: 'model_incomplete', payload: { reason: 'missing_stop' } });
    let failed = false;
    const retryApi = { ...f.apiA, async saveTurn(id, value) {
      const result = await f.apiA.saveTurn(id, value);
      if (!failed) { failed = true; throw new Error('Lost acknowledgement after durable server commit'); }
      return result;
    } };
    assert.ok((await createThreadSync({ store: f.a, api: retryApi }).syncProjectThreads(f.pa.id, { currentCloudUserId: 'owner', localUserId: 'local-user' })).warnings.length);
    assert.deepEqual((await aSync.syncProjectThreads(f.pa.id, { currentCloudUserId: 'owner', localUserId: 'local-user' })).warnings, []);
    await f.apiA.saveTurn(thread.id, old.turns[0]); // Delayed legacy writer.
    await f.apiA.saveThread('cloud-project', old.thread); // Old aggregate status.
    await bSync.syncProjectThreads(f.pb.id, { currentCloudUserId: 'peer', localUserId: 'local-user' });
    const result = f.b.getResearchThread(thread.id);
    assert.equal(result.turns[0].id, turn.id);
    assert.equal(result.turns[0].status, status);
    assert.equal(result.turns[0].assistant_message, `${status} durable output`);
    assert.equal(result.status, status === 'completed' ? 'idle' : 'error');
    f.b.applyCloudThread(f.pb.id, old, { currentCloudUserId: 'peer', localUserId: 'local-user' });
    assert.equal(f.b.getResearchThread(thread.id).turns[0].status, status, 'a stale local pull must also remain monotonic');
    if (status === 'incomplete') assert.ok(result.events.some(event => event.type === 'model_incomplete'));
  }
});

test('library and membership tombstones survive reconnect/old pull while explicit re-add and other references remain valid', async t => {
  const f = await fixture(t), aSync = createLibrarySync({ store: f.a, api: f.apiA }), bSync = createLibrarySync({ store: f.b, api: f.apiB });
  const first = f.a.createLibrary({ projectId: f.pa.id, name: 'First' }), second = f.a.createLibrary({ projectId: f.pa.id, name: 'Second' });
  const paper = { canonical_key: 'doi:10.fixture/shared', title: 'Shared canonical paper', authors: ['Researcher'] };
  const localPaper = f.a.addPaper(first.id, paper); f.a.addPaper(second.id, paper);
  assert.deepEqual((await aSync.syncProjectLibraries(f.pa.id)).warnings, []);
  assert.deepEqual((await bSync.syncProjectLibraries(f.pb.id)).warnings, []);
  const cloudFirst = f.a.listLibraries(f.pa.id).find(row => row.id === first.id).cloud_library_id;
  const cloudSecond = f.a.listLibraries(f.pa.id).find(row => row.id === second.id).cloud_library_id;
  const cloudPaper = f.a.getPaper(localPaper.id).cloud_paper_id;
  const bFirst = f.b.listLibraries(f.pb.id).find(row => row.cloud_library_id === cloudFirst);
  const bSecond = f.b.listLibraries(f.pb.id).find(row => row.cloud_library_id === cloudSecond);
  assert.equal(f.b.listPapers(bFirst.id).length, 1); assert.equal(f.b.listPapers(bSecond.id).length, 1);
  const oldSnapshot = await f.apiA.librarySyncSnapshot('cloud-project');
  const oldPaper = (await f.apiA.listPapers(cloudFirst))[0];
  f.a.removePaper(first.id, localPaper.id);
  let lose = true;
  const loseAck = { ...f.apiA, async removePaper(...args) { const result = await f.apiA.removePaper(...args); if (lose) { lose = false; throw new Error('Lost deletion acknowledgement'); } return result; } };
  assert.ok((await createLibrarySync({ store: f.a, api: loseAck }).syncProjectLibraries(f.pa.id)).warnings.some(value => value.includes('Lost deletion')));
  assert.ok(f.a.listCloudLibraryChanges(f.pa.id).some(row => row.pending === 'delete'));
  await aSync.syncProjectLibraries(f.pa.id); await bSync.syncProjectLibraries(f.pb.id);
  assert.equal(f.b.listPapers(bFirst.id).length, 0);
  assert.equal(f.b.listPapers(bSecond.id).length, 1, 'removal is one membership, not a canonical paper delete');
  f.b.applyCloudLibrarySnapshot(f.pb.id, oldSnapshot);
  assert.equal(f.b.syncPaperFromCloud(bFirst.id, oldPaper), null, 'old pull cannot resurrect a removed membership');
  await assert.rejects(f.apiB.addPaper(cloudFirst, paper), /removed/);
  await assert.rejects(f.viewer.removePaper(cloudSecond, cloudPaper), /access|permission/i);
  await assert.rejects(f.outsider.librarySyncSnapshot('cloud-project'), /access|permission/i);
  f.b.addPaper(bFirst.id, paper); // Explicit user intent, not a sync import.
  assert.deepEqual((await bSync.syncProjectLibraries(f.pb.id)).warnings, []);
  await aSync.syncProjectLibraries(f.pa.id);
  assert.equal(f.a.listPapers(first.id).length, 1, 'a versioned explicit re-add is delivered');
  assert.equal((await f.apiA.librarySyncSnapshot('cloud-project')).items.find(row => row.library_id === cloudFirst && row.item_id === cloudPaper).sync_revision, 3);
  f.a.deleteLibrary(first.id);
  await aSync.syncProjectLibraries(f.pa.id); await bSync.syncProjectLibraries(f.pb.id);
  f.b.applyCloudLibrarySnapshot(f.pb.id, oldSnapshot);
  assert.equal(f.b.importCloudLibrary(f.pb.id, { cloudLibraryId: cloudFirst, name: 'Stale library' }), null);
  assert.equal(f.b.listLibraries(f.pb.id).some(row => row.cloud_library_id === cloudFirst), false);
  assert.equal(f.b.listPapers(bSecond.id).length, 1);
});

test('real main sync IPC captures A dataRoot through delayed pull, B open and A close', { timeout: 15_000 }, async t => {
  const f = await fixture(t);
  const shared = f.a.createLibrary({ projectId: f.pa.id, name: 'Remote A' });
  await createLibrarySync({ store: f.a, api: f.apiA }).syncProjectLibraries(f.pa.id);
  const gate = deferred(), entered = deferred(); let first = true;
  const api = { ...f.apiA, async librarySyncSnapshot(...args) { const value = await f.apiA.librarySyncSnapshot(...args); if (first) { first = false; entered.resolve(); await gate.promise; } return value; } };
  const handlers = new Map(), windows = new Map([[1, f.a.workspace], [2, f.b.workspace]]);
  const ipcMain = createWorkspaceIpc({ ipcMain: { handle: (name, callback) => handlers.set(name, callback) }, store, workspaceForEvent: event => windows.get(event.sender.id) });
  const source = fs.readFileSync(path.join(__dirname, 'main.cjs'), 'utf8');
  const line = source.split('\n').find(value => value.includes('ipcMain.handle("collab:sync-libraries",'));
  assert.ok(line);
  new Function('ipcMain', 'createLibrarySync', 'store', 'requireCollaboration', line)(ipcMain, createLibrarySync, store, () => api);
  const pending = handlers.get('collab:sync-libraries')({ sender: { id: 1 } }, { projectId: f.pa.id });
  await entered.promise;
  store.openWorkspace(f.b.workspace); f.a.close();
  f.b.createLibrary({ projectId: f.pb.id, name: 'Only B' });
  gate.resolve(); await pending;
  const reopened = store.createWorkspaceStore(path.join(f.root, 'a'));
  assert.ok(reopened.listLibraries(f.pa.id).some(row => row.id === shared.id));
  assert.equal(f.b.listLibraries(f.pb.id).some(row => row.name === 'Remote A'), false);
});

test('turn revisions reject terminal regression and cross-thread identity mixing', () => {
  const turn = { id: 'turn', thread_id: 'thread', mode: 'free-chat', user_message: 'Question', assistant_message: 'Partial', status: 'incomplete' };
  assert.equal(mergeTurn(turn, { ...turn, status: 'running', assistant_message: '' }), turn);
  assert.throws(() => mergeTurn(turn, { ...turn, thread_id: 'other' }), /cannot move/);
  assert.equal(mergeCloudThread({ id: 'thread', turns: [turn] }, { thread: { id: 'thread', status: 'running' }, turns: [] }).thread.status, 'error');
});

test('a first upload removed before its ACK remains deleted, including delayed library creation', { timeout: 15_000 }, async t => {
  const f = await fixture(t);
  const library = f.a.createLibrary({ projectId: f.pa.id, name: 'Upload then remove' });
  const paper = f.a.addPaper(library.id, { canonical_key: 'doi:fixture/delayed', title: 'Delayed paper' });
  const gate = deferred(), entered = deferred();
  const api = { ...f.apiA, async addPaper(...args) { const result = await f.apiA.addPaper(...args); entered.resolve(); await gate.promise; return result; } };
  const syncing = createLibrarySync({ store: f.a, api }).syncProjectLibraries(f.pa.id);
  await entered.promise;
  assert.equal(f.a.getPaper(paper.id).cloud_paper_id, null);
  f.a.removePaper(library.id, paper.id);
  gate.resolve(); await syncing;
  assert.equal(f.a.listPapers(library.id).length, 0);
  const linked = f.a.listLibraries(f.pa.id).find(row => row.id === library.id);
  assert.equal((await f.apiA.listPapers(linked.cloud_library_id)).length, 0);
  const gate2 = deferred(), entered2 = deferred();
  const delayed = f.a.createLibrary({ projectId: f.pa.id, name: 'Delayed create then delete' });
  const creating = createLibrarySync({ store: f.a, api: { ...f.apiA, async createLibrary(...args) {
    const result = await f.apiA.createLibrary(...args); if (result.id === delayed.id) { entered2.resolve(); await gate2.promise; } return result;
  } } }).syncProjectLibraries(f.pa.id);
  await entered2.promise;
  f.a.deleteLibrary(delayed.id);
  gate2.resolve(); await creating;
  assert.equal(f.a.listLibraries(f.pa.id).some(row => row.id === delayed.id), false);
  assert.ok((await f.apiA.librarySyncSnapshot('cloud-project')).libraries.find(row => row.id === delayed.id).deleted_at);
});

test('viewer sync can import and observe deletion without exposing local editor operations or pushing libraries', async t => {
  const f = await fixture(t);
  const remote = f.a.createLibrary({ projectId: f.pa.id, name: 'Viewer reference' });
  f.a.addPaper(remote.id, { canonical_key: 'doi:fixture/viewer', title: 'Visible to viewers' });
  await createLibrarySync({ store: f.a, api: f.apiA }).syncProjectLibraries(f.pa.id);
  f.b.addProjectMember({ projectId: f.pb.id, userId: 'reader-local', role: 'viewer', displayName: 'Reader' });
  const before = f.sdk.tables.libraries.length;
  store.setLocalIdentity({ userId: 'reader-local', displayName: 'Reader', deviceId: 'reader', deviceName: 'Reader device' });
  try {
    const result = await createLibrarySync({ store: f.b, api: f.viewer }).syncProjectLibraries(f.pb.id);
    assert.deepEqual(result.warnings, []);
    const imported = f.b.listLibraries(f.pb.id).find(row => row.name === 'Viewer reference');
    assert.equal(f.b.listPapers(imported.id)[0].title, 'Visible to viewers');
    assert.equal(f.sdk.tables.libraries.length, before);
    assert.throws(() => f.b.createLibrary({ projectId: f.pb.id, name: 'No editor permission' }), /permission/);
    assert.throws(() => f.b.addPaper(imported.id, { canonical_key: 'no', title: 'No permission' }), /permission/);
  } finally { store.setLocalIdentity({ userId: 'local-user', displayName: 'Local user', deviceId: 'fixture', deviceName: 'Fixture' }); }
});

test('deletion journal survives reopening and a delayed deletion ACK cannot swallow an explicit re-add', { timeout: 15_000 }, async t => {
  const f = await fixture(t);
  const library = f.a.createLibrary({ projectId: f.pa.id, name: 'Durable intent' });
  const paper = { canonical_key: 'doi:fixture/retry', title: 'Retry deletion' };
  const local = f.a.addPaper(library.id, paper);
  await createLibrarySync({ store: f.a, api: f.apiA }).syncProjectLibraries(f.pa.id);
  f.a.removePaper(library.id, local.id);
  const dataRoot = f.a.workspace;
  f.a.close();
  const reopened = store.createWorkspaceStore(dataRoot);
  assert.ok(reopened.listCloudLibraryChanges(f.pa.id).some(row => row.pending === 'delete'));
  const gate = deferred(), entered = deferred();
  const api = { ...f.apiA, async removePaper(...args) { const value = await f.apiA.removePaper(...args); entered.resolve(); await gate.promise; return value; } };
  const pending = createLibrarySync({ store: reopened, api }).syncProjectLibraries(f.pa.id);
  await entered.promise;
  reopened.addPaper(library.id, paper);
  gate.resolve();
  await pending;
  assert.equal(reopened.listPapers(library.id).length, 1);
  const result = await createLibrarySync({ store: reopened, api: f.apiA }).syncProjectLibraries(f.pa.id);
  assert.deepEqual(result.warnings, []);
  const cloud = reopened.listLibraries(f.pa.id).find(row => row.id === library.id).cloud_library_id;
  assert.equal((await f.apiA.listPapers(cloud)).length, 1);
  assert.equal(reopened.listCloudLibraryChanges(f.pa.id).some(row => row.pending), false);
});

test('old servers retain pending deletes with an upgrade warning; unknown pre-migration library IDs are never recreated', async t => {
  const f = await fixture(t);
  const library = f.a.createLibrary({ projectId: f.pa.id, name: 'Legacy deletion' });
  await createLibrarySync({ store: f.a, api: f.apiA }).syncProjectLibraries(f.pa.id);
  const cloudId = f.a.listLibraries(f.pa.id).find(row => row.id === library.id).cloud_library_id;
  f.a.deleteLibrary(library.id);
  const result = await createLibrarySync({ store: f.a, api: { ...f.apiA, async librarySyncSnapshot() { throw new Error('Unknown route (404)'); } } }).syncProjectLibraries(f.pa.id);
  assert.ok(result.warnings.some(value => value.includes('0013')));
  assert.ok(f.a.listCloudLibraryChanges(f.pa.id).some(row => row.cloud_library_id === cloudId && row.pending === 'delete'));
  assert.equal(f.a.listLibraries(f.pa.id).some(row => row.cloud_library_id === cloudId), false);
  assert.equal((await f.apiA.librarySyncSnapshot('cloud-project')).libraries.find(row => row.id === cloudId).deleted_at, null);
  await createLibrarySync({ store: f.a, api: f.apiA }).syncProjectLibraries(f.pa.id);
  assert.ok((await f.apiA.librarySyncSnapshot('cloud-project')).libraries.find(row => row.id === cloudId).deleted_at);
  const unknown = f.a.createLibrary({ projectId: f.pa.id, name: 'Hard-deleted before migration' });
  f.a.linkLibraryToCloud(unknown.id, '00000000-0000-0000-0000-000000000001');
  const updated = await createLibrarySync({ store: f.a, api: f.apiA }).syncProjectLibraries(f.pa.id);
  assert.ok(updated.warnings.some(value => value.includes('linked cloud library is missing')));
  assert.equal((await f.apiA.librarySyncSnapshot('cloud-project')).libraries.some(row => row.id === '00000000-0000-0000-0000-000000000001'), false);
});
