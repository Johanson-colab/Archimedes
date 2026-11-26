const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { scaffoldApp } = require('./research-app-scaffold.cjs');
const { readApp } = require('./research-app-runtime.cjs');
const { createAppRepair } = require('./research-app-repair.cjs');
test('repair adapters scope all three backends, preserve approvals, and avoid persisted Codex sessions', async t => {
  const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'app-repair-test-')));
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  const draft = scaffoldApp({ workspace, appId: 'sample' });
  const app = readApp(workspace, 'sample');
  fs.mkdirSync(path.join(draft.directory, '.data')); fs.writeFileSync(path.join(draft.directory, '.data/favorites'), 'preserved');
  const calls = []; let approvals = 0;
  const repair = createAppRepair({ getConfig: () => ({ profiles: { codex: {}, claude: {}, opencode: {} } }), approve: async () => { approvals++; return true; }, approveTool: async () => false, runNative: async options => { calls.push(options); assert.equal(fs.existsSync(path.join(options.workspace, '.data')), false); fs.appendFileSync(path.join(options.workspace, 'public/app.js'), '\n// repaired'); assert.equal(await options.approve({}), false); } });
  for (const backend of ['codex', 'claude', 'opencode']) await repair({ app, backend, error: 'Missing results', attempt: 1, signal: new AbortController().signal });
  assert.equal(approvals, 3);
  for (const call of calls) { assert.notEqual(call.workspace, app.directory); assert.equal(call.disableSharedEnvironment, true); assert.equal(call.bindings.get(), null); assert.match(call.turn.user_message, /Do not weaken existing assertions/); }
  assert.equal(calls[0].ephemeral, true); assert.equal(calls[0].config.permissionMode, 'workspace-write');
  assert.equal(fs.readFileSync(path.join(app.directory, '.data/favorites'), 'utf8'), 'preserved');
  assert.equal(calls[1].config.permissionMode, 'ask'); assert.equal(calls[2].config.permissionMode, 'ask');
});
test('declined repair never launches a native process', async t => {
  const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'app-repair-denied-'))); t.after(() => fs.rmSync(workspace, { recursive: true, force: true })); scaffoldApp({ workspace, appId: 'sample' });
  const repair = createAppRepair({ approve: async () => false, runNative: async () => assert.fail('must not execute') });
  await assert.rejects(repair({ app: readApp(workspace, 'sample'), backend: 'codex' }), /not approved/);
});

test('repairs never overwrite concurrent user edits', async t => {
  const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'app-repair-race-'))); t.after(() => fs.rmSync(workspace, { recursive: true, force: true })); scaffoldApp({ workspace, appId: 'sample' });
  const app = readApp(workspace, 'sample');
  const repair = createAppRepair({ getConfig: () => ({ profiles: { codex: {} } }), approve: async () => true, runNative: async options => {
    fs.writeFileSync(path.join(options.workspace, 'public/app.js'), '// candidate change');
    fs.writeFileSync(path.join(app.directory, 'public/app.js'), '// user edit');
  } });
  await assert.rejects(repair({ app, backend: 'codex' }), /changed during repair/);
  assert.equal(fs.readFileSync(path.join(app.directory, 'public/app.js'), 'utf8'), '// user edit');
});
