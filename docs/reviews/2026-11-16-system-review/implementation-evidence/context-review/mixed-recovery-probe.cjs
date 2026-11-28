const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const repository = path.resolve(__dirname, '../../../../..');
const storeFile = path.join(repository, 'electron/store.cjs');
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'archimedes-mixed-recovery-review-')));
const store = require(storeFile);
try {
  const child = spawnSync(process.execPath, ['-e', `
    const store = require(${JSON.stringify(storeFile)});
    store.openWorkspace(process.argv[1]);
    const thread = store.createResearchThread({ prompt: 'Local in-flight turn', mode: 'free-chat' });
    const task = store.startTask({ prompt: 'Local in-flight turn' });
    const local = store.startResearchTurn({ threadId: thread.id, taskId: task.id, prompt: task.prompt, mode: 'free-chat' });
    store.applyCloudThread(thread.project_id, { thread: { ...thread, status: 'running' }, turns: [{ id: 'remote-new-running-turn', status: 'running', user_message: 'Remote work', created_at: new Date(Date.now() + 1000).toISOString() }] });
    process.stdout.write(JSON.stringify({ threadId: thread.id, localTurn: local.id }));
  `, root], { encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
  const ids = JSON.parse(child.stdout);
  const owner = store.createWorkspaceStore(root);
  const thread = owner.getResearchThread(ids.threadId);
  const local = thread.turns.find(turn => turn.id === ids.localTurn);
  const remote = thread.turns.find(turn => turn.id === 'remote-new-running-turn');
  process.stdout.write(`${JSON.stringify({ threadStatus: thread.status, localStatus: local.status, remoteStatus: remote.status, remoteTaskId: remote.task_id }, null, 2)}\n`);
  assert.equal(local.status, 'interrupted');
  assert.equal(remote.status, 'running');
  assert.equal(thread.status, 'running', 'recovering the orphaned local turn must preserve a still-running cloud turn in the same thread');
} finally {
  store.closeAllWorkspaces();
  fs.rmSync(root, { recursive: true, force: true });
}
