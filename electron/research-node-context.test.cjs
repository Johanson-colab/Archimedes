const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const store = require('./store.cjs');
const graph = require('./research-graph/service.cjs');
const contexts = require('./research-graph/node-context.cjs');
const { userPrompt } = require('./agent/codex-backend.cjs');
const { claudePrompt } = require('./agent/claude-backend.cjs');
const { openCodePrompt } = require('./agent/opencode-backend.cjs');

async function workspace(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'archimedes-node-context-'));
  store.setLocalIdentity({ userId: 'context-owner', displayName: 'Owner' });
  try {
    store.openWorkspace(root);
    const project = store.createResearchProject({ name: 'Node discussions', workspacePath: root });
    const source = store.createResearchThread({ projectId: project.id, mode: 'research', title: 'Research source' });
    const question = graph.createNode({ projectId: project.id, threadId: source.id, kind: 'question', title: 'Question', content: { question: 'Does calibration predict failures?' } });
    const idea = graph.createNode({ projectId: project.id, threadId: source.id, kind: 'idea', title: 'Idea', content: { hypothesis: 'Calibration rises before errors' }, parents: [{ nodeId: question.id }] });
    const experiment = graph.createNode({ projectId: project.id, threadId: source.id, kind: 'experiment', title: 'Experiment', content: { method: 'Evaluate fixed corruptions' }, parents: [{ nodeId: idea.id }] });
    await run({ root, project, source, question, idea, experiment });
  } finally {
    store.setLocalIdentity({ userId: 'context-owner', displayName: 'Owner' });
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('a node discussion pins its revision and ancestors without copying source chat or sibling ideas', async () => {
  await workspace(({ project, source, question, idea, experiment }) => {
    graph.createNode({ projectId: project.id, threadId: source.id, kind: 'idea', title: 'Unrelated branch', content: { hypothesis: 'UNRELATED_SIBLING' } });
    const task = store.startTask({ prompt: 'UNRELATED_SOURCE_CHAT' });
    const turn = store.startResearchTurn({ threadId: source.id, taskId: task.id, prompt: 'UNRELATED_SOURCE_CHAT', mode: 'research' });
    store.finishResearchTurn(turn.id, { response: 'Unrelated discussion', status: 'completed' });
    const chat = contexts.openNodeConversation({ nodeId: experiment.id, revisionId: experiment.current_revision_id });
    assert.equal(chat.node_id, experiment.id);
    assert.equal(chat.node_revision_id, experiment.current_revision_id);
    assert.equal(chat.parent_id, source.id);
    assert.equal(chat.visibility, 'private');
    assert.equal(chat.turns.length, 0);
    const pack = store.getResearchNodeContext(chat.id);
    assert.equal(chat.node_context_characters, JSON.stringify(pack).length);
    assert.equal(store.listResearchThreads().find(item => item.id === chat.id).node_context_characters, chat.node_context_characters);
    assert.equal(pack.focus.revisionId, experiment.current_revision_id);
    assert.equal(pack.parents[0].revisionId, idea.current_revision_id);
    assert.equal(pack.questions[0].nodeId, question.id);
    assert.doesNotMatch(JSON.stringify(pack), /UNRELATED_SIBLING|UNRELATED_SOURCE_CHAT/);
    assert.equal(contexts.openNodeConversation({ nodeId: experiment.id }).id, chat.id, 'the same owner and revision resumes its existing discussion');
    graph.reviseNode({ nodeId: experiment.id, content: { method: 'A newer method' } });
    assert.deepEqual(store.getResearchNodeContext(chat.id), pack, 'future graph changes do not silently alter the snapshot');
    const next = contexts.openNodeConversation({ nodeId: experiment.id });
    assert.notEqual(next.id, chat.id);
    assert.equal(store.getResearchNodeContext(next.id).focus.content.method, 'A newer method');
  });
});

test('older revisions exclude relationships added only after that revision', async () => {
  await workspace(({ project, source, idea, experiment }) => {
    const revised = graph.reviseNode({ nodeId: experiment.id, content: { method: 'New method' } });
    const other = graph.createNode({ projectId: project.id, threadId: source.id, kind: 'idea', title: 'Later parent', content: { hypothesis: 'LATER_PARENT' } });
    graph.linkNodes({ fromNodeId: other.id, toNodeId: experiment.id, kind: 'tests' });
    const old = contexts.buildContext(store.getResearchNode(experiment.id), experiment.current_revision_id);
    assert.deepEqual(old.parents.map(item => item.nodeId), [idea.id]);
    assert.doesNotMatch(JSON.stringify(old), /LATER_PARENT/);
    const latest = contexts.buildContext(store.getResearchNode(experiment.id), revised.current_revision_id);
    assert.equal(latest.parents.length, 2);
    assert.throws(() => contexts.openNodeConversation({ nodeId: experiment.id, revisionId: idea.current_revision_id }), /does not belong/);
  });
});

test('private source access cannot be bypassed through a node conversation', async () => {
  await workspace(({ project, source, idea }) => {
    store.setResearchThreadVisibility(source.id, 'private');
    const chat = contexts.openNodeConversation({ nodeId: idea.id });
    store.addProjectMember({ projectId: project.id, userId: 'context-peer', role: 'editor', displayName: 'Peer' });
    store.setLocalIdentity({ userId: 'context-peer', displayName: 'Peer' });
    assert.throws(() => contexts.openNodeConversation({ nodeId: idea.id }), /private/i);
    assert.throws(() => contexts.promptForThread(chat.id), /private/i);
  });
});

test('snapshots remain bounded, immutable and available after compaction and fork', async () => {
  await workspace(({ root, experiment }) => {
    graph.reviseNode({ nodeId: experiment.id, content: { method: 'large '.repeat(20_000) } });
    const chat = contexts.openNodeConversation({ nodeId: experiment.id });
    const pack = store.getResearchNodeContext(chat.id);
    assert.ok(JSON.stringify(pack).length <= 24_000);
    assert.equal(pack.focus.content.truncated, true);
    const fork = store.forkResearchThread(chat.id);
    assert.equal(fork.node_id, experiment.id);
    assert.deepEqual(store.getResearchNodeContext(fork.id), pack);
    assert.equal(contexts.openNodeConversation({ nodeId: experiment.id }).id, chat.id, 'the node entry resumes its canonical discussion rather than an incidental fork');
    const task = store.startTask({ prompt: 'Discuss this method' });
    const turn = store.startResearchTurn({ threadId: chat.id, taskId: task.id, prompt: 'Discuss this method', mode: 'free-chat' });
    store.finishResearchTurn(turn.id, { response: 'A bounded discussion', status: 'completed' });
    store.compactResearchThread(chat.id, 'Short summary', turn.id);
    assert.deepEqual(store.getResearchNodeContext(chat.id), pack);
    const undone = store.undoResearchTurn(chat.id);
    assert.deepEqual(store.getResearchNodeContext(undone.backupThreadId), pack);
    assert.deepEqual(store.getResearchNodeContext(chat.id), pack);
    const db = new DatabaseSync(path.join(root, '.archimedes', 'archimedes.db'));
    try {
      assert.throws(() => db.prepare("UPDATE research_node_contexts SET context_json = '{}' WHERE thread_id = ?").run(chat.id), /immutable/);
    } finally { db.close(); }
  });
});

test('Codex, Claude and OpenCode prompts carry the same pinned context on new and resumed turns', async () => {
  await workspace(({ idea }) => {
    const chat = contexts.openNodeConversation({ nodeId: idea.id });
    const prompt = contexts.promptForThread(chat.id);
    const bound = { ...chat, node_context_prompt: prompt };
    const turn = { id: 'current', user_message: 'Discuss the failure conditions', mode: 'experiment-setup' };
    for (const resume of [false, true]) {
      const text = userPrompt(bound, turn, resume, []);
      assert.match(text, /Calibration rises before errors/);
      assert.match(text, /Pinned research context snapshot/);
      assert.doesNotMatch(text, /archimedes-experiment/);
      assert.ok(JSON.stringify(claudePrompt(text, [])).includes(idea.current_revision_id));
      assert.ok(JSON.stringify(openCodePrompt(text, [])).includes(idea.current_revision_id));
    }
  });
});

test('API discussion receives pinned context without offering graph mutations or scheduling extraction', async () => {
  await workspace(async ({ root, idea }) => {
    const modelConfig = require('./model-config.cjs');
    const agent = require('./agent.cjs');
    modelConfig.initializeModelConfig(root);
    fs.writeFileSync(path.join(root, 'model-config.json'), JSON.stringify({ provider: 'custom', baseUrl: 'https://example.test/v1', model: 'fixture', apiKey: 'test' }));
    const chat = contexts.openNodeConversation({ nodeId: idea.id });
    const requests = [], events = [];
    const fetch = global.fetch;
    global.fetch = async (_url, options) => {
      requests.push(JSON.parse(options.body));
      const message = requests.length === 1
        ? { role: 'assistant', content: '', tool_calls: [{ id: 'unexpected-graph-write', type: 'function', function: { name: 'create_idea', arguments: JSON.stringify({ title: 'Must not create a graph', hypothesis: 'Unexpected write' }) } }] }
        : { role: 'assistant', content: 'Discuss the hypothesis under controlled conditions.' };
      return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ choices: [{ message }] }) };
    };
    try {
      const result = await agent.runAgent({ prompt: 'Please discuss the hypothesis', workspace: root, threadId: chat.id, mode: 'research', origin: 'research', capabilities: { write: 'ask', command: 'ask' }, emit: event => events.push(event) });
      assert.equal(result.status, 'completed');
      assert.ok(requests.some(request => JSON.stringify(request.messages).includes(idea.current_revision_id)));
      assert.ok(requests.every(request => !(request.tools || []).some(tool => contexts.GRAPH_TOOLS.has(tool.function.name))));
      assert.ok(requests.some(request => (request.messages || []).some(message => message.role === 'tool' && message.content.includes('Return to the source Research session'))), 'even unsolicited graph tool calls are refused before writing');
      assert.ok(!events.some(event => event.type === 'graph_update_pending'));
      assert.equal(store.listResearchGraph({ projectId: chat.project_id, threadId: chat.id }).nodes.length, 0);
    } finally { global.fetch = fetch; }
  });
});
