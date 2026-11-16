const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const store = require("./store.cjs");
const graph = require("./research-graph/service.cjs");
const runner = require("./research-graph/experiment-runner.cjs");

function withWorkspace(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-experiment-runs-"));
  try {
    store.openWorkspace(root);
    const project = store.createResearchProject({ name: "Experiment runs" });
    return run({ root, project });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function withWorkspaceAsync(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-experiment-runs-"));
  try {
    store.openWorkspace(root);
    const project = store.createResearchProject({ name: "Experiment runs" });
    return await run({ root, project });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function threadFor(projectId) {
  return store.createResearchThread({ prompt: "Does the experiment run?", mode: "research", projectId });
}

function experimentFor(projectId, threadId) {
  const question = graph.createNode({
    projectId,
    threadId,
    kind: "question",
    title: "Does the experiment run?",
    content: { question: "Does the experiment run?" },
  });
  const idea = graph.createNode({
    projectId,
    threadId,
    kind: "idea",
    title: "A local run records evidence",
    content: { hypothesis: "A local run records evidence." },
    parents: [{ nodeId: question.id }],
  });
  const experiment = graph.createNode({
    projectId,
    threadId,
    kind: "experiment",
    title: "Local runner check",
    content: { hypothesis: "The runner captures a log.", metrics: ["exit code"] },
    parents: [{ nodeId: idea.id }],
  });
  return { question, idea, experiment };
}

function createRun({ root, project, thread, experiment, command = "true" }) {
  return store.createExperimentRun({
    projectId: project.id,
    threadId: thread.id,
    nodeId: experiment.id,
    command,
    cwd: root,
    logPath: path.join(root, "run.log"),
    commitSha: "abc123",
  });
}

test("experiment runs move through a one-way terminal lifecycle", () => {
  withWorkspace(({ root, project }) => {
    const thread = threadFor(project.id);
    const { experiment } = experimentFor(project.id, thread.id);
    const run = createRun({ root, project, thread, experiment });
    assert.equal(run.status, "starting");
    assert.equal(run.exit_code, null);

    const running = store.updateExperimentRun({ runId: run.id, status: "running" });
    assert.equal(running.status, "running");
    assert.ok(running.started_at);

    const done = store.updateExperimentRun({ runId: run.id, status: "succeeded", exitCode: 0 });
    assert.equal(done.status, "succeeded");
    assert.equal(done.exit_code, 0);
    assert.ok(done.ended_at);
    assert.throws(
      () => store.updateExperimentRun({ runId: run.id, status: "running" }),
      /cannot change status/,
    );
    assert.deepEqual(store.listExperimentRuns({ nodeId: experiment.id }).map((item) => item.id), [run.id]);
  });
});

test("an experiment cannot have two active runs", () => {
  withWorkspace(({ root, project }) => {
    const thread = threadFor(project.id);
    const { experiment } = experimentFor(project.id, thread.id);
    createRun({ root, project, thread, experiment });
    assert.throws(
      () => createRun({ root, project, thread, experiment, command: "true" }),
      /already has a run in progress/,
    );
  });
});

test("only a successful run can produce an evidence-backed result", () => {
  withWorkspace(({ root, project }) => {
    const thread = threadFor(project.id);
    const { experiment } = experimentFor(project.id, thread.id);
    const failed = createRun({ root, project, thread, experiment, command: "false" });
    store.updateExperimentRun({ runId: failed.id, status: "failed", exitCode: 1 });
    assert.throws(() => graph.createResultFromRun({ runId: failed.id }), /Only a successful run/);

    const logPath = path.join(root, "succeeded.log");
    fs.writeFileSync(logPath, "loss=0.25\naccuracy=0.91\n");
    const succeeded = store.createExperimentRun({
      projectId: project.id,
      threadId: thread.id,
      nodeId: experiment.id,
      command: "false",
      cwd: root,
      logPath,
    });
    store.updateExperimentRun({ runId: succeeded.id, status: "succeeded", exitCode: 0 });
    const result = graph.createResultFromRun({
      runId: succeeded.id,
      verdict: "supports",
      reasoning: "The measured loss dropped.",
    });
    assert.equal(result.kind, "result");
    assert.equal(result.status, "active");
    assert.equal(result.source_run_id, succeeded.id);
    assert.equal(result.current_revision.content.evidence.runId, succeeded.id);
    assert.match(result.current_revision.content.evidence.logTail, /loss=0\.25/);
    assert.equal(result.current_revision.content.interpretation.verdict, "supports");
    const listed = graph.listGraph({ projectId: project.id, threadId: thread.id });
    assert.ok(listed.edges.some((edge) => edge.kind === "produces" && edge.from_node === experiment.id && edge.to_node === result.id));
    assert.throws(() => graph.createResultFromRun({ runId: succeeded.id }), /already has a result/);
  });
});

test("the local runner executes a command and records its log and exit code", async () => {
  await withWorkspaceAsync(async ({ root, project }) => {
    const thread = threadFor(project.id);
    const { experiment } = experimentFor(project.id, thread.id);
    const started = runner.startExperimentRun({
      projectId: project.id,
      threadId: thread.id,
      nodeId: experiment.id,
      command: `${JSON.stringify(process.execPath)} -e "console.log('runner-ok')"`,
      cwd: root,
      workspace: root,
    });
    const final = await started.completion;
    assert.equal(final.status, "succeeded");
    assert.equal(final.exit_code, 0);
    assert.match(fs.readFileSync(final.log_path, "utf8"), /runner-ok/);
    assert.match(fs.readFileSync(final.log_path, "utf8"), /process exited with code 0/);
  });
});

test("the local runner marks a non-zero exit as failed", async () => {
  await withWorkspaceAsync(async ({ root, project }) => {
    const thread = threadFor(project.id);
    const { experiment } = experimentFor(project.id, thread.id);
    const started = runner.startExperimentRun({
      projectId: project.id,
      threadId: thread.id,
      nodeId: experiment.id,
      command: `${JSON.stringify(process.execPath)} -e "process.exit(3)"`,
      cwd: root,
      workspace: root,
    });
    const final = await started.completion;
    assert.equal(final.status, "failed");
    assert.equal(final.exit_code, 3);
  });
});

test("a successful run freezes the experiment plan and its command", async () => {
  await withWorkspaceAsync(async ({ root, project }) => {
    const thread = threadFor(project.id);
    const { experiment } = experimentFor(project.id, thread.id);
    const command = `${JSON.stringify(process.execPath)} -e "console.log('first')"`;
    const started = runner.startExperimentRun({
      projectId: project.id,
      threadId: thread.id,
      nodeId: experiment.id,
      command,
      cwd: root,
      workspace: root,
    });
    await started.completion;
    assert.throws(
      () => graph.reviseNode({ nodeId: experiment.id, content: { hypothesis: "changed after seeing the result" } }),
      /successful run/,
    );
    assert.throws(
      () => runner.startExperimentRun({
        projectId: project.id,
        threadId: thread.id,
        nodeId: experiment.id,
        command: `${JSON.stringify(process.execPath)} -e "console.log('second')"`,
        cwd: root,
        workspace: root,
      }),
      /run command is fixed/,
    );
  });
});

test("a failed-only experiment can still be repaired", async () => {
  await withWorkspaceAsync(async ({ root, project }) => {
    const thread = threadFor(project.id);
    const { experiment } = experimentFor(project.id, thread.id);
    const started = runner.startExperimentRun({
      projectId: project.id,
      threadId: thread.id,
      nodeId: experiment.id,
      command: `${JSON.stringify(process.execPath)} -e "process.exit(2)"`,
      cwd: root,
      workspace: root,
    });
    await started.completion;
    const revised = graph.reviseNode({ nodeId: experiment.id, content: { hypothesis: "repaired", metrics: ["loss"] } });
    assert.equal(revised.current_revision.content.hypothesis, "repaired");
  });
});

test("the local runner can cancel an active run", async () => {
  await withWorkspaceAsync(async ({ root, project }) => {
    const thread = threadFor(project.id);
    const { experiment } = experimentFor(project.id, thread.id);
    const started = runner.startExperimentRun({
      projectId: project.id,
      threadId: thread.id,
      nodeId: experiment.id,
      command: `${JSON.stringify(process.execPath)} -e "setInterval(() => {}, 1000)"`,
      cwd: root,
      workspace: root,
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    runner.cancelExperimentRun(started.run.id);
    const final = await started.completion;
    assert.equal(final.status, "cancelled");
  });
});
