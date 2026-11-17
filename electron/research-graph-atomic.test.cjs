const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const store = require('./store.cjs');
const graph = require('./research-graph/service.cjs');

function workspace(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'archimedes-graph-atomic-'));
  try {
    store.openWorkspace(root);
    const project = store.createResearchProject({ name: 'Atomic graph' });
    const question = graph.createNode({ projectId: project.id, kind: 'question', title: 'Question', content: { question: 'Original question' } });
    const idea = graph.createNode({ projectId: project.id, kind: 'idea', status: 'active', title: 'Existing idea', content: { hypothesis: 'Original hypothesis' }, parents: [{ nodeId: question.id }] });
    run({ root, project, question, idea });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

function snapshot(projectId) {
  const current = graph.listGraph({ projectId, includeArchived: true });
  return {
    graph: current,
    history: current.nodes.map(node => graph.getNodeHistory(node.id)),
    project: store.getResearchProject(projectId),
    audit: store.listAuditEvents({ projectId, limit: 500 }).sort((a, b) => a.id.localeCompare(b.id)),
  };
}

test('invalid edges leave existing node enrichment and revision history untouched', () => {
  workspace(({ project, idea }) => {
    const before = snapshot(project.id);
    assert.throws(() => graph.applyPatch({ projectId: project.id, patch: {
      nodes: [{ id: 'n1', kind: 'idea', title: idea.title, content: { prediction: 'Must not persist' } }],
      edges: [{ from: 'missing-node', to: 'n1', kind: 'refines' }],
    } }), /source not found/);
    assert.deepEqual(snapshot(project.id), before);
    const result = graph.applyPatch({ projectId: project.id, patch: {
      nodes: [{ id: 'n1', kind: 'idea', title: idea.title, content: { prediction: 'Valid prediction' } }], edges: [],
    } });
    assert.equal(result.skippedNodes.length, 1);
    assert.equal(graph.getNodeHistory(idea.id).length, 2, 'a later successful patch can commit normally');
  });
});

test('a failure after writing a link rolls back new nodes, edges, revisions and audit events', () => {
  workspace(({ project, question, idea }) => {
    const before = snapshot(project.id);
    const link = store.linkResearchNodes;
    store.linkResearchNodes = input => { link(input); throw new Error('Injected link failure'); };
    try {
      assert.throws(() => graph.applyPatch({ projectId: project.id, patch: {
        nodes: [
          { id: 'n1', kind: 'idea', title: idea.title, content: { prediction: 'Must not persist' } },
          { id: 'n2', kind: 'idea', title: 'New branch', content: { hypothesis: 'New hypothesis' } },
        ],
        edges: [{ from: question.id, to: 'n2', kind: 'generates' }, { from: 'n2', to: 'n1', kind: 'refines' }],
      } }), /Injected link failure/);
    } finally { store.linkResearchNodes = link; }
    assert.deepEqual(snapshot(project.id), before, 'failed objects are absent, including from archived History');
  });
});

test('a retirement failure rolls back the whole round and retry commits exactly once', () => {
  workspace(({ project, question, idea }) => {
    const other = graph.createNode({ projectId: project.id, kind: 'idea', title: 'Other existing idea', content: {}, parents: [{ nodeId: question.id }] });
    const patch = {
      nodes: [
        { id: 'n0', kind: 'idea', title: idea.title, content: { prediction: 'Updated prediction' } },
        { id: 'n1', kind: 'idea', title: 'New A', content: {} },
        { id: 'n2', kind: 'idea', title: 'New B', content: {} },
      ],
      edges: [{ from: question.id, to: 'n1', kind: 'generates' }, { from: question.id, to: 'n2', kind: 'generates' }],
    };
    const before = snapshot(project.id);
    const setStatus = store.setResearchNodeStatus;
    store.setResearchNodeStatus = input => {
      const result = setStatus(input);
      if (input.nodeId === other.id && input.status === 'retracted') throw new Error('Injected retirement failure');
      return result;
    };
    try {
      assert.throws(() => graph.applyPatch({ projectId: project.id, patch }), /Injected retirement failure/);
    } finally { store.setResearchNodeStatus = setStatus; }
    assert.deepEqual(snapshot(project.id), before);
    const applied = graph.applyPatch({ projectId: project.id, patch });
    assert.equal(applied.createdNodes.length, 2);
    assert.equal(applied.createdEdges.length, 2);
    assert.equal(applied.supersededNodes.length, 2);
    assert.equal(graph.getNodeHistory(idea.id).length, 2);
    assert.equal(store.getResearchNode(idea.id).status, 'retracted');
    assert.equal(store.getResearchNode(other.id).status, 'retracted');
    assert.equal(graph.listGraph({ projectId: project.id, includeArchived: true }).nodes.length, 5);
    assert.equal(graph.validateGraph({ projectId: project.id }).ok, true);
  });
});

test('a failed inner write can be handled without committing or discarding its outer transaction', () => {
  workspace(({ project }) => {
    const before = snapshot(project.id);
    assert.throws(() => store.withResearchGraphTransaction(() => {
      graph.createNode({ projectId: project.id, kind: 'idea', title: 'Outer write', content: {} });
      assert.throws(() => store.withResearchGraphTransaction(() => {
        graph.createNode({ projectId: project.id, kind: 'idea', title: 'Inner write', content: {} });
        throw new Error('Inner failure');
      }), /Inner failure/);
      assert.ok(graph.listGraph({ projectId: project.id }).nodes.some(node => node.title === 'Outer write'));
      assert.ok(!graph.listGraph({ projectId: project.id, includeArchived: true }).nodes.some(node => node.title === 'Inner write'));
      throw new Error('Outer failure');
    }), /Outer failure/);
    assert.deepEqual(snapshot(project.id), before);
  });
});
