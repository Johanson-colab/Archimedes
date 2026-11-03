const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const store = require('./store.cjs');
const { DatabaseSync } = require('node:sqlite');

test('existing Codex bindings migrate in place with a Codex backend default', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-binding-migration-'));
  try {
    store.openWorkspace(root);
    const thread = store.createResearchThread({ prompt: 'legacy test', mode: 'free-chat' });
    const db = new DatabaseSync(path.join(root, '.archimedes', 'archimedes.db'));
    try {
      db.exec('CREATE TABLE native_agent_bindings (thread_id TEXT PRIMARY KEY, native_thread_id TEXT NOT NULL, workspace TEXT NOT NULL, model TEXT NOT NULL, last_turn_id TEXT) STRICT');
      db.prepare('INSERT INTO native_agent_bindings VALUES (?, ?, ?, ?, ?)').run(thread.id, 'old-native-id', root, '', null);
    } finally { db.close(); }
    const binding = store.nativeAgentBindings(thread.id).get();
    assert.equal(binding.backend, 'codex');
    assert.equal(binding.native_thread_id, 'old-native-id');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('native bindings preserve backend identity without publishing native IDs in research threads or forks', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-bindings-'));
  try {
    store.openWorkspace(root);
    const thread = store.createResearchThread({ prompt: 'test', mode: 'free-chat' });
    const bindings = store.nativeAgentBindings(thread.id);
    const value = { native_thread_id: 'private-claude-id', workspace: root, model: '', last_turn_id: null };
    bindings.save({ ...value, backend: 'claude' });
    assert.equal(bindings.get().backend, 'claude');
    assert.equal(JSON.stringify(store.getResearchThread(thread.id)).includes('private-claude-id'), false);
    assert.equal(store.nativeAgentBindings(store.forkResearchThread(thread.id).id).get(), undefined);
    bindings.save(value);
    assert.equal(bindings.get().backend, 'codex');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
