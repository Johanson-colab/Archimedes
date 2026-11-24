const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const store = require('./store.cjs');
const graph = require('./research-graph/service.cjs');
const servers = require('./ssh-servers.cjs');
const remote = require('./research-graph/remote-experiment-runner.cjs');

test('remote runs retain their identity across a lost launch reply and reconnect', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'archimedes-remote-test-'));
  try {
    servers.initialize(root);
    const server = servers.saveServer({ host: 'remote.example', user: 'researcher', workspace: '~/research' });
    store.openWorkspace(root);
    const project = store.createResearchProject({ name: 'Remote test' });
    const thread = store.createResearchThread({ projectId: project.id, prompt: 'Does this work?', mode: 'research' });
    const question = graph.createNode({ projectId: project.id, threadId: thread.id, kind: 'question', title: 'Question', content: {} });
    const idea = graph.createNode({ projectId: project.id, threadId: thread.id, kind: 'idea', title: 'Idea', content: {}, parents: [{ nodeId: question.id }] });
    const experiment = graph.createNode({ projectId: project.id, threadId: thread.id, kind: 'experiment', title: 'Experiment', content: {}, parents: [{ nodeId: idea.id }] });
    let launches = 0;
    const started = await remote.start({ projectId: project.id, threadId: thread.id, nodeId: experiment.id, workspace: root, command: 'echo experiment', server,
      request: async () => { launches++; throw new Error('connection lost'); } });
    assert.equal(started.launchConfirmed, false);
    assert.equal(started.run.backend, 'ssh');
    assert.equal(started.run.provenance.remote.host, server.host);
    assert.equal(started.run.provenance.ideas[0].nodeId, idea.id);
    await assert.rejects(() => remote.start({ projectId: project.id, threadId: thread.id, nodeId: experiment.id, workspace: root, command: 'echo experiment', server }), /already has a run/);
    assert.equal(launches, 1);
    const running = await remote.refresh(started.run.id, { request: async () => ({ status: 'running', log: Buffer.from('first line\n').toString('base64') }) });
    assert.equal(running.run.status, 'running');
    assert.equal(fs.readFileSync(started.run.log_path, 'utf8'), 'first line\n');
    const unknown = await remote.refresh(started.run.id, { request: async () => ({ status: 'unknown', reason: 'disconnected' }) });
    assert.equal(unknown.connection, 'unknown');
    assert.equal(unknown.run.status, 'running');
    const done = await remote.refresh(started.run.id, { request: async () => ({ status: 'succeeded', exitCode: 0, log: Buffer.from('metric: 1\n').toString('base64') }) });
    assert.equal(done.run.status, 'succeeded');
    assert.equal(done.run.exit_code, 0);
    assert.equal(graph.createResultFromRun({ runId: done.run.id, verdict: 'inconclusive', reasoning: 'Metric recorded.' }).source_run_id, done.run.id);
    servers.saveServer({ ...server, host: 'changed.example' });
    await assert.rejects(() => remote.refresh(started.run.id, { request: async () => ({}) }), /address changed/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
