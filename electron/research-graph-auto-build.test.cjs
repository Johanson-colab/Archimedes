const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const store = require("./store.cjs");
const modelConfig = require("./model-config.cjs");
const agent = require("./agent.cjs");
const graph = require("./research-graph/service.cjs");
const auto = require("./research-graph/auto-build.cjs");

function withWorkspace(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-graph-auto-"));
  try {
    store.openWorkspace(root);
    const project = store.createResearchProject({ name: "Automatic graph test" });
    return run({ root, project });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function withWorkspaceAsync(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-graph-auto-"));
  try {
    store.openWorkspace(root);
    const project = store.createResearchProject({ name: "Automatic graph test" });
    return await run({ root, project });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function threadFor(projectId, prompt = "Does calibration track accuracy under distribution shift?") {
  const thread = store.createResearchThread({ prompt, mode: "research", projectId });
  const task = store.startTask({ prompt });
  const turn = store.startResearchTurn({ threadId: thread.id, taskId: task.id, prompt, mode: "research" });
  return { thread, turn };
}

const chainPatch = {
  nodes: [
    { id: "n1", kind: "question", title: "Does calibration track accuracy?", content: { question: "Does calibration track accuracy under shift?" } },
    { id: "n2", kind: "idea", title: "Shift severity is the driver", content: { hypothesis: "Severity drives calibration loss.", prediction: "ECE rises with severity." } },
    { id: "n3", kind: "experiment", title: "Severity sweep", content: { plan: "Sweep corruption severity." } },
    { id: "n4", kind: "result", title: "ECE rises first", content: { evidence: { ece: 0.21 }, interpretation: { verdict: "supports", reasoning: "ECE moved first." } } },
  ],
  edges: [
    { from: "n1", to: "n2", kind: "generates" },
    { from: "n2", to: "n3", kind: "tests" },
    { from: "n3", to: "n4", kind: "produces" },
  ],
  reason: "test chain",
};

// Automatic extraction never creates result nodes: results come from a
// completed run with its log and exit code.
const autoChainPatch = {
  nodes: chainPatch.nodes.slice(0, 3),
  edges: chainPatch.edges.slice(0, 2),
  reason: "auto test chain",
};

test("applyPatch creates a typed chain and records the source turn", () => {
  withWorkspace(({ project }) => {
    const { turn } = threadFor(project.id);
    const applied = graph.applyPatch({ projectId: project.id, turnId: turn.id, patch: chainPatch });
    assert.equal(applied.createdNodes.length, 4);
    assert.equal(applied.createdEdges.length, 3);
    const listed = graph.listGraph({ projectId: project.id });
    assert.equal(listed.nodes.length, 4);
    assert.deepEqual(listed.edges.map((edge) => edge.kind), ["generates", "tests", "produces"]);
    assert.equal(graph.getNodeHistory(applied.createdNodes[0].id)[0].source_turn_id, turn.id);
    assert.equal(graph.validateGraph({ projectId: project.id }).ok, true);
  });
});

test("applyPatch enriches an existing node with later plan fields", () => {
  withWorkspace(({ project }) => {
    const question = graph.createNode({
      projectId: project.id,
      kind: "question",
      title: "Does calibration track accuracy?",
      content: { question: "Does calibration track accuracy under shift?" },
    });
    const idea = graph.createNode({
      projectId: project.id,
      kind: "idea",
      title: "Calibration degrades first",
      content: { hypothesis: "Calibration degrades first." },
      parents: [{ nodeId: question.id }],
    });
    const experiment = graph.createNode({
      projectId: project.id,
      kind: "experiment",
      title: "Severity sweep",
      content: { plan: "Sweep corruption severity." },
      parents: [{ nodeId: idea.id }],
    });
    graph.applyPatch({
      projectId: project.id,
      patch: {
        nodes: [{
          id: "n1",
          kind: "experiment",
          title: "Severity sweep",
          content: { hypothesis: "ECE rises before accuracy.", baseline: "clean", metrics: ["ECE", "accuracy"] },
        }],
        edges: [],
        reason: "enrich the plan",
      },
    });
    const updated = store.getResearchNode(experiment.id);
    assert.equal(updated.current_revision.content.plan, "Sweep corruption severity.");
    assert.equal(updated.current_revision.content.hypothesis, "ECE rises before accuracy.");
    assert.equal(updated.current_revision.content.baseline, "clean");
    assert.deepEqual(updated.current_revision.content.metrics, ["ECE", "accuracy"]);
  });
});

test("applyPatch reuses an existing node with the same kind and title", () => {
  withWorkspace(({ project }) => {
    const question = graph.createNode({
      projectId: project.id,
      kind: "question",
      title: "Does calibration track accuracy?",
      content: { question: "Does calibration track accuracy under shift?" },
    });
    const applied = graph.applyPatch({
      projectId: project.id,
      patch: {
        nodes: [
          { id: "n1", kind: "question", title: question.title, content: {} },
          { id: "n2", kind: "idea", title: "Shift severity is the driver", content: { hypothesis: "Severity drives calibration loss." } },
        ],
        edges: [{ from: "n1", to: "n2", kind: "generates" }],
        reason: "dedupe",
      },
    });
    assert.equal(applied.createdNodes.length, 1);
    assert.equal(applied.skippedNodes.length, 1);
    assert.equal(applied.createdNodes[0].title, "Shift severity is the driver");
    const listed = graph.listGraph({ projectId: project.id });
    assert.equal(listed.nodes.length, 2);
    assert.equal(listed.edges.length, 1);
    assert.equal(listed.edges[0].from_node, question.id);
  });
});

test("applyPatch rejects invalid parents, invalid edges, cycles and oversized patches", () => {
  withWorkspace(({ project }) => {
    assert.throws(
      () => graph.applyPatch({ projectId: project.id, patch: { nodes: [{ id: "n1", kind: "experiment", title: "Orphan", content: {} }], edges: [] } }),
      /experiment.*test/i,
    );
    assert.throws(
      () => graph.applyPatch({
        projectId: project.id,
        patch: {
          nodes: [
            { id: "n1", kind: "question", title: "Question", content: {} },
            { id: "n2", kind: "idea", title: "Idea", content: {} },
          ],
          edges: [{ from: "n1", to: "n2", kind: "tests" }],
        },
      }),
      /cannot connect/,
    );
    assert.throws(
      () => graph.applyPatch({
        projectId: project.id,
        patch: {
          nodes: [
            { id: "n1", kind: "idea", title: "Idea A", content: {} },
            { id: "n2", kind: "idea", title: "Idea B", content: {} },
          ],
          edges: [
            { from: "n1", to: "n2", kind: "refines" },
            { from: "n2", to: "n1", kind: "refines" },
          ],
        },
      }),
      /cycle/,
    );
    assert.throws(
      () => graph.applyPatch({
        projectId: project.id,
        patch: {
          nodes: Array.from({ length: 7 }, (_, index) => ({ id: `n${index + 1}`, kind: "idea", title: `Idea ${index + 1}`, content: {} })),
          edges: [],
        },
      }),
      /at most 6/,
    );
  });
});

test("parseGraphPatch accepts fenced JSON surrounded by prose", () => {
  const patch = { nodes: [{ id: "n1", kind: "question", title: "Q", content: {} }], edges: [] };
  assert.deepEqual(auto.parseGraphPatch(`Here is the result:\n\`\`\`json\n${JSON.stringify(patch)}\n\`\`\`\nDone.`), patch);
  assert.throws(() => auto.parseGraphPatch("not json"), /did not return a JSON object/);
});

test("native extraction uses read-only or plan permissions", () => {
  assert.equal(auto.nativeExtractionConfig({ backend: "codex", permissionMode: "workspace-write" }).permissionMode, "read-only");
  assert.equal(auto.nativeExtractionConfig({ backend: "claude", permissionMode: "accept-edits" }).permissionMode, "plan");
  assert.equal(auto.nativeExtractionConfig({ backend: "opencode", permissionMode: "ask" }).permissionMode, "ask");
});

test("maybeAutoBuild applies an API patch once and emits a graph update", async () => {
  await withWorkspaceAsync(async ({ root, project }) => {
    const { thread, turn } = threadFor(project.id);
    const events = [];
    let completeCalls = 0;
    const result = await auto.maybeAutoBuild({
      projectId: project.id,
      threadId: thread.id,
      turnId: turn.id,
      mode: "research",
      origin: "research",
      backend: "api",
      config: { apiKey: "test", model: "fixture" },
      workspace: root,
      userPrompt: "Run the severity sweep and report the measured outcome.",
      assistantResponse: "The sweep finished: ECE rose from 0.08 to 0.21 while accuracy stayed at 0.88.",
      emit: (event) => events.push(event),
      recordEvent: (event) => store.appendResearchEvent({ threadId: thread.id, turnId: turn.id, ...event }),
      complete: async (_config, _messages, options) => {
        completeCalls += 1;
        assert.equal(options.allowTools, false);
        return { content: JSON.stringify(autoChainPatch) };
      },
    });
    assert.equal(completeCalls, 1);
    assert.equal(result.createdNodes.length, 3);
    assert.ok(events.some((event) => event.type === "graph_update_pending"));
    const update = events.find((event) => event.type === "graph_update");
    assert.equal(update.graph.nodeCount, 3);
    assert.equal(update.graph.edgeCount, 2);
    const again = await auto.maybeAutoBuild({
      projectId: project.id,
      threadId: thread.id,
      turnId: turn.id,
      mode: "research",
      origin: "research",
      backend: "api",
      config: { apiKey: "test", model: "fixture" },
      workspace: root,
      userPrompt: "same turn",
      assistantResponse: "same turn",
      emit: () => {},
      recordEvent: () => {},
      complete: async () => { throw new Error("should not be called"); },
    });
    assert.equal(again, null);
    assert.equal(graph.listGraph({ projectId: project.id }).nodes.length, 3);
  });
});

test("experiment setup and Research mode record reported results without creating runs", async () => {
  await withWorkspaceAsync(async ({ root, project }) => {
    const { thread, turn } = threadFor(project.id);
    const result = await auto.maybeAutoBuild({
      projectId: project.id,
      threadId: thread.id,
      turnId: turn.id,
      mode: "experiment-setup",
      origin: "research",
      backend: "api",
      config: { apiKey: "test", model: "fixture" },
      workspace: root,
      userPrompt: "Run the severity sweep and report the measured outcome.",
      assistantResponse: "The sweep finished: ECE rose from 0.08 to 0.21 while accuracy stayed at 0.88.",
      emit: () => {},
      recordEvent: () => {},
      complete: async () => ({ content: JSON.stringify(chainPatch) }),
    });
    assert.equal(result.createdNodes.length, 4);
    const measured = result.createdNodes.find((node) => node.kind === "result");
    assert.equal(measured.current_revision.content.evidence.source, "conversation");
  });
  await withWorkspaceAsync(async ({ root, project }) => {
    const { thread, turn } = threadFor(project.id);
    const records = [];
    const result = await auto.maybeAutoBuild({
      projectId: project.id,
      threadId: thread.id,
      turnId: turn.id,
      mode: "research",
      origin: "research",
      backend: "api",
      config: { apiKey: "test", model: "fixture" },
      workspace: root,
      userPrompt: "Does calibration track accuracy under shift?",
      assistantResponse: "The answer proposes a severity sweep.",
      emit: () => {},
      recordEvent: (event) => records.push(event),
      complete: async () => ({ content: JSON.stringify(chainPatch) }),
    });
    assert.equal(result.createdNodes.length, 4);
    assert.equal(result.createdNodes.find((node) => node.kind === "result").current_revision.content.evidence.source, "conversation");
    assert.equal(store.listExperimentRuns({ threadId: thread.id }).length, 0);
    assert.ok(records.some((event) => event.type === "graph_applied"));
  });
});

test("maybeAutoBuild uses a transient native turn without touching the main thread", async () => {
  await withWorkspaceAsync(async ({ root, project }) => {
    const { thread, turn } = threadFor(project.id);
    let captured;
    const result = await auto.maybeAutoBuild({
      projectId: project.id,
      threadId: thread.id,
      turnId: turn.id,
      mode: "research",
      origin: "research",
      backend: "claude",
      config: { backend: "claude", binary: "claude", permissionMode: "ask" },
      workspace: root,
      userPrompt: "Propose an experiment.",
      assistantResponse: "Run a severity sweep.",
      emit: () => {},
      recordEvent: () => {},
      runNative: async (options) => {
        captured = options;
        return JSON.stringify(autoChainPatch);
      },
    });
    assert.equal(captured.config.permissionMode, "plan");
    assert.equal(captured.thread.id === thread.id, false);
    assert.equal(captured.thread.turns.length, 0);
    assert.equal(captured.turn.user_message.includes("severity sweep"), true);
    assert.equal(result.createdNodes.length, 3);
  });
});

test("maybeAutoBuild ignores non-research, greeting and trivial turns", async () => {
  await withWorkspaceAsync(async ({ root, project }) => {
    const calls = [];
    const base = {
      projectId: project.id,
      threadId: "thread",
      turnId: "turn",
      mode: "research",
      origin: "research",
      backend: "api",
      config: { apiKey: "test" },
      workspace: root,
      userPrompt: "prompt",
      assistantResponse: "A sufficiently long research answer that should be considered.",
      emit: () => {},
      recordEvent: () => {},
      complete: async () => { calls.push("complete"); return { content: "{}" }; },
    };
    assert.equal(await auto.maybeAutoBuild({ ...base, mode: "standard" }), null);
    assert.equal(await auto.maybeAutoBuild({ ...base, origin: "paper" }), null);
    assert.equal(await auto.maybeAutoBuild({ ...base, assistantResponse: "   " }), null);
    assert.equal(await auto.maybeAutoBuild({ ...base, assistantResponse: "short" }), null);
    assert.equal(await auto.maybeAutoBuild({ ...base, userPrompt: "你好" }), null);
    assert.equal(await auto.maybeAutoBuild({ ...base, transient: true }), null);
    assert.equal(calls.length, 0);
  });
});

test("maybeAutoBuild retries one invalid API patch with a smaller request", async () => {
  await withWorkspaceAsync(async ({ root, project }) => {
    const { thread, turn } = threadFor(project.id);
    const prompts = [];
    const events = [];
    const result = await auto.maybeAutoBuild({
      projectId: project.id,
      threadId: thread.id,
      turnId: turn.id,
      mode: "research",
      origin: "research",
      backend: "api",
      config: { apiKey: "test", model: "fixture" },
      workspace: root,
      userPrompt: "Does calibration track accuracy under shift?",
      assistantResponse: "The answer proposes a severity sweep.",
      emit: (event) => events.push(event),
      recordEvent: () => {},
      complete: async (_config, messages) => {
        prompts.push(messages[1].content);
        return {
          content: prompts.length === 1
            ? "not a graph patch"
            : JSON.stringify({
              nodes: [
                { id: "n1", kind: "question", title: "Does calibration track accuracy?", content: { question: "Does calibration track accuracy?" } },
                { id: "n2", kind: "idea", title: "Severity is the driver", content: { hypothesis: "Severity drives it." } },
              ],
              edges: [{ from: "n1", to: "n2", kind: "generates" }],
              reason: "retry",
            }),
        };
      },
    });
    assert.equal(prompts.length, 2);
    assert.match(prompts[1], /previous graph patch could not be applied/i);
    assert.match(prompts[1], /at most 3 new nodes/i);
    assert.equal(result.createdNodes.length, 2);
    assert.equal(result.createdEdges.length, 1);
    assert.ok(events.some((event) => event.type === "graph_update" && event.graph.nodeCount === 2));
  });
});

test("maybeAutoBuild records a failure event when both API attempts fail", async () => {
  await withWorkspaceAsync(async ({ root, project }) => {
    const { thread, turn } = threadFor(project.id);
    const records = [];
    const events = [];
    const result = await auto.maybeAutoBuild({
      projectId: project.id,
      threadId: thread.id,
      turnId: turn.id,
      mode: "research",
      origin: "research",
      backend: "api",
      config: { apiKey: "test", model: "fixture" },
      workspace: root,
      userPrompt: "Does calibration track accuracy under shift?",
      assistantResponse: "The answer proposes a severity sweep.",
      emit: (event) => events.push(event),
      recordEvent: (event) => records.push(event),
      complete: async () => ({ content: "still not json" }),
    });
    assert.equal(result, null);
    assert.ok(records.some((event) => event.type === "graph_failed"));
    assert.ok(events.some((event) => event.type === "graph_update" && event.graph.nodeCount === 0));
    assert.equal(events.find((event) => event.type === "graph_update").graph.reason, "extraction_failed");
    assert.equal(store.listResearchGraph({ projectId: project.id }).nodes.length, 0);
  });
});

test("retry extracts only a failed completed turn and records success without duplicating nodes", async () => {
  await withWorkspaceAsync(async ({ root, project }) => {
    modelConfig.initializeModelConfig(root);
    fs.writeFileSync(path.join(root, "model-config.json"), JSON.stringify({ provider: "custom", baseUrl: "https://example.test/v1", model: "fixture", apiKey: "test" }));
    const { thread, turn } = threadFor(project.id);
    store.finishResearchTurn(turn.id, { response: "The answer proposes a severity sweep.", status: "completed" });
    store.appendResearchEvent({ threadId: thread.id, turnId: turn.id, type: "graph_failed", payload: { reason: "temporary error" } });
    const originalFetch = global.fetch;
    global.fetch = async () => ({ ok: true, headers: { get: () => "application/json" }, json: async () => ({ choices: [{ message: { role: "assistant", content: JSON.stringify(autoChainPatch) }, finish_reason: "stop" }] }) });
    try {
      assert.deepEqual(await agent.retryGraphExtraction({ threadId: thread.id, turnId: turn.id, dataWorkspace: root }), { ok: true });
      assert.equal(store.listResearchGraph({ projectId: project.id, threadId: thread.id }).nodes.length, 3);
      await assert.rejects(agent.retryGraphExtraction({ threadId: thread.id, turnId: turn.id, dataWorkspace: root }), /no longer needs a retry/);
    } finally { global.fetch = originalFetch; }
  });
});

test("a new idea round retires previous direct ideas and can restore them", () => {
  withWorkspace(({ project }) => {
    const question = graph.createNode({
      projectId: project.id,
      kind: "question",
      status: "active",
      title: "Does calibration track accuracy?",
      content: { question: "Does calibration track accuracy under shift?" },
    });
    const oldIdeas = ["Old A", "Old B", "Old C"].map((title) => graph.createNode({
      projectId: project.id,
      kind: "idea",
      status: "active",
      title,
      content: { hypothesis: title },
      parents: [{ nodeId: question.id, kind: "generates" }],
    }));
    const applied = graph.applyPatch({
      projectId: project.id,
      patch: {
        nodes: [
          { id: "n1", kind: "idea", title: "New A", content: { hypothesis: "New A" } },
          { id: "n2", kind: "idea", title: "New B", content: { hypothesis: "New B" } },
        ],
        edges: [
          { from: question.id, to: "n1", kind: "generates" },
          { from: question.id, to: "n2", kind: "generates" },
        ],
      },
    });
    assert.equal(applied.createdNodes.length, 2);
    assert.equal(applied.supersededNodes.length, 3);
    for (const node of oldIdeas) assert.equal(store.getResearchNode(node.id).status, "retracted");
    graph.setNodeStatus({ nodeId: oldIdeas[0].id, status: "active", reason: "restore test" });
    assert.equal(store.getResearchNode(oldIdeas[0].id).status, "active");
  });
});

test("an explicit supersede retires an idea even without a full new round", () => {
  withWorkspace(({ project }) => {
    const question = graph.createNode({ projectId: project.id, kind: "question", status: "active", title: "Question", content: {} });
    const oldIdea = graph.createNode({
      projectId: project.id,
      kind: "idea",
      status: "active",
      title: "Old idea",
      content: { hypothesis: "old" },
      parents: [{ nodeId: question.id, kind: "generates" }],
    });
    const applied = graph.applyPatch({
      projectId: project.id,
      patch: {
        nodes: [{ id: "n1", kind: "idea", title: "New idea", content: { hypothesis: "new" } }],
        edges: [{ from: question.id, to: "n1", kind: "generates" }],
        supersede: [{ nodeId: oldIdea.id, reason: "Covered by a newer paper." }],
      },
    });
    assert.equal(applied.supersededNodes.length, 1);
    assert.equal(applied.supersededNodes[0].previousStatus, "active");
    assert.equal(store.getResearchNode(oldIdea.id).status, "retracted");
  });
});

test("a new question branch does not retire ideas under another question", () => {
  withWorkspace(({ project }) => {
    const questionA = graph.createNode({ projectId: project.id, kind: "question", status: "active", title: "Question A", content: {} });
    const oldIdea = graph.createNode({
      projectId: project.id,
      kind: "idea",
      status: "active",
      title: "Old idea under A",
      content: { hypothesis: "old" },
      parents: [{ nodeId: questionA.id, kind: "generates" }],
    });
    const applied = graph.applyPatch({
      projectId: project.id,
      patch: {
        nodes: [
          { id: "q2", kind: "question", title: "Question B", content: {} },
          { id: "n1", kind: "idea", title: "New B1", content: { hypothesis: "B1" } },
          { id: "n2", kind: "idea", title: "New B2", content: { hypothesis: "B2" } },
        ],
        edges: [
          { from: "q2", to: "n1", kind: "generates" },
          { from: "q2", to: "n2", kind: "generates" },
        ],
      },
    });
    assert.equal(applied.supersededNodes.length, 0);
    assert.equal(store.getResearchNode(oldIdea.id).status, "active");
  });
});

test("maybeAutoBuild reports superseded ideas in its graph update", async () => {
  await withWorkspaceAsync(async ({ root, project }) => {
    const { thread, turn } = threadFor(project.id);
    const question = graph.createNode({ projectId: project.id, threadId: thread.id, kind: "question", status: "active", title: "Question", content: {} });
    const oldIdea = graph.createNode({
      projectId: project.id,
      threadId: thread.id,
      kind: "idea",
      status: "active",
      title: "Old idea",
      content: { hypothesis: "old" },
      parents: [{ nodeId: question.id, kind: "generates" }],
    });
    const events = [];
    const result = await auto.maybeAutoBuild({
      projectId: project.id,
      threadId: thread.id,
      turnId: turn.id,
      mode: "research",
      origin: "research",
      backend: "api",
      config: { apiKey: "test", model: "fixture" },
      workspace: root,
      userPrompt: "Give me a new set of ideas.",
      assistantResponse: "Two new alternatives are proposed here.",
      emit: (event) => events.push(event),
      recordEvent: () => {},
      complete: async () => ({
        content: JSON.stringify({
          nodes: [
            { id: "n1", kind: "idea", title: "New A", content: { hypothesis: "A" } },
            { id: "n2", kind: "idea", title: "New B", content: { hypothesis: "B" } },
          ],
          edges: [
            { from: question.id, to: "n1", kind: "generates" },
            { from: question.id, to: "n2", kind: "generates" },
          ],
        }),
      }),
    });
    assert.equal(result.supersededNodeIds.length, 1);
    assert.equal(store.getResearchNode(oldIdea.id).status, "retracted");
    const update = events.find((event) => event.type === "graph_update");
    assert.equal(update.graph.superseded.length, 1);
    assert.match(update.detail, /moved to history/);
  });
});

test("graphs are isolated per session and reject cross-session edges", () => {
  withWorkspace(({ project }) => {
    const threadA = store.createResearchThread({ prompt: "Session A", mode: "research", projectId: project.id });
    const threadB = store.createResearchThread({ prompt: "Session B", mode: "research", projectId: project.id });
    const questionA = graph.createNode({ projectId: project.id, threadId: threadA.id, kind: "question", status: "active", title: "Question A", content: {} });
    const ideaA = graph.createNode({
      projectId: project.id,
      threadId: threadA.id,
      kind: "idea",
      title: "Idea A",
      content: {},
      parents: [{ nodeId: questionA.id, kind: "generates" }],
    });
    const questionB = graph.createNode({ projectId: project.id, threadId: threadB.id, kind: "question", status: "active", title: "Question B", content: {} });
    const ideaB = graph.createNode({
      projectId: project.id,
      threadId: threadB.id,
      kind: "idea",
      title: "Idea B",
      content: {},
      parents: [{ nodeId: questionB.id, kind: "generates" }],
    });
    assert.equal(graph.listGraph({ projectId: project.id, threadId: threadA.id }).nodes.length, 2);
    assert.equal(graph.listGraph({ projectId: project.id, threadId: threadB.id }).nodes.length, 2);
    assert.equal(graph.listGraph({ projectId: project.id, threadId: threadA.id }).edges.length, 1);
    assert.throws(
      () => graph.linkNodes({ fromNodeId: ideaA.id, toNodeId: ideaB.id, kind: "refines" }),
      /same session/,
    );
    assert.throws(
      () => graph.createNode({
        projectId: project.id,
        threadId: threadA.id,
        kind: "idea",
        title: "Cross-session child",
        content: {},
        parents: [{ nodeId: questionB.id, kind: "generates" }],
      }),
      /same research session/,
    );
  });
});

test("extraction prompts support experiments in Research without promoting preparation to nodes", () => {
  const empty = { nodes: [], edges: [] };
  const ideaPrompt = auto.buildExtractionPrompt({ userPrompt: "prompt", assistantResponse: "answer", graph: empty, stage: "research" });
  assert.match(ideaPrompt, /Research conversation.*actual experimentation/i);
  assert.match(ideaPrompt, /hypothetical suggestion alone is not an experiment/i);
  assert.match(ideaPrompt, /Do not create separate experiment nodes merely for those steps/i);
  assert.match(ideaPrompt, /not a managed Run/i);
  const experimentPrompt = auto.buildExtractionPrompt({ userPrompt: "prompt", assistantResponse: "answer", graph: empty, stage: "experiment-setup" });
  assert.match(experimentPrompt, /Experiment setup stage/i);
  assert.match(experimentPrompt, /Every experiment must have at least one tests edge from an idea/i);
  assert.match(experimentPrompt, /One idea may have multiple experiments/i);
  assert.match(experimentPrompt, /Create result nodes only when the answer reports an actual outcome/i);
  assert.match(experimentPrompt, /experiment->result/);
  assert.match(experimentPrompt, /result: \{ evidence, interpretation: \{ verdict, reasoning \} \}/);
  assert.match(experimentPrompt, /experiment: \{ hypothesis, baseline, method, metrics, stopCriteria \}/);
});

test("a completed API Research turn schedules a background graph build", async () => {
  await withWorkspaceAsync(async ({ root, project }) => {
    modelConfig.initializeModelConfig(root);
    fs.writeFileSync(path.join(root, "model-config.json"), JSON.stringify({
      provider: "custom",
      baseUrl: "https://example.test/v1",
      model: "fixture",
      apiKey: "test",
    }));
    const previousFetch = global.fetch;
    const requests = [];
    global.fetch = async (_url, options) => {
      const body = JSON.parse(options.body);
      requests.push(body);
      const system = String(body.messages?.[0]?.content || "");
      const message = system.includes("strict research graph extractor")
        ? { role: "assistant", content: JSON.stringify(autoChainPatch) }
        : { role: "assistant", content: "The answer proposes a severity sweep." };
      return {
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => ({ choices: [{ message, finish_reason: "stop" }] }),
      };
    };
    try {
      const events = [];
      const result = await agent.runAgent({
        prompt: "Does calibration track accuracy under distribution shift?",
        workspace: root,
        projectId: project.id,
        origin: "research",
        mode: "research",
        capabilities: { write: "ask", command: "ask" },
        emit: (event) => events.push(event),
      });
      assert.equal(result.status, "completed");
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline && !events.some((event) => event.type === "graph_update" && event.graph?.nodeCount > 0)) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.ok(events.some((event) => event.type === "graph_update_pending"));
      const update = events.find((event) => event.type === "graph_update" && event.graph?.nodeCount > 0);
      assert.ok(update);
      assert.equal(update.graph.nodeCount, 3);
      assert.equal(update.graph.edgeCount, 2);
      const listed = store.listResearchGraph({ projectId: project.id });
      assert.equal(listed.nodes.length, 3);
      assert.equal(listed.edges.length, 2);
      assert.ok(requests.some((request) => String(request.messages?.[0]?.content || "").includes("strict research graph extractor")));
    } finally {
      global.fetch = previousFetch;
    }
  });
});
