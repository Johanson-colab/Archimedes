const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createSetup } = require('./research-app-setup.cjs');
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'app-setup-')));
  const dir = path.join(root, 'research-apps', 'sample'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'research-app.json'), JSON.stringify({ schemaVersion: 1, id: 'sample', name: 'Sample', category: 'analysis', runtime: { kind: 'python-http', entry: 'app.py' } }));
  fs.writeFileSync(path.join(dir, 'app.py'), 'print(1)');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, dir };
}
test('setup reviews pinned packages and never overwrites an existing environment', async t => {
  const f = fixture(t), calls = [];
  fs.writeFileSync(path.join(f.dir, 'requirements.txt'), 'rdkit==2026.3.6\n');
  const setup = createSetup({ approve: async ({ packages }) => { assert.deepEqual(packages, ['rdkit==2026.3.6']); return true; }, execute: async (cmd, args) => calls.push([cmd, args]) });
  assert.equal((await setup.setup(f.root, 'sample')).installed, true);
  assert.equal(calls.length, 2); assert.deepEqual(calls[1][1].slice(-1), ['rdkit==2026.3.6']);
  await assert.rejects(setup.setup(f.root, 'sample'), /never replaced/);
});
test('setup rejects hidden package sources, declined approval and source changes', async t => {
  const f = fixture(t), file = path.join(f.dir, 'requirements.txt'); let calls = 0;
  const setup = createSetup({ approve: async () => false, execute: async () => { calls++; } });
  for (const value of ['-r extra.txt', 'numpy', 'pkg @ https://example.com/pkg', '--index-url https://evil.example']) {
    fs.writeFileSync(file, value); await assert.rejects(setup.setup(f.root, 'sample'), /pinned/);
  }
  fs.writeFileSync(file, 'numpy==1.26.4'); await assert.rejects(setup.setup(f.root, 'sample'), /not approved/);
  const changed = createSetup({ approve: async () => { fs.writeFileSync(file, 'numpy==2.0.0'); return true; }, execute: async () => { calls++; } });
  await assert.rejects(changed.setup(f.root, 'sample'), /changed during approval/);
  assert.equal(calls, 0); assert.equal(fs.existsSync(path.join(f.dir, '.venv')), false);
});
test('failed setup preserves the incomplete environment for review', async t => {
  const f = fixture(t); fs.writeFileSync(path.join(f.dir, 'requirements.txt'), 'numpy==1.26.4');
  const setup = createSetup({ approve: async () => true, execute: async () => { throw Error('failed'); } });
  await assert.rejects(setup.setup(f.root, 'sample'), /incomplete .venv was preserved/);
  assert.equal(fs.existsSync(path.join(f.dir, '.venv')), true);
});
test('empty dependency list creates a real local Python environment without network access', { skip: process.platform === 'win32', timeout: 30000 }, async t => {
  const f = fixture(t); fs.writeFileSync(path.join(f.dir, 'requirements.txt'), '# No packages required\n');
  const setup = createSetup({ approve: async () => true });
  assert.equal((await setup.setup(f.root, 'sample')).installed, true);
  assert.ok(fs.statSync(path.join(f.dir, '.venv/bin/python')).isFile());
});
