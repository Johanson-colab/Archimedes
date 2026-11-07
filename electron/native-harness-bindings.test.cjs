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

test('a conversation stays with its first harness, including after reopening and forking', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-thread-lock-'));
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-thread-close-'));
  try {
    store.openWorkspace(root);
    const thread = store.createResearchThread({ prompt: 'Investigate', mode: 'free-chat' });
    store.bindResearchThreadHarness(thread.id, 'codex');
    const turn = store.startResearchTurn({ threadId: thread.id, taskId: null, prompt: 'Investigate', mode: 'free-chat' });
    store.finishResearchTurn(turn.id, { response: 'Done' });
    assert.throws(() => store.bindResearchThreadHarness(thread.id, 'claude'), /Start a new chat/);
    assert.equal(store.bindResearchThreadHarness(thread.id, 'codex'), 'codex');
    const fork = store.forkResearchThread(thread.id);
    assert.equal(fork.harness, 'codex');
    assert.throws(() => store.bindResearchThreadHarness(fork.id, 'api'), /Start a new chat/);
    store.openWorkspace(other);
    store.openWorkspace(root);
    assert.equal(store.getResearchThread(thread.id).harness, 'codex');
    assert.equal(store.getResearchThread(thread.id).messages.at(-1).text, 'Done');
    const next = store.createResearchThread({ prompt: 'New', mode: 'free-chat' });
    assert.equal(store.bindResearchThreadHarness(next.id, 'claude'), 'claude');
  } finally {
    store.openWorkspace(other);
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(other, { recursive: true, force: true });
  }
});

test('legacy histories identify their native binding or API harness', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-legacy-'));
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-legacy-close-'));
  try {
    store.openWorkspace(root);
    const native = store.createResearchThread({ prompt: 'native', mode: 'free-chat' });
    const api = store.createResearchThread({ prompt: 'api', mode: 'free-chat' });
    for (const thread of [native, api]) {
      const turn = store.startResearchTurn({ threadId: thread.id, taskId: null, prompt: 'hello', mode: 'free-chat' });
      store.finishResearchTurn(turn.id, { response: 'done' });
    }
    store.nativeAgentBindings(native.id).save({ native_thread_id: 'private', workspace: root, model: '', last_turn_id: null, backend: 'claude' });
    store.openWorkspace(other);
    store.openWorkspace(root);
    assert.equal(store.getResearchThread(native.id).harness, 'claude');
    assert.equal(store.getResearchThread(api.id).harness, 'api');
  } finally {
    store.openWorkspace(other);
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(other, { recursive: true, force: true });
  }
});
