const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const store = require("./store.cjs");
const graph = require("./research-graph/service.cjs");

function withWorkspace(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-research-graph-"));
  try {
    store.openWorkspace(root);
    const project = store.createResearchProject({ name: "Research graph test" });
    return run({ root, project });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function createChain(projectId) {
  const question = graph.createNode({
    projectId,
    kind: "question",
    title: "Does calibration track accuracy?",
    content: { question: "Does calibration track accuracy under distribution shift?" },
  });
  const idea = graph.createNode({
    projectId,
    kind: "idea",
    title: "Calibration degrades before accuracy",
    content: { hypothesis: "Calibration degrades earlier than accuracy.", prediction: "ECE rises first." },
    parents: [{ nodeId: question.id }],
  });
  const experiment = graph.createNode({
    projectId,
    kind: "experiment",
    title: "Shift sweep",
    content: { plan: "Evaluate ECE and accuracy across corruption levels." },
    parents: [{ nodeId: idea.id }],
  });
  const result = graph.createNode({
    projectId,
    kind: "result",
    title: "ECE rose first",
    content: {
      evidence: { metrics: { ece: 0.21, accuracy: 0.88 }, run_ids: ["run-1"] },
      interpretation: { verdict: "supports", reasoning: "ECE rose before accuracy moved.", confidence: 0.7 },
    },
    parents: [{ nodeId: experiment.id }],
  });
  const writing = graph.createNode({
    projectId,
    kind: "writing",
    title: "Calibration section",
    content: { section: "Results", status: "draft", claims: ["ECE is an earlier warning signal."] },
  });
  graph.linkNodes({ fromNodeId: writing.id, toNodeId: result.id, kind: "cites" });
  return { question, idea, experiment, result, writing };
}

test("creates a question to writing chain with pinned revisions and typed edges", () => {
  withWorkspace(({ project }) => {
    const chain = createChain(project.id);
    const listed = graph.listGraph({ projectId: project.id });
    assert.equal(listed.nodes.length, 5);
    assert.equal(listed.edges.length, 4);
    assert.ok(listed.nodes.every((node) => node.current_revision && node.current_revision.node_id === node.id));
    const kinds = listed.edges.map((edge) => edge.kind);
    assert.deepEqual(kinds, ["generates", "tests", "produces", "cites"]);
    const edge = listed.edges.find((item) => item.kind === "produces");
    assert.equal(edge.from_node, chain.experiment.id);
    assert.equal(edge.to_node, chain.result.id);
    assert.equal(graph.validateGraph({ projectId: project.id }).ok, true);
  });
});

test("revisions are append-only and a no-op revision is not written", () => {
  withWorkspace(({ project }) => {
    const { idea } = createChain(project.id);
    const before = graph.getNodeHistory(idea.id);
    const revised = graph.reviseNode({
      nodeId: idea.id,
      content: { hypothesis: "Calibration degrades earlier than accuracy.", prediction: "ECE rises first.", note: "narrowed" },
    });
    const after = graph.getNodeHistory(idea.id);
    assert.equal(after.length, 2);
    assert.equal(after[0].content.hypothesis, "Calibration degrades earlier than accuracy.");
    assert.equal(after[0].content.note, undefined);
    assert.equal(after[1].parent_revision_id, before[0].id);
    assert.equal(revised.current_revision_id, after[1].id);
    assert.notEqual(revised.current_revision.content_hash, before[0].content_hash);

    const unchanged = graph.reviseNode({
      nodeId: idea.id,
      content: { hypothesis: "Calibration degrades earlier than accuracy.", prediction: "ECE rises first.", note: "narrowed" },
    });
    assert.equal(unchanged.current_revision_id, revised.current_revision_id);
    assert.equal(graph.getNodeHistory(idea.id).length, 2);
  });
});

test("allows an experiment to test multiple ideas and a result to aggregate experiments", () => {
  withWorkspace(({ project }) => {
    const a = graph.createNode({ projectId: project.id, kind: "idea", title: "Idea A", content: { hypothesis: "A" } });
    const b = graph.createNode({ projectId: project.id, kind: "idea", title: "Idea B", content: { hypothesis: "B" } });
    const experiment = graph.createNode({
      projectId: project.id,
      kind: "experiment",
      title: "Joint test",
      content: { plan: "Test both ideas." },
      parents: [{ nodeId: a.id }, { nodeId: b.id }],
    });
    const listed = graph.listGraph({ projectId: project.id });
    assert.equal(listed.edges.filter((edge) => edge.to_node === experiment.id && edge.kind === "tests").length, 2);
    const second = graph.createNode({
      projectId: project.id,
      kind: "experiment",
      title: "Replication",
      content: { plan: "Repeat the test." },
      parents: [{ nodeId: b.id }],
    });
    const result = graph.createNode({
      projectId: project.id,
      kind: "result",
      title: "Aggregated result",
      content: { evidence: {}, interpretation: { verdict: "mixed" } },
      parents: [{ nodeId: experiment.id }, { nodeId: second.id }],
    });
    assert.equal(graph.listGraph({ projectId: project.id }).edges.filter((edge) => edge.to_node === result.id && edge.kind === "produces").length, 2);
  });
});

test("rejects invalid parent edges and duplicate links", () => {
  withWorkspace(({ project }) => {
    const { question, experiment, idea, result } = createChain(project.id);
    const otherProject = store.createResearchProject({ name: "Other graph project" });
    const foreign = graph.createNode({ projectId: otherProject.id, kind: "question", title: "Foreign question", content: {} });
    assert.throws(
      () => graph.createNode({
        projectId: project.id,
        kind: "idea",
        title: "Foreign parent",
        content: {},
        parents: [{ nodeId: foreign.id }],
      }),
      /same project/,
    );
    assert.throws(
      () => graph.createNode({ projectId: project.id, kind: "experiment", title: "Orphan" }),
      /requires at least one parent/,
    );
    assert.throws(
      () => graph.linkNodes({ fromNodeId: experiment.id, toNodeId: question.id, kind: "tests" }),
      /cannot connect experiment to question/,
    );
    assert.throws(
      () => graph.linkNodes({ fromNodeId: result.id, toNodeId: question.id, kind: "supports" }),
      /cannot connect result to question/,
    );
    graph.linkNodes({ fromNodeId: result.id, toNodeId: idea.id, kind: "supports" });
    assert.throws(
      () => graph.linkNodes({ fromNodeId: result.id, toNodeId: idea.id, kind: "supports" }),
      /already exists/,
    );
  });
});

test("allows evidence feedback edges but rejects structural cycles", () => {
  withWorkspace(({ project }) => {
    const { idea, experiment, result } = createChain(project.id);
    const feedback = graph.linkNodes({ fromNodeId: result.id, toNodeId: idea.id, kind: "supports" });
    assert.equal(feedback.kind, "supports");
    assert.equal(graph.validateGraph({ projectId: project.id }).ok, true);

    const refined = graph.createNode({
      projectId: project.id,
      kind: "idea",
      title: "Refined idea",
      content: { hypothesis: "A narrower version." },
      parents: [{ nodeId: idea.id, kind: "refines" }],
    });
    assert.throws(
      () => graph.linkNodes({ fromNodeId: refined.id, toNodeId: idea.id, kind: "refines" }),
      /cycle/,
    );
    assert.equal(graph.validateGraph({ projectId: project.id }).ok, true);
    assert.ok(experiment.id);
  });
});

test("creates a merge node with two parents and reports incomplete merges", () => {
  withWorkspace(({ project }) => {
    const a = graph.createNode({ projectId: project.id, kind: "idea", title: "Idea A", content: { hypothesis: "A" } });
    const b = graph.createNode({ projectId: project.id, kind: "idea", title: "Idea B", content: { hypothesis: "B" } });
    const merged = graph.createNode({
      projectId: project.id,
      kind: "idea",
      title: "Merged idea",
      content: { hypothesis: "A and B" },
      parents: [{ nodeId: a.id, kind: "merges" }, { nodeId: b.id, kind: "merges" }],
    });
    const listed = graph.listGraph({ projectId: project.id });
    assert.equal(listed.edges.filter((edge) => edge.to_node === merged.id && edge.kind === "merges").length, 2);
    assert.equal(graph.validateGraph({ projectId: project.id }).ok, true);

    const incomplete = store.createResearchNode({
      projectId: project.id,
      kind: "idea",
      title: "Incomplete merge",
      contentJson: "{\"hypothesis\":\"C\"}",
      contentHash: "hash",
      parents: [{ nodeId: a.id, revisionId: a.current_revision_id, kind: "merges" }],
    });
    const validation = graph.validateGraph({ projectId: project.id });
    assert.equal(validation.ok, false);
    assert.ok(validation.issues.some((issue) => issue.code === "incomplete_merge" && issue.nodeId === incomplete.id));
  });
});

test("archives and restores nodes without deleting revisions or edges", () => {
  withWorkspace(({ project }) => {
    const { idea } = createChain(project.id);
    const archived = graph.archiveNode({ nodeId: idea.id, reason: "superseded" });
    assert.equal(archived.archived, true);
    assert.equal(graph.listGraph({ projectId: project.id }).nodes.length, 4);
    assert.equal(graph.listGraph({ projectId: project.id, includeArchived: true }).nodes.length, 5);
    assert.throws(() => graph.reviseNode({ nodeId: idea.id, content: { hypothesis: "changed" } }), /Restore/);
    const restored = graph.restoreNode({ nodeId: idea.id });
    assert.equal(restored.archived, false);
    assert.equal(graph.getNodeHistory(idea.id).length, 1);
    assert.equal(graph.listGraph({ projectId: project.id }).nodes.length, 5);
  });
});

test("validation reports malformed edges created by lower-level callers", () => {
  withWorkspace(({ project }) => {
    const { idea } = createChain(project.id);
    const experiment = store.createResearchNode({
      projectId: project.id,
      kind: "experiment",
      title: "Malformed experiment",
      contentJson: "{}",
      contentHash: "hash",
      parents: [{ nodeId: idea.id, revisionId: idea.current_revision_id, kind: "generates" }],
    });
    const validation = graph.validateGraph({ projectId: project.id });
    assert.equal(validation.ok, false);
    assert.ok(validation.issues.some((issue) => issue.code === "edge_kind_mismatch"));
    assert.ok(validation.issues.some((issue) => issue.code === "experiment_without_idea" && issue.nodeId === experiment.id));
  });
});
