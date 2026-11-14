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
      userPrompt: "Does calibration track accuracy under shift?",
      assistantResponse: "The answer proposes a severity sweep.",
      emit: (event) => events.push(event),
      recordEvent: (event) => store.appendResearchEvent({ threadId: thread.id, turnId: turn.id, ...event }),
      complete: async (_config, _messages, options) => {
        completeCalls += 1;
        assert.equal(options.allowTools, false);
        return { content: JSON.stringify(chainPatch) };
      },
    });
    assert.equal(completeCalls, 1);
    assert.equal(result.createdNodes.length, 4);
    assert.ok(events.some((event) => event.type === "graph_update_pending"));
    const update = events.find((event) => event.type === "graph_update");
    assert.equal(update.graph.nodeCount, 4);
    assert.equal(update.graph.edgeCount, 3);
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
    assert.equal(graph.listGraph({ projectId: project.id }).nodes.length, 4);
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
        return JSON.stringify(chainPatch);
      },
    });
    assert.equal(captured.config.permissionMode, "plan");
    assert.equal(captured.thread.id === thread.id, false);
    assert.equal(captured.thread.turns.length, 0);
    assert.equal(captured.turn.user_message.includes("severity sweep"), true);
    assert.equal(result.createdNodes.length, 4);
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
        ? { role: "assistant", content: JSON.stringify(chainPatch) }
        : { role: "assistant", content: "The answer proposes a severity sweep." };
      return {
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => ({ choices: [{ message }] }),
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
      assert.equal(update.graph.nodeCount, 4);
      assert.equal(update.graph.edgeCount, 3);
      const listed = store.listResearchGraph({ projectId: project.id });
      assert.equal(listed.nodes.length, 4);
      assert.equal(listed.edges.length, 3);
      assert.ok(requests.some((request) => String(request.messages?.[0]?.content || "").includes("strict research graph extractor")));
    } finally {
      global.fetch = previousFetch;
    }
  });
});
