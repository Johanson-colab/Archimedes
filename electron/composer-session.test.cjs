const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../src/App.tsx'), 'utf8');
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function extract(name) {
  const start = source.search(new RegExp(`^  (?:async )?function ${name}\\(`, 'm'));
  assert.ok(start >= 0, name);
  const end = source.slice(start + 1).search(/^  (?:async )?function /m);
  assert.ok(end >= 0, `next function after ${name}`);
  return source.slice(start, start + 1 + end);
}
const owner = project => ({ dataRoot: '/data', projectId: project, workspaceId: `ws-${project}`, threadId: project, executionRoot: `/physical/${project}` });
const thread = (id, project = id) => ({ id, project_id: project, workspace_id: `ws-${project}`, workspace_path: `/physical/${project}`, messages: [], events: [], turns: [], changeSets: [] });
async function callbacks(names, overrides = {}) {
  const helpers = { ...await import('../src/task-selection.ts'), ...await import('../src/composer-session.ts') };
  const state = { sessions: {}, displayed: [], messages: [], events: [], threads: [], busy: false };
  const scope = {
    ...helpers, crypto: global.crypto, t: text => text,
    taskSelectionRef: { current: owner('a') }, dataFolderLoadingRef: { current: false }, activeThreadIdRef: { current: 'a' }, activeRunRef: { current: null }, commandLockRef: { current: false }, threadOpenRequestRef: { current: 0 },
    analysisSessionsRef: { current: new Map() }, analysisHandoffsRef: { current: new Map() }, workspaces: [],
    researchMode: 'free-chat', reasoningEffort: 'medium', contextLength: 'standard', contextItems: [], activeThreadId: 'a',
    threadVisibility: 'project', selectedHarness: 'api', selectedNativeBackend: null, agentBusy: false,
    clearPendingAssistantDeltas() {}, setResearchMode() {}, setInterrupting() {}, setRunningOwnerKey() {}, setRunningThreadId() {}, setBoundHarness() {},
    setAgentBusy(value) { state.busy = value; }, setNativeStream() {}, setNativeQuestions() {}, setMainSection() {}, setPendingAction() {}, setTrajectoryEvents() {}, setChangeSets() {},
    setEvents(value) { state.events = typeof value === 'function' ? value(state.events) : value; },
    setMessages(value) { state.messages = typeof value === 'function' ? value(state.messages) : value; },
    setThreads(update) { state.threads = update(state.threads); },
    updateComposer(key, update) { state.sessions = helpers.updateComposerSession(state.sessions, key, update); },
    setContextItems(update, key) { scope.updateComposer(key, session => ({ ...session, items: update(session.items) })); },
    applyTaskSelection(value) { state.displayed.push(value); scope.taskSelectionRef.current = value; },
    displayThread(value) { state.displayed.push(value); },
    desktopBridge: {}, ...overrides,
  };
  const { transformWithOxc } = await import('vite');
  const { code } = await transformWithOxc(names.map(extract).join('\n'), 'composer-callbacks.ts');
  const actual = new Function('scope', `with(scope) { ${code}; return { ${names.join(', ')} }; }`)(scope);
  return { ...actual, state, scope, key: project => helpers.taskDraftKey(owner(project)), threadKey: (id, project = id) => helpers.taskDraftKey(helpers.threadTaskSelection("/data", thread(id, project), [])) };
}

test('attachment and pending request updates are isolated by session, including delayed adds', async () => {
  const { getComposerSession, updateComposerSession } = await import('../src/composer-session.ts');
  let sessions = {};
  const addToA = () => { sessions = updateComposerSession(sessions, 'a', current => ({ ...current, items: [...current.items, { id: 'a-file' }] })); };
  sessions = updateComposerSession(sessions, 'b', current => ({ ...current, items: [{ id: 'b-file' }], request: { id: 'b-draft', text: 'Keep B' } }));
  addToA();
  assert.equal(getComposerSession(sessions, 'a').items[0].id, 'a-file');
  assert.equal(getComposerSession(sessions, 'b').items[0].id, 'b-file');
  assert.equal(getComposerSession(sessions, 'b').request.text, 'Keep B');
});

test('a failed run after switching sessions reports only to the original composer', async () => {
  const pending = deferred();
  const h = await callbacks(['submitPrompt'], { desktopBridge: { runAgent: () => pending.promise } });
  const running = h.submitPrompt('A question');
  h.scope.taskSelectionRef.current = owner('b'); h.scope.activeThreadIdRef.current = 'b';
  h.state.messages = [{ id: 'b-message', text: 'B transcript' }];
  pending.reject(new Error('offline'));
  assert.equal(await running, false);
  assert.deepEqual(h.state.messages, [{ id: 'b-message', text: 'B transcript' }]);
  assert.match(h.state.sessions[h.key('a')].error, /offline/);
  assert.equal(h.state.sessions[h.key('b')], undefined);
});

test('a delayed successful run clears only submitted attachment objects in its owner', async () => {
  const pending = deferred(), submitted = { id: 'same-id', name: 'A old file' }, replacement = { id: 'same-id', name: 'A new file' };
  let input;
  const h = await callbacks(['submitPrompt'], { contextItems: [submitted], desktopBridge: { runAgent: value => { input = value; return pending.promise; } } });
  h.scope.updateComposer(h.key('a'), current => ({ ...current, items: [submitted] }));
  const running = h.submitPrompt('A question');
  h.scope.taskSelectionRef.current = owner('b'); h.scope.activeThreadIdRef.current = 'b';
  h.scope.updateComposer(h.key('a'), current => ({ ...current, items: [replacement] }));
  h.scope.updateComposer(h.key('b'), current => ({ ...current, items: [{ id: 'same-id', name: 'B file' }] }));
  pending.resolve({ threadId: 'a', thread: thread('a'), actions: [] });
  assert.equal(await running, true);
  assert.match(input.clientRunId, /^research-chat:/);
  assert.equal(input.workspace, '/physical/a');
  assert.equal(input.workspaceId, 'ws-a');
  assert.equal(h.state.sessions[h.key('a')].items[0], replacement);
  assert.equal(h.state.sessions[h.key('b')].items[0].name, 'B file');
  assert.deepEqual(h.state.displayed, []);
});

test('analysis creation preserves the originating draft and reuses only its owner plus input identity', async () => {
  let creates = 0;
  const h = await callbacks(['queueComposerText', 'continueAnalysisInChat'], { desktopBridge: {
    createResearchThread: async input => { creates++; return thread(`analysis-${creates}`, input.projectId); },
    getResearchThread: async id => thread(id, 'a'),
  } });
  h.scope.updateComposer(h.key('a'), current => ({ ...current, request: { id: 'original', text: 'Keep my chat draft' } }));
  await h.continueAnalysisInChat('First analysis question', { id: 'csv-1', name: 'same.csv' }, owner('a'), () => true);
  await h.continueAnalysisInChat('Second analysis question', { id: 'csv-1', name: 'same.csv' }, owner('a'), () => true);
  assert.equal(creates, 1);
  assert.equal(h.state.sessions[h.key('a')].request.text, 'Keep my chat draft');
  assert.equal(h.state.sessions[h.threadKey('analysis-1', 'a')].request.text, 'First analysis question\n\nSecond analysis question');
  await h.continueAnalysisInChat('Different input', { id: 'csv-2', name: 'same.csv' }, owner('a'), () => true);
  await assert.rejects(h.continueAnalysisInChat('Wrong current project', { id: 'csv-1', name: 'same.csv' }, owner('b'), () => true), /Select a project/);
  h.scope.taskSelectionRef.current = owner('b');
  await h.continueAnalysisInChat('Different project', { id: 'csv-1', name: 'same.csv' }, owner('b'), () => true);
  assert.equal(creates, 3);
});

test('analysis creation failure keeps its source intact and a late success cannot hijack newer input', async () => {
  const pending = deferred();
  const h = await callbacks(['queueComposerText', 'continueAnalysisInChat'], { desktopBridge: { createResearchThread: () => pending.promise } });
  let current = true;
  const handoff = h.continueAnalysisInChat('Old input question', { id: 'csv-1', name: 'data.csv' }, owner('a'), () => current);
  current = false;
  pending.resolve(thread('analysis', 'a')); await handoff;
  assert.deepEqual(h.state.displayed, []);
  assert.equal(h.state.sessions[h.threadKey('analysis', 'a')].request.text, 'Old input question');
  h.scope.desktopBridge.createResearchThread = async () => { throw new Error('creation failed'); };
  await assert.rejects(h.continueAnalysisInChat('New input question', { id: 'csv-2', name: 'data.csv' }, owner('a'), () => true), /creation failed/);
  assert.equal(h.scope.taskSelectionRef.current.threadId, 'a');
  assert.equal(h.state.sessions[h.key('a')], undefined);
});

test('opening a hidden home or palette app waits for enable success and reports failure', async () => {
  const pending = deferred();
  const changes = [];
  const h = await callbacks(['openResearchApp'], { hiddenCoreModules: new Set(['reproduce']),
    setCoreModuleEnabled: () => pending.promise, setMainSection: section => changes.push(section),
    setSelectionError: error => { changes.error = error; }, setDailyStartMode() {}, setImageCreationOpened() {}, setDataChartsOpened() {}, setDataAnalysisOpened() {},
  });
  const opening = h.openResearchApp('reproduce');
  assert.deepEqual([...changes], []);
  pending.resolve(); await opening;
  assert.deepEqual([...changes], ['reproduce']);
  h.scope.setCoreModuleEnabled = async () => { throw new Error('cannot save settings'); };
  await h.openResearchApp('reproduce');
  assert.deepEqual([...changes], ['reproduce']);
  assert.match(changes.error, /Try again/);
});

test('new-task approvals stay reachable without letting late events adopt another draft', async () => {
  const { taskDraftKey } = await import('../src/task-selection.ts');
  const selection = { ...owner('a'), threadId: null };
  let receive, pendingAction = null, visibleEvents = [], running, flushed = 0;
  const start = source.indexOf('    const unsubscribe = desktopBridge.onAgentEvent((event) => {');
  const end = source.indexOf('\n    return unsubscribe;', start);
  assert.ok(start > 0 && end > start);
  const scope = {
    taskDraftKey, desktopBridge: { onAgentEvent(callback) { receive = callback; return () => {}; } },
    activeRunRef: { current: { id: 'run-a', ownerKey: taskDraftKey(selection), selection, threadId: null } },
    taskSelectionRef: { current: selection }, activeThreadIdRef: { current: null }, threadsRef: { current: [thread('created-a', 'a')] },
    refreshingThreadsRef: { current: false }, setRunningThreadId(value) { running = value; },
    setPendingAction(value) { pendingAction = value; }, setThreads() {}, setEvents(update) { visibleEvents = update(visibleEvents); },
    setArtifactsVersion() {}, setChangeSets() {}, upsertChangeSet() {}, setInterrupting() {}, setNativeQuestions() {}, flushAssistantDeltas() { flushed++; },
  };
  const { transformWithOxc } = await import('vite');
  const { code } = await transformWithOxc(source.slice(start, end), 'agent-event-callback.ts');
  new Function('scope', `with(scope) { ${code} }`)(scope);
  receive({ type: 'approval', title: 'Approve write', detail: 'A request', clientRunId: 'run-a', threadId: 'created-a', action: { id: 'approval-a' } });
  assert.equal(pendingAction.id, 'approval-a');
  assert.equal(running, 'created-a');
  assert.equal(scope.activeThreadIdRef.current, null, 'no thread is adopted without complete context');
  pendingAction = null; visibleEvents = [];
  scope.taskSelectionRef.current = { ...owner('b'), threadId: null };
  receive({ type: 'approval', title: 'Late A write', clientRunId: 'run-a', threadId: 'created-a', action: { id: 'late-a' } });
  assert.equal(pendingAction, null);
  assert.deepEqual(visibleEvents, []);
  assert.equal(scope.activeThreadIdRef.current, null);
  running = undefined;
  receive({ type: 'approval', clientRunId: 'unrelated-run', threadId: 'other', action: { id: 'other' } });
  assert.equal(running, undefined);
  scope.taskSelectionRef.current = selection;
  receive({ type: 'incomplete', title: 'Response incomplete', detail: 'Missing terminal event', clientRunId: 'run-a', threadId: 'created-a' });
  assert.equal(flushed, 1);
  assert.equal(pendingAction, null);
  assert.equal(scope.activeRunRef.current.pendingAction, null);
  assert.equal(visibleEvents.at(-1).state, 'waiting');
});

test('a newly created session receives later text, attachments and queued follow-ups from its original draft only', async () => {
  const { taskDraftKey } = await import('../src/task-selection.ts');
  const sourceKey = taskDraftKey({ ...owner('a'), threadId: null });
  const stored = new Map([[sourceKey, { text: 'Later A typing', selectionStart: 14, selectionEnd: 14 }], ['b', { text: 'Keep B typing' }]]);
  const composerSessionsRef = { current: {} }, queuedPromptScopesRef = { current: { [sourceKey]: [{ draft: 'A queued' }], b: [{ draft: 'B queued' }] } };
  const h = await callbacks(['queueComposerText', 'moveNewTaskComposer'], {
    composerSessionsRef, queuedPromptScopesRef,
    readComposerDraft: key => stored.get(key) ?? null,
    writeComposerDraft: (key, value) => value ? stored.set(key, value) : stored.delete(key),
    updateQueuedPrompts(key, update) { queuedPromptScopesRef.current[key] = typeof update === 'function' ? update(queuedPromptScopesRef.current[key] ?? []) : update; },
  });
  const originalUpdate = h.scope.updateComposer;
  h.scope.updateComposer = (key, update) => { originalUpdate(key, update); composerSessionsRef.current = h.state.sessions; };
  h.scope.taskSelectionRef.current = owner('b');
  h.scope.updateComposer(sourceKey, current => ({ ...current, items: [{ id: 'later-a-file' }] }));
  h.scope.updateComposer(h.key('b'), current => ({ ...current, items: [{ id: 'b-file' }] }));
  h.moveNewTaskComposer(sourceKey, h.threadKey('created-a', 'a'));
  assert.equal(stored.get(h.threadKey('created-a', 'a')).text, 'Later A typing');
  assert.equal(stored.has(sourceKey), false);
  assert.equal(stored.get('b').text, 'Keep B typing');
  assert.equal(h.state.sessions[h.threadKey('created-a', 'a')].items[0].id, 'later-a-file');
  assert.equal(h.state.sessions[h.key('b')].items[0].id, 'b-file');
  assert.equal(queuedPromptScopesRef.current[h.threadKey('created-a', 'a')][0].draft, 'A queued');
  assert.equal(queuedPromptScopesRef.current.b[0].draft, 'B queued');
});

test('the same imported cloud thread in different data folders cannot share text, attachments or pending handoffs', async () => {
  const { taskDraftKey, threadTaskSelection } = await import('../src/task-selection.ts');
  const { getComposerSession, updateComposerSession } = await import('../src/composer-session.ts');
  const a = taskDraftKey(threadTaskSelection('/data-a', thread('same-cloud-thread', 'a'), []));
  const b = taskDraftKey(threadTaskSelection('/data-b', thread('same-cloud-thread', 'a'), []));
  assert.notEqual(a, b);
  let sessions = updateComposerSession({}, a, current => ({ ...current, items: [{ id: 'a-file' }], request: { id: 'a-request', text: 'A handoff' } }));
  sessions = updateComposerSession(sessions, b, current => ({ ...current, items: [{ id: 'b-file' }] }));
  assert.equal(getComposerSession(sessions, a).request.text, 'A handoff');
  assert.equal(getComposerSession(sessions, b).request, null);
  assert.equal(getComposerSession(sessions, b).items[0].id, 'b-file');

  // Execute the real localStorage reader, including its legacy draft migration.
  const prefix = source.match(/const COMPOSER_DRAFT_STORAGE_PREFIX = ("[^"]+");/)[1];
  const start = source.indexOf('function readComposerDraft('), end = source.indexOf('\nfunction writeComposerDraft(', start);
  const stored = new Map([[JSON.parse(prefix) + 'same-cloud-thread', JSON.stringify({ text: 'Legacy unsent text' })]]);
  const localStorage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) };
  const { transformWithOxc } = await import('vite');
  const { code } = await transformWithOxc(`const COMPOSER_DRAFT_STORAGE_PREFIX = ${prefix};\n${source.slice(start, end)}`, 'composer-reader.ts');
  const read = new Function('window', `${code}; return readComposerDraft;`)({ localStorage });
  assert.equal(read(a).text, 'Legacy unsent text');
  assert.equal(read(b), null, 'the legacy unscoped draft is claimed once, not cloned into another data folder');
  stored.set(JSON.parse(prefix) + b, JSON.stringify({ text: 'Independent B text' }));
  assert.equal(read(a).text, 'Legacy unsent text');
  assert.equal(read(b).text, 'Independent B text');
});

test('failed send restoration keeps the failed prompt and later typing in the original stored scope', async () => {
  const { appendComposerText } = await import('../src/composer-session.ts');
  const start = source.indexOf('    if (!sent) {\n      const laterText = composerRef.current?.value');
  const end = source.indexOf('\n    requestAnimationFrame(', start);
  assert.ok(start > 0 && end > start);
  const { transformWithOxc } = await import('vite');
  const { code } = await transformWithOxc(source.slice(start, end), 'restore-failed-draft.ts');
  for (const mounted of [true, false]) {
    const saved = new Map([['owner-a', { text: 'Later A typing' }], ['owner-b', { text: 'Keep B typing' }]]);
    let prompt;
    const scope = { sent: false, draft: 'Failed A question', draftKey: 'owner-a', newChatMode: 'standard', appendComposerText,
      composerRef: { current: mounted ? { value: 'Later A typing' } : null },
      readComposerDraft: key => saved.get(key), writeComposerDraft: (key, value) => saved.set(key, value), setPrompt: value => { prompt = value; } };
    new Function('scope', `with(scope) { ${code} }`)(scope);
    assert.equal(saved.get('owner-a').text, 'Failed A question\n\nLater A typing');
    assert.equal(prompt, saved.get('owner-a').text);
    assert.equal(saved.get('owner-b').text, 'Keep B typing');
  }
});
