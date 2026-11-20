const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const store = require("./store.cjs");
const graph = require("./research-graph/service.cjs");
const directives = require("./agent/experiment-directives.cjs");

async function withWorkspace(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-experiment-directives-"));
  try {
    store.openWorkspace(root);
    const project = store.createResearchProject({ name: "Experiment directives" });
    return await run({ root, project });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function threadFor(projectId, mode = "experiment-setup") {
  return store.createResearchThread({ prompt: "Design and run the experiment.", mode, projectId });
}

function ideaFor(projectId, threadId) {
  const question = graph.createNode({
    projectId,
    threadId,
    kind: "question",
    title: "Does the component help?",
    content: { question: "Does the component help?" },
  });
  return graph.createNode({
    projectId,
    threadId,
    kind: "idea",
    title: "Ablation improves robustness",
    content: { hypothesis: "Removing the component improves robustness." },
    parents: [{ nodeId: question.id }],
  });
}

async function waitForRun(runId, timeoutMs = 6_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const run = store.getExperimentRun(runId);
    if (run && ["succeeded", "failed", "cancelled"].includes(run.status)) return run;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Run ${runId} did not finish.`);
}

test("extractExperimentDirectives strips fenced blocks and bounds the count", () => {
  const text = "Plan.\n\n```experiment\n{\"action\":\"run\",\"experiment\":\"E\",\"command\":\"echo hi\"}\n```\n\nDone.";
  const result = directives.extractExperimentDirectives(text);
  assert.equal(result.text, "Plan.\n\nDone.");
  assert.deepEqual(result.directives, [{ action: "run", experiment: "E", command: "echo hi" }]);
  const many = Array.from({ length: 5 }, (_, index) => `\`\`\`experiment\n{"action":"log","runId":"${index}"}\n\`\`\``).join("\n");
  assert.equal(directives.extractExperimentDirectives(many).directives.length, 3);
});

test("a create directive writes an experiment under an idea", async () => {
  await withWorkspace(async ({ root, project }) => {
    const thread = threadFor(project.id);
    const idea = ideaFor(project.id, thread.id);
    const events = [];
    const notes = await directives.executeExperimentDirectives({
      directives: [{
        action: "create",
        idea: idea.title,
        title: "Ablation sweep",
        hypothesis: "Removing the component improves robustness.",
        baseline: "full model",
        method: "remove the component and retrain",
        metrics: ["accuracy", "loss"],
        stopCriteria: "three seeds",
      }],
      threadId: thread.id,
      workspace: root,
      emit: (event) => events.push(event),
    });
    assert.match(notes[0], /Experiment created/);
    const listed = store.listResearchGraph({ projectId: project.id, threadId: thread.id });
    const experiment = listed.nodes.find((node) => node.kind === "experiment");
    assert.equal(experiment.title, "Ablation sweep");
    assert.equal(experiment.current_revision.content.baseline, "full model");
    assert.deepEqual(experiment.current_revision.content.metrics, ["accuracy", "loss"]);
    assert.ok(listed.edges.some((edge) => edge.kind === "tests" && edge.to_node === experiment.id));
    assert.ok(events.some((event) => event.type === "graph_update"));
  });
});

test("run, log, and result directives close the experiment loop", async () => {
  await withWorkspace(async ({ root, project }) => {
    const thread = threadFor(project.id);
    const task = store.startTask({ prompt: "Run the experiment." });
    const turn = store.startResearchTurn({ threadId: thread.id, taskId: task.id, prompt: "Run the experiment.", mode: "experiment-setup" });
    const recordEvent = (event) => store.appendResearchEvent({ threadId: thread.id, turnId: turn.id, ...event });
    const idea = ideaFor(project.id, thread.id);
    await directives.executeExperimentDirectives({
      directives: [{ action: "create", idea: idea.title, title: "Runner check", metrics: ["loss"] }],
      threadId: thread.id,
      workspace: root,
      recordEvent,
    });
    const command = `${JSON.stringify(process.execPath)} -e "console.log('loss=0.5')"`;
    const notes = await directives.executeExperimentDirectives({
      directives: [{ action: "run", experiment: "Runner check", command }],
      threadId: thread.id,
      workspace: root,
      recordEvent,
    });
    assert.match(notes[0], /Experiment run started/);
    const listed = store.listResearchGraph({ projectId: project.id, threadId: thread.id });
    const experiment = listed.nodes.find((node) => node.kind === "experiment");
    const runs = store.listExperimentRuns({ nodeId: experiment.id });
    assert.equal(runs.length, 1);
    const final = await waitForRun(runs[0].id);
    assert.equal(final.status, "succeeded");
    assert.equal(final.exit_code, 0);

    const logNotes = await directives.executeExperimentDirectives({
      directives: [{ action: "log", runId: final.id }],
      threadId: thread.id,
      workspace: root,
      recordEvent,
    });
    assert.match(logNotes[0], /loss=0\.5/);

    const resultNotes = await directives.executeExperimentDirectives({
      directives: [{ action: "result", runId: final.id, verdict: "supports", reasoning: "Loss dropped." }],
      threadId: thread.id,
      workspace: root,
      recordEvent,
    });
    assert.match(resultNotes[0], /Result recorded/);
    const after = store.listResearchGraph({ projectId: project.id, threadId: thread.id });
    const result = after.nodes.find((node) => node.kind === "result");
    assert.equal(result.source_run_id, final.id);
    assert.equal(result.current_revision.content.evidence.source, "run");
    assert.equal(result.current_revision.content.interpretation.verdict, "supports");
    assert.ok(after.edges.some((edge) => edge.kind === "produces" && edge.to_node === result.id));

    const recent = directives.recentExperimentRuns(thread.id);
    assert.match(recent, new RegExp(final.id));
    assert.match(recent, /succeeded/);
  });
});

test("a rejected native run directive does not start a run", async () => {
  await withWorkspace(async ({ root, project }) => {
    const thread = threadFor(project.id);
    const idea = ideaFor(project.id, thread.id);
    await directives.executeExperimentDirectives({
      directives: [{ action: "create", idea: idea.title, title: "Approval check" }],
      threadId: thread.id,
      workspace: root,
    });
    const notes = await directives.executeExperimentDirectives({
      directives: [{ action: "run", experiment: "Approval check", command: "true" }],
      threadId: thread.id,
      workspace: root,
      approve: async () => false,
    });
    assert.match(notes[0], /rejected/);
    const listed = store.listResearchGraph({ projectId: project.id, threadId: thread.id });
    const experiment = listed.nodes.find((node) => node.kind === "experiment");
    assert.equal(store.listExperimentRuns({ nodeId: experiment.id }).length, 0);
  });
});

test("experiment directives are rejected outside Research or Experiment setup", async () => {
  await withWorkspace(async ({ root, project }) => {
    const thread = threadFor(project.id, "standard");
    await assert.rejects(
      () => directives.executeExperimentDirectives({
        directives: [{ action: "create", idea: "Idea", title: "Experiment" }],
        threadId: thread.id,
        workspace: root,
      }),
      /Research or Experiment setup mode/,
    );
  });
});


test("Research mode can explicitly create an experiment under an idea", async () => {
  await withWorkspace(async ({ root, project }) => {
    const thread = threadFor(project.id, "research");
    const idea = ideaFor(project.id, thread.id);
    const notes = await directives.executeExperimentDirectives({ directives: [{ action: "create", idea: idea.id, title: "Research experiment" }], threadId: thread.id, workspace: root, mode: "research" });
    assert.match(notes[0], /Experiment created/);
    assert.ok(store.listResearchGraph({ projectId: project.id, threadId: thread.id }).nodes.some((node) => node.kind === "experiment" && node.title === "Research experiment"));
  });
});
