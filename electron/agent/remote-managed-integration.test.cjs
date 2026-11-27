const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const store = require('../store.cjs');
const graph = require('../research-graph/service.cjs');
const external = require('./external-backend.cjs');
const remote = require('../research-graph/remote-experiment-runner.cjs');
let experimentId, starts = 0;
remote.start = async options => {
  starts++;
  return { run: store.createExperimentRun({ projectId: options.projectId, threadId: options.threadId, nodeId: options.nodeId, command: options.command, cwd: options.cwd, backend: 'ssh', remote: { id: options.server.id, user: options.server.user, host: options.server.host, port: options.server.port } }), launchConfirmed: true };
};
external.runNative = async options => {
  assert.ok(options.experimentDynamicTools.some(tool => tool.name === 'run_experiment' && /SSH/.test(tool.description)));
  assert.ok(!options.experimentDynamicTools.some(tool => tool.name === 'record_experiment_evidence'));
  const rejected = await options.invokeExperimentTool('run_experiment', { experiment: experimentId, command: 'echo denied' }, options.signal);
  assert.equal(rejected.approved, false);
  assert.equal(starts, 0);
  const accepted = await options.invokeExperimentTool('run_experiment', { experiment: experimentId, command: 'echo approved' }, options.signal);
  assert.equal(accepted.approved, true);
  assert.equal(starts, 1);
  assert.equal(store.getExperimentRun(accepted.run_id).node_id, experimentId);
  return 'Remote run recorded.';
};
const agent = require('../agent.cjs');

test('native Research turn starts remote experiment only after its approval', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-remote-agent-'));
  let thread;
  try {
    store.openWorkspace(root);
    const project = store.createResearchProject({ name: 'Remote agent', workspacePath: root });
    thread = store.createResearchThread({ projectId: project.id, prompt: 'Research', mode: 'research' });
    const q = graph.createNode({ projectId: project.id, threadId: thread.id, kind: 'question', title: 'Question', content: {} });
    const idea = graph.createNode({ projectId: project.id, threadId: thread.id, kind: 'idea', title: 'Idea', content: {}, parents: [{ nodeId: q.id }] });
    experimentId = graph.createNode({ projectId: project.id, threadId: thread.id, kind: 'experiment', title: 'Experiment', content: {}, parents: [{ nodeId: idea.id }] }).id;
    agent.setApprovalSurface(thread.id, true);
    let approvals = 0;
    const result = await agent.runAgent({ workspace: root, threadId: thread.id, projectId: project.id, prompt: 'Run experiment', mode: 'research', origin: 'research', externalBackend: { backend: 'codex', permissionMode: 'ask' }, capabilities: { write: 'ask', command: 'ask' }, autoBuildGraph: false,
      remoteServer: { id: 'remote', user: 'ubuntu', host: 'example.test', port: 22, workspace: '~/research' },
      emit: event => {
        if (event.type !== 'approval') return;
        approvals++;
        assert.match(event.action.payload.command, /SSH ubuntu@example\.test:22/);
        assert.equal(event.action.payload.remoteOperation, 'ssh_remote_exec');
        const yes = approvals === 2;
        if (yes) store.approveAction(event.action.id); else store.resolveAction(event.action.id, 'rejected');
        agent.resolveApproval(event.action.id, yes);
      },
    });
    assert.equal(result.status, 'completed', result.response);
    assert.equal(approvals, 2);
    assert.equal(store.listExperimentRuns({ nodeId: experimentId }).length, 1);
  } finally {
    if (thread) agent.setApprovalSurface(thread.id, false);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
