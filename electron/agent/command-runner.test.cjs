const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { runApprovedCommand, OUTPUT_LIMIT } = require('./command-runner.cjs');
const agent = require('../agent.cjs');
const store = require('../store.cjs');
const modelConfig = require('../model-config.cjs');

function workspace(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'archimedes-command-loop-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('command result includes actual output, exit status, duration and a bounded private log', { skip: process.platform === 'win32' }, async t => {
  const root = workspace(t);
  const result = await runApprovedCommand({ root, cwd: root, command: "sleep 0.15; printf 'stdout-value'; printf 'stderr-value' >&2; exit 7" });
  assert.equal(result.status, 'failed');
  assert.equal(result.exit_code, 7);
  assert.ok(result.duration_ms >= 100);
  assert.match(result.output, /stdout-value/);
  assert.match(result.output, /stderr-value/);
  const file = path.join(root, result.log_path);
  assert.match(fs.readFileSync(file, 'utf8'), /stdout-value/);
  assert.equal(fs.statSync(file).mode & 0o077, 0);
});

test('large command output is bounded for the model while the log is retained', { skip: process.platform === 'win32' }, async t => {
  const root = workspace(t);
  const result = await runApprovedCommand({ root, cwd: root, command: `"${process.execPath}" -e "process.stdout.write('x'.repeat(90000))"` });
  assert.equal(result.status, 'completed');
  assert.equal(result.output.length, OUTPUT_LIMIT);
  assert.equal(result.output_truncated, true);
  assert.equal(fs.statSync(path.join(root, result.log_path)).size, 90_000);
});

test('timeout and cancellation stop a real command', { skip: process.platform === 'win32' }, async t => {
  const root = workspace(t);
  const timeout = await runApprovedCommand({ root, cwd: root, command: 'sleep 10', timeoutSeconds: 0.2 });
  assert.equal(timeout.status, 'timed_out');
  assert.ok(timeout.duration_ms < 5000);
  const controller = new AbortController();
  const pending = runApprovedCommand({ root, cwd: root, command: 'sleep 10', signal: controller.signal });
  setTimeout(() => controller.abort(), 100);
  await assert.rejects(pending, error => error.name === 'AbortError' && error.commandResult.status === 'interrupted');
});

test('approved command output reaches the next model request, and denial never executes', { skip: process.platform === 'win32' }, async t => {
  const root = workspace(t);
  store.openWorkspace(root);
  modelConfig.initializeModelConfig(root);
  fs.writeFileSync(path.join(root, 'model-config.json'), JSON.stringify({ provider: 'custom', baseUrl: 'https://example.test/v1', model: 'fixture', apiKey: 'test' }));
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  let count = 0, toolResult;
  global.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    count += 1;
    if (count === 1) return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: 'call1', type: 'function', function: { name: 'propose_command', arguments: JSON.stringify({ command: "printf 'verified-result'; printf 'created' > generated.txt; exit 7" }) } }] } }] }) };
    toolResult = JSON.parse(request.messages.find(m => m.role === 'tool').content);
    return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ choices: [{ message: { role: 'assistant', content: 'Observed the failure.' } }] }) };
  };
  const result = await agent.runAgent({ prompt: 'Run a check', workspace: root, mode: 'free-chat', origin: 'research', capabilities: { command: 'ask', write: 'ask' }, emit: event => {
    if (event.type === 'approval') {
      assert.equal(event.action.payload.managedByAgent, true);
      store.approveAction(event.action.id);
      agent.resolveApproval(event.action.id, true);
    }
  } });
  assert.equal(result.status, 'completed');
  assert.equal(toolResult.exit_code, 7);
  assert.match(toolResult.output, /verified-result/);
  assert.equal(fs.readFileSync(path.join(root, toolResult.log_path), 'utf8'), 'verified-result');
  assert.ok(result.thread.changeSets.some(changeSet => changeSet.changes.some(change => change.path === 'generated.txt' && change.status === 'created')));

  const task = store.startTask({ prompt: 'deny' });
  const thread = store.createResearchThread({ prompt: 'deny', mode: 'free-chat' });
  const marker = path.join(root, 'must-not-exist');
  const denied = await agent.executeTool({ root, taskId: task.id, threadId: thread.id, call: { id: 'deny', function: { name: 'propose_command', arguments: JSON.stringify({ command: `touch '${marker}'` }) } }, contextItems: [], foundPapers: new Map(), pdfCache: new Map(), capabilities: { command: 'ask' }, emit: event => {
    if (event.type === 'approval') { store.resolveAction(event.action.id, 'rejected'); agent.resolveApproval(event.action.id, false); }
  } });
  assert.equal(JSON.parse(denied.content).approved, false);
  assert.equal(fs.existsSync(marker), false);
});

test('command cwd cannot escape the workspace through a symlink', { skip: process.platform === 'win32' }, async t => {
  const root = workspace(t), outside = workspace(t);
  store.openWorkspace(root);
  const task = store.startTask({ prompt: 'test' });
  const thread = store.createResearchThread({ prompt: 'test', mode: 'free-chat' });
  fs.symlinkSync(outside, path.join(root, 'outside'));
  await assert.rejects(agent.executeTool({ root, taskId: task.id, threadId: thread.id, call: { id: 'escape', function: { name: 'propose_command', arguments: JSON.stringify({ command: 'pwd', cwd: 'outside' }) } }, capabilities: { command: 'ask' }, emit: () => {} }), /outside/);
});

test('interrupting while awaiting approval rejects the pending action and never runs the command', { skip: process.platform === 'win32' }, async t => {
  const root = workspace(t);
  store.openWorkspace(root);
  const task = store.startTask({ prompt: 'test' });
  const thread = store.createResearchThread({ prompt: 'test', mode: 'free-chat' });
  const controller = new AbortController();
  let action;
  await assert.rejects(agent.executeTool({ root, taskId: task.id, threadId: thread.id, call: { id: 'interrupt', function: { name: 'propose_command', arguments: JSON.stringify({ command: 'touch never-ran' }) } }, capabilities: { command: 'ask' }, signal: controller.signal, emit: event => {
    if (event.type === 'approval') { action = event.action; controller.abort(); }
  } }), /interrupted/);
  assert.equal(store.getAction(action.id).status, 'rejected');
  assert.equal(fs.existsSync(path.join(root, 'never-ran')), false);
});
