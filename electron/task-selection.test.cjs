const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/App.tsx'), 'utf8');
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const projects = [{ id: 'a', workspace_path: '/physical/a' }, { id: 'b', workspace_path: '/physical/b' }];
const workspaces = projects.map(project => ({ id: `ws-${project.id}`, project_id: project.id, root: project.workspace_path, is_default: true }));
function detail(id, project = id) { return { id, project_id: project, workspace_id: `ws-${project}`, workspace_path: `/physical/${project}`, messages: [{ id: `${id}:user`, role: 'user', text: id }], events: [], turns: [], changeSets: [], mode: 'free-chat' }; }
function extract(name) {
  const start = source.search(new RegExp(`^  (?:async )?function ${name}\\(`, 'm'));
  assert.ok(start >= 0, name);
  const rest = source.slice(start + 1);
  const end = rest.search(/^  (?:async )?function /m);
  assert.ok(end >= 0, `next function after ${name}`);
  return source.slice(start, start + 1 + end);
}
async function harness(overrides = {}) {
  const helpers = await import('../src/task-selection.ts');
  const state = { selection: helpers.threadTaskSelection('/data', detail('a'), workspaces), messages: [], error: '', section: 'library', threads: [detail('a'), detail('b')] };
  const ref = { current: state.selection };
  const scope = {
    ...helpers, crypto: global.crypto, t: text => text, projects, workspaces, threads: state.threads, workspace: '/data', mainSection: 'library', sideThread: null, sideBusy: false,
    activeRunRef: { current: null }, taskSelectionRef: ref, dataFolderLoadingRef: { current: false }, threadOpenRequestRef: { current: 0 }, activeThreadIdRef: { current: 'a' },
    initialMessages: [{ id: 'welcome' }], clearPendingAssistantDeltas() {}, chatModeFromThread: value => value,
    setTaskSelection(value) { state.selection = value; }, setSelectionError(value) { state.error = value; },
    setMessages(value) { state.messages = value; }, setThreads(update) { state.threads = update(state.threads); },
    setMainSection(value) { state.section = value; }, setSideThread() {}, setBoundHarness() {}, setTrajectoryEvents() {}, setEvents() {}, setResearchMode() {}, setChangeSets() {}, setPendingAction() {},
    desktopBridge: { getResearchThread: async id => detail(id), markResearchThreadViewed: async () => {}, ...overrides },
  };
  const { transformWithOxc } = await import('vite');
  const { code } = await transformWithOxc(['applyTaskSelection', 'displayThread', 'openResearchThread', 'selectProject'].map(extract).join('\n'), 'task-callbacks.ts');
  const callbacks = new Function('scope', `with(scope) { ${code}; return { openResearchThread, selectProject }; }`)(scope);
  return { ...callbacks, state, ref };
}

test('new selections use only the chosen project workspace and session roots retain historical ownership', async () => {
  const { newTaskSelection, threadTaskSelection, taskDraftKey } = await import('../src/task-selection.ts');
  const selected = newTaskSelection('/data', projects[1], workspaces, 'ws-a');
  assert.deepEqual(selected, { dataRoot: '/data', projectId: 'b', workspaceId: 'ws-b', threadId: null, executionRoot: '/physical/b' });
  const historical = threadTaskSelection('/data', { ...detail('a'), workspace_path: '/physical/old-a' }, workspaces);
  assert.equal(historical.executionRoot, '/physical/old-a');
  assert.throws(() => threadTaskSelection('/data', { ...detail('a'), workspace_id: 'ws-b' }, workspaces), /different project/);
  assert.notEqual(taskDraftKey(selected), taskDraftKey({ ...selected, dataRoot: '/other-data' }));
});

test('Library project selection commits the returned complete task only after loading succeeds', async () => {
  const pending = deferred();
  const h = await harness({ getResearchThread: () => pending.promise });
  const opening = h.selectProject('b');
  assert.equal(h.state.selection.projectId, 'a');
  assert.equal(h.state.selection.threadId, 'a');
  pending.resolve(detail('b'));
  await opening;
  assert.deepEqual(h.state.selection, { dataRoot: '/data', projectId: 'b', workspaceId: 'ws-b', threadId: 'b', executionRoot: '/physical/b' });
  assert.equal(h.state.section, 'library');
  assert.equal(h.state.messages[0].text, 'b');
});

test('failed opening keeps the old coherent task and transcript available', async () => {
  const h = await harness({ getResearchThread: async () => { throw new Error('unavailable'); } });
  const before = h.state.selection;
  assert.equal(await h.openResearchThread(detail('b')), false);
  assert.equal(h.state.selection, before);
  assert.deepEqual(h.state.messages, []);
  assert.match(h.state.error, /unavailable/);
});

test('a slower open cannot take over the task chosen by a newer request', async () => {
  const first = deferred(), second = deferred();
  const h = await harness({ getResearchThread: id => id === 'b' ? first.promise : second.promise });
  const old = h.openResearchThread(detail('b'));
  const recent = h.openResearchThread(detail('a'));
  second.resolve(detail('a')); await recent;
  first.resolve(detail('b')); await old;
  assert.equal(h.state.selection.threadId, 'a');
  assert.equal(h.state.messages[0].text, 'a');
});

module.exports = { extract, detail, projects, workspaces, deferred };

test('an imported thread without local workspace fields resolves its own project default, never the data folder', async () => {
  const { threadTaskSelection, taskDraftKey } = await import('../src/task-selection.ts');
  const imported = { ...detail('cloud-thread', 'b'), workspace_id: null, workspace_path: null };
  const selected = threadTaskSelection('/data', imported, workspaces);
  assert.equal(selected.workspaceId, 'ws-b');
  assert.equal(selected.executionRoot, '/physical/b');
  assert.throws(() => threadTaskSelection('/data', imported, []), /no local execution folder/);
  assert.notEqual(taskDraftKey(selected), taskDraftKey({ ...selected, dataRoot: '/another-data' }));
});
