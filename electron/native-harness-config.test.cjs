const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const config = require('./agent-backend-config.cjs');

test('switching native Harnesses retains independent executable, model and permission profiles', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-config-'));
  config.initialize(root);
  try {
    config.save({ backend: 'codex', binary: '/bin/custom-codex', model: 'codex-model', effort: 'high', permissionMode: 'workspace-write' });
    let saved = config.save({ backend: 'claude' });
    assert.equal(saved.binary, 'claude'); assert.equal(saved.model, ''); assert.equal(saved.permissionMode, 'ask');
    config.save({ ...saved, model: 'sonnet' });
    saved = config.save({ backend: 'opencode' });
    assert.equal(saved.binary, 'opencode'); assert.equal(saved.model, ''); assert.equal(saved.permissionMode, 'ask');
    saved = config.save({ backend: 'codex' });
    assert.equal(saved.binary, '/bin/custom-codex'); assert.equal(saved.model, 'codex-model'); assert.equal(saved.effort, 'high');
    assert.equal(config.save({ backend: 'claude' }).model, 'sonnet');
    assert.equal(config.save({ model: 'updated-sonnet' }).backend, 'claude');
    assert.equal(config.save({ backend: 'api' }).backend, 'api');
    assert.equal(config.save({ backend: 'codex' }).model, 'codex-model');
    assert.equal(config.get().profiles.claude.model, 'updated-sonnet');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('legacy Codex settings migrate without inheriting another agents executable or permissions', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-legacy-'));
  config.initialize(root);
  try {
    fs.writeFileSync(path.join(root, 'agent-backend.json'), JSON.stringify({ backend: 'api', binary: '/bin/codex', model: 'old', permissionMode: 'read-only' }));
    assert.equal(config.get().profiles.codex.model, 'old');
    assert.equal(config.save({ backend: 'opencode' }).binary, 'opencode');
    assert.equal(config.save({ backend: 'codex' }).binary, '/bin/codex');
    assert.throws(() => config.normalize({ backend: 'claude', binary: 'sh' }), /absolute/i);
    assert.throws(() => config.normalize({ backend: 'opencode', permissionMode: 'danger-full-access' }), /permission/i);
    assert.equal(config.normalize({ backend: 'claude', permissionMode: 'accept-edits', effort: 'high' }).permissionMode, 'accept-edits');
    assert.equal(config.normalize({ backend: 'claude', permissionMode: 'auto' }).permissionMode, 'auto');
    assert.throws(() => config.normalize({ backend: 'claude', permissionMode: 'danger-full-access' }), /permission/i);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
