const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAppAgent } = require('./research-app-agent.cjs');
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'app-agent-'))), dir = path.join(root, 'research-apps', 'sample');
  fs.mkdirSync(path.join(dir, 'public'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'public/index.html'), '<h1>App</h1>');
  fs.writeFileSync(path.join(dir, 'research-app.json'), JSON.stringify({ schemaVersion: 1, id: 'sample', name: 'Sample', category: 'writing', runtime: { kind: 'static', entry: 'public/index.html' }, agents: ['codex', 'claude'] }));
  t.after(() => fs.rmSync(root, { recursive: true, force: true })); return { root, dir };
}
test('Agent requests are opt-in, approved per request and use scoped native adapters', async t => {
  const f = fixture(t), calls = [], approvals = [];
  const api = createAppAgent({ runtime: { status: () => ({ status: 'running' }) }, getConfig: () => ({ profiles: { codex: { binary: 'codex' }, claude: { binary: 'claude' } } }), approve: async value => { approvals.push(value); return true; }, approveTool: async () => false, runNative: async value => { calls.push(value); return 'done'; } });
  assert.equal(await api.run(f.root, 'sample', { backend: 'codex', prompt: 'Summarize this paper' }), 'done');
  assert.equal(calls[0].workspace, f.dir); assert.equal(calls[0].config.permissionMode, 'read-only'); assert.equal(calls[0].ephemeral, true); assert.equal(calls[0].disableSharedEnvironment, true);
  assert.equal(await api.run(f.root, 'sample', { backend: 'claude', prompt: 'Draft a slide' }), 'done');
  assert.equal(calls[1].config.permissionMode, 'ask'); assert.equal(approvals.length, 2);
  await assert.rejects(api.run(f.root, 'sample', { backend: 'opencode', prompt: 'x' }), /not declared/);
  await assert.rejects(api.run(f.root, 'sample', { backend: 'codex', prompt: '' }), /12,000/);
});
test('cancelled approval and changed source never start the Agent', async t => {
  const f = fixture(t); let calls = 0;
  const opts = { runtime: { status: () => ({ status: 'running' }) }, getConfig: () => ({}), runNative: async () => { calls++; } };
  await assert.rejects(createAppAgent({ ...opts, approve: async () => false }).run(f.root, 'sample', { backend: 'codex', prompt: 'x' }), /not approved/);
  await assert.rejects(createAppAgent({ ...opts, approve: async () => { fs.writeFileSync(path.join(f.dir, 'public/index.html'), 'changed'); return true; } }).run(f.root, 'sample', { backend: 'codex', prompt: 'x' }), /changed/);
  assert.equal(calls, 0);
});
test('declared App-local skill instructions accompany the selected backend', async t => {
  const f = fixture(t), file = path.join(f.dir, 'research-app.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8')); manifest.skills = ['paper-lookup'];
  fs.mkdirSync(path.join(f.dir, '.capabilities', 'paper-lookup'), { recursive: true });
  fs.writeFileSync(path.join(f.dir, '.capabilities', 'paper-lookup', 'SKILL.md'), '# Example');
  fs.writeFileSync(file, JSON.stringify(manifest));
  let submitted;
  const api = createAppAgent({ runtime: { status: () => ({ status: 'running' }) }, getConfig: () => ({ profiles: { codex: {} } }), approve: async () => true, approveTool: async () => false, runNative: async args => { submitted = args.turn.user_message; return 'ok'; } });
  await api.run(f.root, 'sample', { backend: 'codex', prompt: 'Look up papers' });
  assert.ok(submitted.includes(path.join(f.dir, '.capabilities', 'paper-lookup', 'SKILL.md')));
});
