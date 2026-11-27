// Regression probes against unmodified application modules. No provider traffic.
// All databases/configuration live in a unique OS temp directory and are removed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const repo = path.resolve(__dirname, '../../../..');

if (process.argv[2] === '--seed-interrupted') {
  const store = require(path.join(repo, 'electron/store.cjs'));
  store.openWorkspace(process.argv[3]);
  const thread = store.createResearchThread({ prompt: 'Interrupted task', mode: 'standard' });
  const task = store.startTask({ prompt: 'Interrupted task' });
  const turn = store.startResearchTurn({ threadId: thread.id, taskId: task.id, prompt: task.prompt, mode: 'standard' });
  const action = store.createAction({ taskId: task.id, kind: 'command', payload: { command: 'printf review-only', cwd: process.argv[3] } });
  process.stdout.write(JSON.stringify({ threadId: thread.id, turnId: turn.id, actionId: action.id }));
} else {
  test('an in-flight API turn remains bound to its original database after another workspace opens', async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'archimedes-db-review-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const dataA = path.join(root, 'a'), dataB = path.join(root, 'b');
    fs.mkdirSync(dataA); fs.mkdirSync(dataB);
    const store = require(path.join(repo, 'electron/store.cjs'));
    const model = require(path.join(repo, 'electron/model-config.cjs'));
    const agent = require(path.join(repo, 'electron/agent.cjs'));
    model.initializeModelConfig(path.join(root, 'settings'));
    model.saveModelConfig({ provider: 'custom', baseUrl: 'https://provider.invalid/v1', model: 'review-fake', apiKey: 'fake-review-key-never-sent' });
    store.openWorkspace(dataA);
    const thread = store.createResearchThread({ prompt: 'Give one answer', mode: 'standard' });
    let release, reached;
    const gate = new Promise(resolve => { release = resolve; });
    const providerReached = new Promise(resolve => { reached = resolve; });
    const originalFetch = global.fetch;
    global.fetch = async url => {
      assert.ok(String(url).startsWith('https://provider.invalid/'), 'unexpected transport target');
      reached(); await gate;
      return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: 'Completed fake-provider answer.' } }] }) };
    };
    t.after(() => { global.fetch = originalFetch; });
    const outcome = agent.runAgent({ prompt: 'Give one answer', workspace: dataA, threadId: thread.id })
      .then(value => ({ value }), error => ({ error: error.message }));
    await providerReached;
    // This is exactly what workspace:open in another idle window does to store.
    store.openWorkspace(dataB);
    release();
    const result = await outcome;
    store.openWorkspace(dataA);
    const persisted = store.getResearchThread(thread.id);
    console.log(JSON.stringify({ probe: 'database-binding', rejection: result.error || null, threadStatus: persisted.status, turnStatus: persisted.turns[0].status, answer: persisted.turns[0].assistant_message }));
    assert.equal(result.error, undefined, 'the original turn must finish independently of another window');
    assert.equal(persisted.turns[0].assistant_message, 'Completed fake-provider answer.');
  });

  test('reopening after the owning process exits reconciles turns and stale approvals', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'archimedes-recovery-review-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const child = spawnSync(process.execPath, [__filename, '--seed-interrupted', root], { encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr);
    const ids = JSON.parse(child.stdout);
    const store = require(path.join(repo, 'electron/store.cjs'));
    const agent = require(path.join(repo, 'electron/agent.cjs'));
    store.openWorkspace(root);
    const thread = store.getResearchThread(ids.threadId);
    const action = store.getAction(ids.actionId);
    const stopped = agent.interruptAgent(ids.threadId);
    let archiveError = '';
    try { store.archiveResearchThread(ids.threadId); } catch (error) { archiveError = error.message; }
    console.log(JSON.stringify({ probe: 'process-recovery', threadStatus: thread.status, turnStatus: thread.turns[0].status, actionStatus: action.status, interruptResult: stopped, archiveError }));
    assert.notEqual(thread.status, 'running', 'there is no surviving owner for this running record');
    assert.notEqual(action.status, 'pending', 'an approval from an exited process must expire');
  });
}
