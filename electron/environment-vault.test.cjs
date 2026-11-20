const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createEnvironmentVault } = require('./environment-vault.cjs');
const safeStorage = { isEncryptionAvailable: () => true, encryptString: value => Buffer.from(value.split('').reverse().join('')), decryptString: value => value.toString().split('').reverse().join('') };
function fixture(t, storage = safeStorage) { const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'environment-vault-')); t.after(() => fs.rmSync(directory, { recursive: true, force: true })); return { directory, vault: createEnvironmentVault({ directory, safeStorage: storage }) }; }
test('stores encrypted values locally and returns only names across save, restart, replace and delete', t => {
  const { directory, vault } = fixture(t); const secret = 'token-secret-123';
  assert.deepEqual(vault.save({ name: 'HF_TOKEN', value: secret }), [{ name: 'HF_TOKEN', shared: false }]);
  const disk = fs.readFileSync(path.join(directory, 'environment-vault.json'), 'utf8'); assert.ok(!disk.includes(secret));
  const restored = createEnvironmentVault({ directory, safeStorage }); assert.deepEqual(restored.list(), [{ name: 'HF_TOKEN', shared: false }]);
  restored.save({ name: 'HF_TOKEN', value: 'replacement' }); assert.deepEqual(restored.remove('HF_TOKEN'), []);
});
test('rejects invalid names, empty values and unavailable encryption without writing', t => {
  const { directory, vault } = fixture(t, { ...safeStorage, isEncryptionAvailable: () => false });
  assert.throws(() => vault.save({ name: 'bad-name', value: 'a' }), /Variable names/);
  assert.throws(() => vault.save({ name: 'OK', value: '' }), /non-empty/);
  assert.throws(() => vault.save({ name: 'OK', value: 'secret' }), /encryption is unavailable/);
  assert.equal(fs.existsSync(path.join(directory, 'environment-vault.json')), false);
});
test('does not overwrite corrupt vault data', t => {
  const { directory, vault } = fixture(t); const file = path.join(directory, 'environment-vault.json'); fs.writeFileSync(file, 'broken');
  assert.throws(() => vault.save({ name: 'HF_TOKEN', value: 'secret' }), /Could not read/);
  assert.equal(fs.readFileSync(file, 'utf8'), 'broken');
});

test('shares only opted-in keys and never returns values to the renderer', t => {
  const { vault } = fixture(t);
  vault.save({ name: 'HF_TOKEN', value: 'hf-secret', shared: true });
  vault.save({ name: 'OPENAI_API_KEY', value: 'private' });
  assert.deepEqual({ ...vault.shared() }, { HF_TOKEN: 'hf-secret' });
  assert.deepEqual(vault.list(), [{ name: 'HF_TOKEN', shared: true }, { name: 'OPENAI_API_KEY', shared: false }]);
  assert.throws(() => vault.save({ name: 'PATH', value: '/tmp', shared: true }), /Only names/);
});
