const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const backend = require('./codex-backend.cjs');
const backendConfig = require('../agent-backend-config.cjs');

const controllers = new Set();
test.afterEach(() => { for (const controller of controllers) controller.abort(); controllers.clear(); });
function fixture(scenario, overrides = {}) {
  const controller = new AbortController(); controllers.add(controller);
  let peer;
  const events = [], records = [], saves = [];
  class Client extends EventEmitter {
    constructor() { super(); peer = this; this.calls = []; this.replies = []; }
    async start() {}
    async request(method, params) {
      this.calls.push({ method, params });
      if (method === 'account/read') return { account: {} };
      if (method === 'config/read') return { config: { model: 'm' } };
      if (method === 'model/list') return { data: [{ id: 'm', model: 'm', displayName: 'Model', isDefault: true, supportedReasoningEfforts: [{ reasoningEffort: 'high' }], defaultReasoningEffort: 'high' }] };
      if (method === 'thread/start' || method === 'thread/resume') return { thread: { id: 'native-thread' } };
      if (method === 'turn/start' || method === 'thread/compact/start') {
        setImmediate(() => scenario(peer));
        return { turn: { id: 'native-turn' } };
      }
      return {};
    }
    send(method, params = {}) { this.emit('message', { method, params: { threadId: 'native-thread', turnId: 'native-turn', ...params } }); }
    server(id, method, params = {}) { this.emit('message', { id, method, params: { threadId: 'native-thread', turnId: 'native-turn', ...params } }); }
    respond(id, result) { this.replies.push({ id, result }); }
    unsupported(id) { this.replies.push({ id, unsupported: true }); }
    close() { this.closed = true; }
  }
  const args = { config: { binary: 'codex', model: '', effort: '', permissionMode: 'read-only' }, workspace: os.tmpdir(), thread: { id: 'local-thread', turns: [{ id: 'current', user_message: 'Current request' }] }, turn: { id: 'current', user_message: 'Current request' }, context: { messages: [{ role: 'system', content: 'API restriction DO NOT SEND' }, { role: 'user', content: 'API prepared DO NOT SEND' }] }, contextItems: [], signal: controller.signal, emit: e => events.push(e), recordEvent: e => records.push(e), approve: async () => false, bindings: { get: () => null, save: b => saves.push(b) }, Client, ...overrides };
  return { args, events, records, saves, peer: () => peer };
}
function complete(peer, text = 'Answer') {
  peer.send('item/started', { item: { id: 'final', type: 'agentMessage', phase: 'final_answer', text: '' } });
  peer.send('item/agentMessage/delta', { itemId: 'final', delta: text });
  peer.send('item/completed', { item: { id: 'final', type: 'agentMessage', phase: 'final_answer', text } });
  peer.send('turn/completed', { turn: { id: 'native-turn', status: 'completed' } });
}

test('native setup omits API instructions and resumes native history without reimport', async () => {
  const f = fixture(p => complete(p));
  f.args.thread.turns.unshift({ id: 'prior', user_message: 'Visible user', assistant_message: 'Visible assistant' });
  await backend.runCodex(f.args);
  let setup = f.peer().calls.find(x => x.method === 'thread/start').params;
  assert.equal(setup.developerInstructions, undefined);
  assert.equal(setup.baseInstructions, undefined);
  let input = f.peer().calls.find(x => x.method === 'turn/start').params.input[0].text;
  assert.match(input, /Visible user/); assert.match(input, /Visible assistant/); assert.match(input, /Current request/); assert.doesNotMatch(input, /DO NOT SEND/);
  const resumed = fixture(p => complete(p));
  resumed.args.thread.turns.unshift({ id: 'prior', user_message: 'Visible user' });
  resumed.args.bindings.get = () => ({ native_thread_id: 'native-thread', workspace: fs.realpathSync(os.tmpdir()), model: '', last_turn_id: 'prior' });
  await backend.runCodex(resumed.args);
  assert.equal(resumed.peer().calls.find(x => x.method === 'turn/start').params.input[0].text, 'Current request');
});

test('Research uses a native Codex skill input and restores its run on the next native turn', async t => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'archimedes-codex-research-'));
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  const f = fixture(p => {
    p.send('item/started', { item: { id: 'skill-read', type: 'commandExecution', command: `cat '${path.join(workspace, '.agents/skills/archimedes-idea-spark/SKILL.md')}'` } });
    p.send('item/completed', { item: { id: 'skill-read', type: 'commandExecution', command: `cat '${path.join(workspace, '.agents/skills/archimedes-idea-spark/SKILL.md')}'`, exitCode: 0 } });
    complete(p);
  }, { workspace, researchSkill: 'idea-spark' });
  await backend.runCodex(f.args);
  const setup = f.peer().calls.find(c => c.method === 'thread/start').params;
  assert.match(setup.developerInstructions, /IdeaSpark/);
  assert.equal(setup.sandbox, 'read-only');
  const turn = f.peer().calls.find(c => c.method === 'turn/start').params;
  const input = turn.input.find(i => i.type === 'skill');
  assert.equal(input.name, 'archimedes-idea-spark');
  assert.ok(fs.existsSync(input.path));
  assert.equal(turn.sandboxPolicy.type, 'readOnly');
  assert.ok(f.records.some(e => e.type === 'native_activity' && e.payload.activity.kind === 'skill'));
  const originalState = f.records.find(e => e.type === 'research_skill');
  const resumed = fixture(p => complete(p), { workspace });
  resumed.args.thread.events = [originalState];
  await backend.runCodex(resumed.args);
  assert.equal(resumed.records.find(e => e.type === 'research_skill').payload.runRelative, originalState.payload.runRelative);
  assert.match(resumed.peer().calls.find(c => c.method === 'thread/start').params.developerInstructions, /Resume it/);
});

test('permissions stay bounded and explicit effort is validated against native model catalog', async () => {
  assert.equal(backendConfig.normalize().permissionMode, 'ask');
  assert.equal(backendConfig.normalize().effort, '');
  assert.throws(() => backendConfig.normalize({ permissionMode: 'danger-full-access' }), /permission/i);
  const f = fixture(p => complete(p));
  f.args.config = { ...f.args.config, permissionMode: 'workspace-write', model: 'm', effort: 'high' };
  await backend.runCodex(f.args);
  const setup = f.peer().calls.find(x => x.method === 'thread/start').params;
  const turn = f.peer().calls.find(x => x.method === 'turn/start').params;
  assert.equal(setup.sandbox, 'workspace-write'); assert.equal(setup.approvalPolicy, 'on-request'); assert.equal(turn.approvalPolicy, 'on-request');
  assert.equal(turn.sandboxPolicy.type, 'workspaceWrite'); assert.equal(turn.sandboxPolicy.networkAccess, false); assert.equal(turn.effort, 'high');
  const invalid = fixture(p => complete(p)); invalid.args.config.effort = 'imaginary';
  await assert.rejects(backend.runCodex(invalid.args), /effort/i);
  assert.equal(invalid.peer().calls.some(x => x.method === 'turn/start'), false);
  const check = await backendConfig.check(f.args.config, f.args.Client);
  assert.deepEqual(check.models, [{ id: 'm', label: 'Model', efforts: ['high'], defaultEffort: 'high', isDefault: true }]);
});

test('native activities preserve item identities, bound output and separate commentary from final text', async () => {
  const f = fixture(p => {
    p.send('item/started', { item: { id: 'comment', type: 'agentMessage', phase: 'commentary', text: '' } });
    p.send('item/agentMessage/delta', { itemId: 'comment', delta: 'Working on it' });
    p.send('item/completed', { item: { id: 'comment', type: 'agentMessage', phase: 'commentary', text: 'Working on it' } });
    p.send('item/started', { item: { id: 'secret', type: 'reasoning', content: ['hidden reasoning'], summary: ['private'] } });
    for (const id of ['one', 'two']) {
      p.send('item/started', { item: { id, type: 'commandExecution', command: 'echo hello' } });
      for (let i = 0; i < 200; i++) p.send('item/commandExecution/outputDelta', { itemId: id, delta: 'x'.repeat(1000) });
      p.send('item/completed', { item: { id, type: 'commandExecution', command: 'echo hello', status: 'completed', exitCode: 0 } });
    }
    p.send('item/started', { item: { id: 'mcp', type: 'mcpToolCall', server: 'papers', tool: 'lookup', arguments: { query: 'test' } } });
    p.send('item/completed', { item: { id: 'mcp', type: 'mcpToolCall', server: 'papers', tool: 'lookup', status: 'completed', result: { content: [{ text: 'result' }] } } });
    complete(p);
  });
  assert.equal(await backend.runCodex(f.args), 'Answer');
  assert.equal(f.events.filter(e => e.type === 'assistant_delta').map(e => e.delta).join(''), 'Answer');
  const activities = f.events.filter(e => e.type === 'native_activity').map(e => e.activity);
  assert.ok(activities.some(a => a.kind === 'commentary' && a.output === 'Working on it'));
  assert.ok(activities.some(a => /papers.*lookup/.test(a.title)));
  const commands = activities.filter(a => a.kind === 'commandExecution');
  assert.equal(new Set(commands.map(a => a.id)).size, 2);
  assert.ok(commands.every(a => !a.output || a.output.length <= 32768));
  assert.ok(commands.length < 20);
  assert.doesNotMatch(JSON.stringify(f.events) + JSON.stringify(f.records), /hidden reasoning|private|native-thread|native-turn/);
  assert.ok(f.records.filter(e => e.type === 'native_activity').length < 20);
});

test('native usage uses last request rather than lifetime and snapshots plan and diff', async () => {
  const f = fixture(p => {
    for (let i = 1; i <= 100; i++) {
      p.send('thread/tokenUsage/updated', { tokenUsage: { last: { inputTokens: i, cachedInputTokens: 2, outputTokens: 3, totalTokens: i + 3 }, total: { totalTokens: 999999 }, modelContextWindow: 400000 } });
      p.send('turn/plan/updated', { explanation: 'Plan', plan: [{ step: `Step ${i}`, status: 'inProgress' }] });
      p.send('turn/diff/updated', { diff: `diff ${i}` });
    }
    complete(p);
  });
  await backend.runCodex(f.args);
  assert.deepEqual(f.events.findLast(e => e.type === 'native_usage').usage, { inputTokens: 100, cachedInputTokens: 2, outputTokens: 3, totalTokens: 103, modelContextWindow: 400000 });
  assert.equal(f.records.filter(e => e.type === 'native_usage' && e.payload.usage).length, 1);
  assert.equal(f.records.find(e => e.type === 'native_plan').payload.plan.steps[0].step, 'Step 100');
  assert.equal(f.records.find(e => e.type === 'native_diff').payload.diff, 'diff 100');
});

test('steer and questions target active native identity; stale and empty answers fail', async () => {
  let ready;
  const entered = new Promise(r => { ready = r; });
  const f = fixture(p => { p.server(8, 'item/tool/requestUserInput', { itemId: 'question', questions: [{ id: 'choose', header: 'Choice', question: 'Which?', options: [{ label: 'A', description: 'First' }] }] }); setImmediate(ready); });
  const run = backend.runCodex(f.args); run.catch(() => {}); await entered;
  assert.equal((await backend.steerNative('local-thread', 'Focus on tests')).accepted, true);
  const steer = f.peer().calls.find(x => x.method === 'turn/steer').params;
  assert.equal(steer.expectedTurnId, 'native-turn'); assert.equal(steer.threadId, 'native-thread');
  assert.equal(f.records.find(e => e.type === 'native_steer').payload.text, 'Focus on tests');
  const question = f.events.find(e => e.type === 'native_question').question;
  await assert.rejects(backend.answerNativeQuestion('local-thread', question.id, {}), /answer/i);
  await backend.answerNativeQuestion('local-thread', question.id, { choose: ['A'] });
  assert.deepEqual(f.peer().replies, [{ id: 8, result: { answers: { choose: { answers: ['A'] } } } }]);
  await assert.rejects(backend.answerNativeQuestion('local-thread', question.id, { choose: ['A'] }), /pending|stale/i);
  assert.ok(f.events.some(e => e.type === 'native_question_resolved' && e.questionId === question.id));
  complete(f.peer()); await run;
  await assert.rejects(backend.steerNative('local-thread', 'Too late'), /active/i);
});

test('native compaction resumes identical binding, records native context completion and cleans up', async () => {
  const f = fixture(p => {
    p.send('turn/started', { turn: { id: 'native-turn' } });
    p.send('item/started', { item: { id: 'compact', type: 'contextCompaction' } });
    p.send('item/completed', { item: { id: 'compact', type: 'contextCompaction' } });
    p.send('turn/completed', { turn: { id: 'native-turn', status: 'completed' } });
  });
  f.args.thread.turns = [{ id: 'prior' }];
  f.args.bindings.get = () => ({ native_thread_id: 'native-thread', workspace: fs.realpathSync(os.tmpdir()), model: '', last_turn_id: 'prior' });
  const result = await backend.compactNative(f.args);
  assert.equal(result.compacted, true);
  assert.equal(f.peer().calls.filter(c => c.method === 'thread/resume').length, 1);
  assert.equal(f.peer().calls.filter(c => c.method === 'thread/compact/start').length, 1);
  assert.equal(f.peer().calls.some(c => c.method === 'turn/start'), false);
  assert.equal(f.peer().closed, true);
  assert.equal(f.saves.at(-1).last_turn_id, 'prior');
  const dirty = fixture(p => complete(p));
  await assert.rejects(backend.compactNative(dirty.args), /completed|binding|continuity/i);
  const failed = fixture(p => p.send('turn/completed', { turn: { id: 'native-turn', status: 'failed' } }), { thread: f.args.thread, bindings: f.args.bindings });
  await assert.rejects(backend.compactNative(failed.args), /failed/); assert.equal(failed.peer().closed, true);
});

test('final-answer phase takes precedence over partial messages and resolved native questions expire', async () => {
  let ready;
  const entered = new Promise(r => { ready = r; });
  const f = fixture(p => {
    p.send('item/started', { item: { id: 'partial', type: 'agentMessage', phase: 'partial_answer', text: '' } });
    p.send('item/agentMessage/delta', { itemId: 'partial', delta: 'Interim findings' });
    p.send('item/completed', { item: { id: 'partial', type: 'agentMessage', phase: 'partial_answer', text: 'Interim findings' } });
    p.server('question-expire', 'item/tool/requestUserInput', { itemId: 'q', questions: [{ id: 'q', header: 'Choice', question: 'Pick' }] });
    setImmediate(ready);
  });
  const run = backend.runCodex(f.args); run.catch(() => {}); await entered;
  const id = f.events.find(e => e.type === 'native_question').question.id;
  f.peer().send('serverRequest/resolved', { requestId: 'question-expire' });
  await assert.rejects(backend.answerNativeQuestion('local-thread', id, { q: ['Answer'] }), /pending|stale/);
  assert.ok(f.events.some(e => e.type === 'native_question_resolved' && e.questionId === id));
  complete(f.peer()); assert.equal(await run, 'Answer');
  assert.ok(f.events.some(e => e.type === 'native_activity' && e.activity.output === 'Interim findings'));
  assert.equal(f.events.filter(e => e.type === 'assistant_delta').map(e => e.delta).join(''), 'Answer');
});

test('compaction timeout and abort close clients and leave uncertain bindings dirty', async () => {
  const binding = { native_thread_id: 'native-thread', workspace: fs.realpathSync(os.tmpdir()), model: '', last_turn_id: 'prior' };
  for (const abort of [false, true]) {
    const controller = new AbortController();
    const f = fixture(() => { if (abort) controller.abort(); });
    f.args.thread.turns = [{ id: 'prior' }]; f.args.bindings.get = () => binding;
    if (abort) f.args.signal = controller.signal;
    await assert.rejects(backend.compactNative({ ...f.args, timeoutMs: 25 }), /timed out|interrupted/);
    assert.equal(f.peer().closed, true); assert.equal(f.saves.at(-1).last_turn_id, null);
    await assert.rejects(backend.steerNative('local-thread', 'stale'), /active/);
  }
});

test('one-shot network command approval displays endpoint and never accepts policy grants', async () => {
  let ready;
  const entered = new Promise(r => { ready = r; });
  const f = fixture(p => {
    p.server(17, 'item/commandExecution/requestApproval', { itemId: 'command', command: 'curl https://example.org', networkApprovalContext: { host: 'example.org', protocol: 'https' }, proposedNetworkPolicyAmendments: [{ action: 'allow', host: 'example.org' }] });
    p.server(18, 'item/commandExecution/requestApproval', { itemId: 'command', command: 'echo grant', additionalPermissions: { network: { enabled: true } } });
    setImmediate(ready);
  });
  const approvals = []; f.args.approve = async payload => { approvals.push(payload); return true; };
  const run = backend.runCodex(f.args); run.catch(() => {}); await entered;
  assert.equal(approvals.length, 1); assert.match(approvals[0].command, /Network access for this command only: https:\/\/example.org/);
  assert.deepEqual(f.peer().replies, [{ id: 17, result: { decision: 'accept' } }, { id: 18, result: { decision: 'decline' } }]);
  complete(f.peer()); await run;
});

test('resolved native approval expires its local wait and never replies after expiration', async () => {
  let ready, approvalSignal;
  const entered = new Promise(r => { ready = r; });
  const f = fixture(p => { p.server(31, 'item/commandExecution/requestApproval', { itemId: 'c', command: 'echo approval' }); });
  f.args.approve = payload => { approvalSignal = payload.signal; ready(); return new Promise(resolve => payload.signal?.addEventListener('abort', () => resolve(false), { once: true })); };
  const run = backend.runCodex(f.args); run.catch(() => {}); await entered;
  f.peer().send('serverRequest/resolved', { requestId: 31 });
  assert.equal(approvalSignal?.aborted, true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.peer().replies.length, 0);
  complete(f.peer()); await run;
});

test('explicit effort uses the effective native configuration when model is left empty', async () => {
  const f = fixture(p => complete(p)); f.args.config.effort = 'high';
  await backend.runCodex(f.args);
  assert.equal(f.peer().calls.some(c => c.method === 'config/read'), true);
  assert.equal(f.peer().calls.find(c => c.method === 'turn/start').params.effort, 'high');
});

test('oversized file changes are identified as truncated and never approved from incomplete display', async () => {
  let ready;
  const entered = new Promise(r => { ready = r; });
  const f = fixture(p => {
    p.send('item/started', { item: { id: 'files', type: 'fileChange', changes: [{ path: 'large.txt', kind: { type: 'update' }, diff: '+'.repeat(200000) }] } });
    p.server(43, 'item/fileChange/requestApproval', { itemId: 'files' }); setImmediate(ready);
  });
  let approved = false; f.args.approve = async () => { approved = true; return true; };
  const run = backend.runCodex(f.args); run.catch(() => {}); await entered;
  assert.equal(approved, false); assert.deepEqual(f.peer().replies, [{ id: 43, result: { decision: 'decline' } }]);
  assert.ok(f.events.some(e => /truncated/i.test(e.detail)));
  complete(f.peer()); await run;
});

test('snapshot persistence failure still closes the native client and releases active handles', async () => {
  const f = fixture(p => { p.send('thread/tokenUsage/updated', { tokenUsage: { last: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1, totalTokens: 2 }, modelContextWindow: 200000 } }); complete(p); });
  f.args.recordEvent = event => { if (event.type === 'native_usage' && event.payload.usage) throw new Error('Snapshot storage unavailable'); };
  await assert.rejects(backend.runCodex(f.args), /Snapshot storage unavailable/);
  assert.equal(f.peer().closed, true);
  assert.equal(f.saves.at(-1).last_turn_id, null);
  await assert.rejects(backend.steerNative('local-thread', 'stale'), /active/);
});

test('aggregate visible-history import fails before starting a native operation and preserves stored turns', async () => {
  const f = fixture(p => complete(p));
  const turns = Array.from({ length: 30 }, (_, index) => ({ id: `prior-${index}`, user_message: 'u'.repeat(20000), assistant_message: 'a'.repeat(20000) }));
  f.args.thread.turns.unshift(...turns);
  await assert.rejects(backend.runCodex(f.args), /visible.*history.*limit|history.*too large/i);
  assert.equal(f.peer(), undefined);
  assert.equal(f.saves.length, 0);
  assert.equal(f.args.thread.turns[0].user_message.length, 20000);
  assert.equal(f.args.thread.turns.length, 31);
});

test('resumed native history is authoritative even when old visible history exceeds import limits', async () => {
  const f = fixture(p => complete(p));
  f.args.thread.turns.unshift({ id: 'prior', user_message: 'u'.repeat(1_100_000) });
  f.args.bindings.get = () => ({ native_thread_id: 'native-thread', workspace: fs.realpathSync(os.tmpdir()), model: '', last_turn_id: 'prior' });
  assert.equal(await backend.runCodex(f.args), 'Answer');
  assert.equal(f.peer().calls.find(c => c.method === 'turn/start').params.input[0].text, 'Current request');
});

test('native question answers preserve prototype-like IDs as own JSON keys', async () => {
  let ready;
  const entered = new Promise(r => { ready = r; });
  const f = fixture(p => { p.server(71, 'item/tool/requestUserInput', { itemId: 'prototype-question', questions: [{ id: '__proto__', header: 'Choice', question: 'Choose' }, { id: 'constructor', header: 'Choice', question: 'Choose again' }] }); setImmediate(ready); });
  const run = backend.runCodex(f.args); run.catch(() => {}); await entered;
  const questionId = f.events.find(e => e.type === 'native_question').question.id;
  await backend.answerNativeQuestion('local-thread', questionId, Object.fromEntries([['__proto__', ['A']], ['constructor', ['B']]]));
  const answers = JSON.parse(JSON.stringify(f.peer().replies[0].result)).answers;
  assert.equal(Object.hasOwn(answers, '__proto__'), true);
  assert.deepEqual(answers.__proto__, { answers: ['A'] });
  assert.deepEqual(answers.constructor, { answers: ['B'] });
  complete(f.peer()); await run;
});

test('malformed native question IDs are rejected rather than coerced or truncated', async () => {
  let ready;
  const entered = new Promise(r => { ready = r; });
  const f = fixture(p => {
    for (const [index, id] of [undefined, null, 7, '', '   ', 'q'.repeat(201)].entries()) p.server(80 + index, 'item/tool/requestUserInput', { itemId: `bad-${index}`, questions: [{ id, header: 'Choice', question: 'Choose' }] });
    setImmediate(ready);
  });
  const run = backend.runCodex(f.args); run.catch(() => {}); await entered;
  assert.equal(f.events.some(e => e.type === 'native_question'), false);
  assert.equal(f.peer().replies.filter(r => r.unsupported).length, 6);
  complete(f.peer()); await run;
});

test('delayed native output emitter failures reject the run without an uncaught exception', async () => {
  const controller = new AbortController();
  const f = fixture(p => {
    p.send('item/started', { item: { id: 'delayed', type: 'commandExecution', command: 'echo delayed' } });
    p.send('item/commandExecution/outputDelta', { itemId: 'delayed', delta: 'delayed output' });
  });
  f.args.signal = controller.signal;
  f.args.emit = event => { if (event.type === 'native_activity' && event.activity.output) throw new Error('Owning Work window was destroyed'); };
  const fallback = setTimeout(() => controller.abort(), 250);
  try { await assert.rejects(backend.runCodex(f.args), /Owning Work window was destroyed/); }
  finally { clearTimeout(fallback); }
  assert.equal(f.peer().closed, true);
  assert.equal(f.saves.at(-1).last_turn_id, null);
  await assert.rejects(backend.steerNative('local-thread', 'stale'), /active/);
});


test('all three permission presets reach both native setup and turn requests', async () => {
  for (const [mode, sandbox, policy, reviewer, turnType] of [
    ['ask', 'workspace-write', 'on-request', 'user', 'workspaceWrite'],
    ['auto-review', 'workspace-write', 'on-request', 'auto_review', 'workspaceWrite'],
    ['full-access', 'danger-full-access', 'never', 'user', 'dangerFullAccess'],
  ]) {
    const f = fixture(p => complete(p)); f.args.config.permissionMode = mode;
    await backend.runCodex(f.args);
    const setup = f.peer().calls.find(c => c.method === 'thread/start').params;
    const turn = f.peer().calls.find(c => c.method === 'turn/start').params;
    assert.equal(setup.sandbox, sandbox);
    assert.equal(setup.approvalPolicy, policy);
    assert.equal(setup.approvalsReviewer, reviewer);
    assert.equal(turn.approvalPolicy, policy);
    assert.equal(turn.approvalsReviewer, reviewer);
    assert.equal(turn.sandboxPolicy.type, turnType);
    assert.equal(backendConfig.normalize({ permissionMode: mode }).permissionMode, mode);
  }
});

test('model catalog lookup closes the native client without starting a chat', async () => {
  const f = fixture(p => complete(p));
  const result = await backendConfig.listCodexModelCatalog({ backend: 'codex', binary: 'codex', model: '' }, f.args.Client);
  assert.equal(result.effectiveModelId, 'm');
  assert.deepEqual(result.models[0].efforts, ['high']);
  assert.deepEqual(f.peer().calls.map(call => call.method), ['model/list', 'config/read']);
  assert.equal(f.peer().closed, true);
});
