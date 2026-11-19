const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const store = require("./store.cjs");
const graph = require("./research-graph/service.cjs");
const runner = require("./research-graph/experiment-runner.cjs");
const agent = require("./agent.cjs");

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

test("runs retain the experiment and source idea revisions after later edits", () => {
  withWorkspace(({ root, project }) => {
    const thread = threadFor(project.id);
    const { question, idea, experiment } = experimentFor(project.id, thread.id);
    const originalIdeaRevision = idea.current_revision_id;
    const originalExperimentRevision = experiment.current_revision_id;
    graph.reviseNode({ nodeId: idea.id, content: { hypothesis: "Later idea" } });
    const first = createRun({ root, project, thread, experiment });
    assert.equal(first.provenance.experimentRevisionId, originalExperimentRevision);
    assert.deepEqual(first.provenance.ideas, [{
      nodeId: idea.id, revisionId: originalIdeaRevision, experimentRevisionId: originalExperimentRevision,
    }]);
    assert.ok(first.provenance.ancestry.some((item) => item.nodeId === question.id && item.revisionId === question.current_revision_id));
    store.updateExperimentRun({ runId: first.id, status: "failed", exitCode: 1 });
    const revised = graph.reviseNode({ nodeId: experiment.id, content: { hypothesis: "Repaired plan" } });
    const second = createRun({ root, project, thread, experiment });
    assert.equal(second.provenance.experimentRevisionId, revised.current_revision_id);
    assert.equal(second.provenance.ideas[0].revisionId, originalIdeaRevision);
    assert.equal(store.getExperimentRun(first.id).provenance.experimentRevisionId, originalExperimentRevision);
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
    assert.equal(result.current_revision.content.evidence.provenance.experimentRevisionId, experiment.current_revision_id);
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

test("the API experiment tool creates an experiment under an idea", async () => {
  await withWorkspaceAsync(async ({ root, project }) => {
    const thread = threadFor(project.id);
    const task = store.startTask({ prompt: "Create the experiment." });
    const turn = store.startResearchTurn({ threadId: thread.id, taskId: task.id, prompt: "Create the experiment.", mode: "experiment-setup" });
    const registry = agent.createToolRegistry();
    const ideaResult = await agent.executeTool({
      registry,
      call: {
        id: "call-create-idea",
        function: {
          name: "create_idea",
          arguments: JSON.stringify({
            title: "Tool-created idea",
            hypothesis: "The tool records the hypothesis.",
            prediction: "A measurable improvement appears.",
          }),
        },
      },
      root,
      threadId: thread.id,
      taskId: task.id,
      turnId: turn.id,
      capabilities: { write: "deny", command: "deny" },
      emit: () => {},
      recordEvent: () => {},
      signal: new AbortController().signal,
    });
    const parsedIdea = JSON.parse(ideaResult.content);
    assert.ok(parsedIdea.idea_id);
    const listedWithIdea = store.listResearchGraph({ projectId: project.id, threadId: thread.id });
    const createdIdea = listedWithIdea.nodes.find((node) => node.id === parsedIdea.idea_id);
    assert.equal(createdIdea.kind, "idea");
    assert.equal(createdIdea.current_revision.content.hypothesis, "The tool records the hypothesis.");
    const idea = createdIdea;
    const events = [];
    const result = await agent.executeTool({
      registry,
      call: {
        id: "call-create-experiment",
        function: {
          name: "create_experiment",
          arguments: JSON.stringify({
            idea: idea.title,
            title: "Tool-created experiment",
            hypothesis: "The tool records the plan.",
            baseline: "no change",
            method: "run the baseline",
            metrics: ["loss"],
            stop_criteria: "one run",
          }),
        },
      },
      root,
      threadId: thread.id,
      taskId: task.id,
      turnId: turn.id,
      capabilities: { write: "deny", command: "deny" },
      emit: (event) => events.push(event),
      recordEvent: () => {},
      signal: new AbortController().signal,
    });
    const parsed = JSON.parse(result.content);
    assert.ok(parsed.experiment_id);
    const listed = store.listResearchGraph({ projectId: project.id, threadId: thread.id });
    const created = listed.nodes.find((node) => node.id === parsed.experiment_id);
    assert.equal(created.title, "Tool-created experiment");
    assert.equal(created.current_revision.content.baseline, "no change");
    assert.deepEqual(created.current_revision.content.metrics, ["loss"]);
    assert.ok(listed.edges.some((edge) => edge.kind === "tests" && edge.to_node === created.id));
  });
});

test("the API run tool waits for approval and starts a recorded run", async () => {
  await withWorkspaceAsync(async ({ root, project }) => {
    const thread = threadFor(project.id);
    const { experiment } = experimentFor(project.id, thread.id);
    const task = store.startTask({ prompt: "Run the experiment." });
    const turn = store.startResearchTurn({ threadId: thread.id, taskId: task.id, prompt: "Run the experiment.", mode: "experiment-setup" });
    const registry = agent.createToolRegistry();
    let action = null;
    agent.setApprovalSurface(thread.id, true);
    try {
      const pending = agent.executeTool({
        registry,
        call: {
          id: "call-run-experiment",
          function: {
            name: "run_experiment",
            arguments: JSON.stringify({
              experiment: experiment.title,
              command: `${JSON.stringify(process.execPath)} -e "console.log('tool-run')"`,
            }),
          },
        },
        root,
        threadId: thread.id,
        taskId: task.id,
        turnId: turn.id,
        capabilities: { write: "deny", command: "ask" },
        emit: (event) => {
          if (event.type === "approval" && event.action) action = event.action;
        },
        recordEvent: () => {},
        signal: new AbortController().signal,
      });
      const deadline = Date.now() + 2_000;
      while (!action && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
      assert.ok(action, "the run tool should request approval");
      agent.resolveApproval(action.id, true);
      const result = await pending;
      const parsed = JSON.parse(result.content);
      assert.equal(parsed.approved, true);
      assert.ok(parsed.run_id);
      const runDeadline = Date.now() + 6_000;
      let final = store.getExperimentRun(parsed.run_id);
      while (final && !["succeeded", "failed", "cancelled"].includes(final.status) && Date.now() < runDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        final = store.getExperimentRun(parsed.run_id);
      }
      assert.equal(final.status, "succeeded");
      assert.match(fs.readFileSync(final.log_path, "utf8"), /tool-run/);

      const logResult = await agent.executeTool({
        registry,
        call: { id: "call-read-log", function: { name: "read_experiment_log", arguments: JSON.stringify({ run_id: parsed.run_id }) } },
        root,
        threadId: thread.id,
        taskId: task.id,
        turnId: turn.id,
        capabilities: { write: "deny", command: "ask" },
        emit: () => {},
        recordEvent: () => {},
        signal: new AbortController().signal,
      });
      assert.match(JSON.parse(logResult.content).text, /tool-run/);

      const resultTool = await agent.executeTool({
        registry,
        call: {
          id: "call-create-result",
          function: {
            name: "create_experiment_result",
            arguments: JSON.stringify({ run_id: parsed.run_id, verdict: "supports", reasoning: "The tool ran." }),
          },
        },
        root,
        threadId: thread.id,
        taskId: task.id,
        turnId: turn.id,
        capabilities: { write: "deny", command: "ask" },
        emit: () => {},
        recordEvent: () => {},
        signal: new AbortController().signal,
      });
      const resultNode = JSON.parse(resultTool.content);
      assert.ok(resultNode.result_id);
      const listed = store.listResearchGraph({ projectId: project.id, threadId: thread.id });
      assert.ok(listed.nodes.some((node) => node.id === resultNode.result_id && node.kind === "result"));
    } finally {
      agent.setApprovalSurface(thread.id, false);
    }
  });
});

test('managed experiment receives explicitly shared environment variables', async t => {
  const { setEnvironmentVault } = require('./environment-vault.cjs');
  setEnvironmentVault({ shared: () => ({ HF_TOKEN: 'synthetic-test-token' }) });
  t.after(() => setEnvironmentVault(null));
  await withWorkspaceAsync(async ({ root, project }) => {
    const thread = threadFor(project.id); const { experiment } = experimentFor(project.id, thread.id);
    const command = `${JSON.stringify(process.execPath)} -e "process.exit(process.env.HF_TOKEN?.length === 20 ? 0 : 1)"`;
    const started = runner.startExperimentRun({ projectId: project.id, threadId: thread.id, nodeId: experiment.id, command, cwd: root, workspace: root });
    const final = await started.completion;
    assert.equal(final.status, 'succeeded');
    assert.doesNotMatch(fs.readFileSync(final.log_path, 'utf8'), /synthetic-test-token/);
  });
});
