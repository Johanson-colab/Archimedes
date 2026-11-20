const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const test = require("node:test");
const store = require("./store.cjs");
const graph = require("./research-graph/service.cjs");
const runner = require("./research-graph/experiment-runner.cjs");
const directives = require("./agent/experiment-directives.cjs");
const agent = require("./agent.cjs");

function git(root, ...args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

test("experiment worktree keeps uncommitted files safe and ties runs to the isolated workspace", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-experiment-worktree-"));
  try {
    git(root, "init");
    git(root, "config", "user.email", "test@example.com");
    git(root, "config", "user.name", "Test");
    fs.writeFileSync(path.join(root, "code.txt"), "committed\n");
    git(root, "add", "code.txt");
    git(root, "commit", "-m", "initial");
    const base = git(root, "rev-parse", "HEAD");
    fs.writeFileSync(path.join(root, "code.txt"), "uncommitted\n");
    fs.writeFileSync(path.join(root, "untracked.txt"), "keep\n");
    store.openWorkspace(root);
    const project = store.createResearchProject({ name: "Experiment project", workspacePath: root });
    const thread = store.createResearchThread({ prompt: "Test", mode: "experiment-setup", projectId: project.id });
    const question = graph.createNode({ projectId: project.id, threadId: thread.id, kind: "question", title: "Question", content: {} });
    const idea = graph.createNode({ projectId: project.id, threadId: thread.id, kind: "idea", title: "Idea", content: {}, parents: [{ nodeId: question.id }] });
    const experiment = graph.createNode({ projectId: project.id, threadId: thread.id, kind: "experiment", title: "Experiment", content: {}, parents: [{ nodeId: idea.id }] });
    const denied = await directives.executeExperimentDirectives({ directives: [{ action: "prepare_workspace", experiment: experiment.id }], threadId: thread.id, workspace: root, mode: "experiment-setup", approve: async () => false });
    assert.match(denied[0], /rejected/);
    assert.equal(store.getExperimentWorkspace(experiment.id), null);
    const notes = await directives.executeExperimentDirectives({ directives: [{ action: "prepare_workspace", experiment: experiment.id }], threadId: thread.id, workspace: root, mode: "experiment-setup", approve: async () => true });
    assert.match(notes[0], /Only committed code/);
    const isolated = store.getExperimentWorkspace(experiment.id);
    assert.equal(isolated.base_commit, base);
    assert.equal(git(isolated.root, "branch", "--show-current"), isolated.branch_name);
    assert.equal(fs.readFileSync(path.join(isolated.root, "code.txt"), "utf8"), "committed\n");
    assert.equal(fs.readFileSync(path.join(root, "code.txt"), "utf8"), "uncommitted\n");
    assert.equal(fs.readFileSync(path.join(root, "untracked.txt"), "utf8"), "keep\n");
    assert.equal(fs.existsSync(path.join(isolated.root, "untracked.txt")), false);
    assert.equal(store.createExperimentWorkspace(experiment.id).existing, true);
    assert.throws(() => store.deleteProjectWorkspace(isolated.id), /linked to an experiment/);
    const runArgs = { projectId: project.id, threadId: thread.id, nodeId: experiment.id, workspace: isolated.root, cwd: isolated.root, experimentWorkspaceId: isolated.id, command: `${JSON.stringify(process.execPath)} -e "console.log('isolated')"` };
    fs.writeFileSync(path.join(isolated.root, "code.txt"), "not committed\n");
    assert.throws(() => runner.startExperimentRun(runArgs), /uncommitted or untracked/);
    git(isolated.root, "checkout", "--", "code.txt");
    fs.writeFileSync(path.join(isolated.root, "new.txt"), "not committed\n");
    assert.throws(() => runner.startExperimentRun(runArgs), /uncommitted or untracked/);
    git(isolated.root, "add", "new.txt");
    assert.throws(() => runner.startExperimentRun(runArgs), /uncommitted or untracked/);
    git(isolated.root, "reset", "HEAD", "--", "new.txt");
    fs.unlinkSync(path.join(isolated.root, "new.txt"));
    const started = runner.startExperimentRun({ projectId: project.id, threadId: thread.id, nodeId: experiment.id, workspace: isolated.root, cwd: isolated.root, experimentWorkspaceId: isolated.id, command: `${JSON.stringify(process.execPath)} -e "console.log('isolated')"` });
    const finished = await started.completion;
    assert.equal(finished.status, "succeeded");
    assert.equal(finished.commit_sha, base);
    assert.equal(finished.provenance.workspace.id, isolated.id);
    assert.equal(finished.provenance.workspace.baseCommit, base);
    assert.equal(finished.provenance.workspace.branchName, isolated.branch_name);
    const snapshot = finished.provenance.codeSnapshot;
    assert.equal(snapshot.commit, base);
    assert.equal(snapshot.sha256, createHash("sha256").update(fs.readFileSync(snapshot.path)).digest("hex"));
    assert.equal(execFileSync("tar", ["-xOf", snapshot.path, "code.txt"], { encoding: "utf8" }), "committed\n");
    assert.match(snapshot.limitations, /ignored files/);
    assert.throws(() => store.createExperimentRun({ projectId: project.id, threadId: thread.id, nodeId: experiment.id, cwd: root, command: "true", experimentWorkspaceId: isolated.id }), /outside the experiment workspace/);
    const directiveCommand = `${JSON.stringify(process.execPath)} -e "console.log('isolated')"`;
    const runNotes = await directives.executeExperimentDirectives({
      directives: [{ action: "run", experiment: experiment.id, command: directiveCommand, useExperimentWorkspace: true }],
      threadId: thread.id, workspace: root, mode: "experiment-setup", approve: async () => true,
    });
    assert.match(runNotes[0], /run started/);
    let runs = store.listExperimentRuns({ nodeId: experiment.id });
    for (let attempts = 0; attempts < 100 && runs[1]?.status === "running"; attempts++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      runs = store.listExperimentRuns({ nodeId: experiment.id });
    }
    assert.equal(runs[1].status, "succeeded");
    assert.equal(runs[1].provenance.workspace.id, isolated.id);
    const task = store.startTask({ prompt: "Run in experiment workspace" });
    const turn = store.startResearchTurn({ threadId: thread.id, taskId: task.id, prompt: "Run", mode: "experiment-setup" });
    let approval;
    agent.setApprovalSurface(thread.id, true);
    try {
      const pending = agent.executeTool({
        registry: agent.createToolRegistry(),
        call: { id: "isolated-run", function: { name: "run_experiment", arguments: JSON.stringify({ experiment: experiment.id, command: directiveCommand, use_experiment_workspace: true }) } },
        root, threadId: thread.id, taskId: task.id, turnId: turn.id,
        capabilities: { write: "deny", command: "ask" },
        emit: (event) => { if (event.type === "approval") approval = event.action; },
        recordEvent: () => {}, signal: new AbortController().signal,
      });
      for (let attempts = 0; attempts < 100 && !approval; attempts++) await new Promise((resolve) => setTimeout(resolve, 10));
      assert.ok(approval);
      assert.equal(approval.payload.cwd, fs.realpathSync(isolated.root));
      agent.resolveApproval(approval.id, true);
      const result = JSON.parse((await pending).content);
      assert.equal(store.getExperimentRun(result.run_id).provenance.workspace.id, isolated.id);
      for (let attempts = 0; attempts < 100 && store.getExperimentRun(result.run_id).status === "running"; attempts++) await new Promise((resolve) => setTimeout(resolve, 20));
      assert.equal(store.getExperimentRun(result.run_id).status, "succeeded");
    } finally { agent.setApprovalSurface(thread.id, false); }
    const secondExperiment = graph.createNode({ projectId: project.id, threadId: thread.id, kind: "experiment", title: "Second experiment", content: {}, parents: [{ nodeId: idea.id }] });
    let createApproval;
    agent.setApprovalSurface(thread.id, true);
    try {
      const pending = agent.executeTool({
        registry: agent.createToolRegistry(),
        call: { id: "prepare-workspace", function: { name: "prepare_experiment_workspace", arguments: JSON.stringify({ experiment: secondExperiment.id }) } },
        root, threadId: thread.id, taskId: task.id, turnId: turn.id,
        capabilities: { write: "deny", command: "ask" },
        emit: (event) => { if (event.type === "approval") createApproval = event.action; },
        recordEvent: () => {}, signal: new AbortController().signal,
      });
      for (let attempts = 0; attempts < 100 && !createApproval; attempts++) await new Promise((resolve) => setTimeout(resolve, 10));
      assert.ok(createApproval);
      assert.equal(store.getExperimentWorkspace(secondExperiment.id), null);
      agent.resolveApproval(createApproval.id, true);
      const result = JSON.parse((await pending).content);
      assert.equal(result.approved, true);
      assert.equal(result.workspace.id, store.getExperimentWorkspace(secondExperiment.id).id);
      assert.notEqual(result.workspace.branch_name, isolated.branch_name);
    } finally { agent.setApprovalSurface(thread.id, false); }
    const child = graph.createNode({ projectId: project.id, threadId: thread.id, kind: "experiment", title: "Child experiment", content: {}, parents: [{ nodeId: idea.id, kind: "tests" }, { nodeId: experiment.id, kind: "extends" }] });
    assert.throws(() => store.createExperimentWorkspace(child.id), /Choose a recorded parent experiment run/);
    assert.throws(() => store.createExperimentWorkspace(child.id, { parentRunId: "missing" }), /must belong to a parent experiment/);
    fs.writeFileSync(path.join(isolated.root, "code.txt"), "later parent change\n");
    git(isolated.root, "add", "code.txt");
    git(isolated.root, "commit", "-m", "later parent commit");
    assert.notEqual(git(isolated.root, "rev-parse", "HEAD"), base);
    const inherited = store.createExperimentWorkspace(child.id, { parentRunId: finished.id }).workspace;
    assert.equal(inherited.base_commit, base);
    assert.equal(inherited.parent_run_id, finished.id);
    assert.equal(fs.readFileSync(path.join(inherited.root, "code.txt"), "utf8"), "committed\n");
    assert.notEqual(inherited.branch_name, isolated.branch_name);
    const childRun = runner.startExperimentRun({ projectId: project.id, threadId: thread.id, nodeId: child.id, workspace: inherited.root, cwd: inherited.root, experimentWorkspaceId: inherited.id, command: `${JSON.stringify(process.execPath)} -e "console.log('child')"` });
    const childFinished = await childRun.completion;
    assert.equal(childFinished.provenance.workspace.parentRunId, finished.id);
    assert.equal(childFinished.commit_sha, base);
    const createdNotes = await directives.executeExperimentDirectives({
      directives: [{ action: "create", idea: idea.id, title: "Native child", parentExperiment: experiment.id }],
      threadId: thread.id, workspace: root, mode: "experiment-setup", approve: async () => true,
    });
    assert.match(createdNotes[0], /Experiment created/);
    const nativeChild = store.listResearchGraph({ projectId: project.id, threadId: thread.id }).nodes.find((item) => item.title === "Native child");
    let approvalCommand = "";
    const childNotes = await directives.executeExperimentDirectives({
      directives: [{ action: "prepare_workspace", experiment: nativeChild.id, parentRunId: finished.id }],
      threadId: thread.id, workspace: root, mode: "experiment-setup", approve: async ({ command }) => { approvalCommand = command; return true; },
    });
    assert.match(approvalCommand, new RegExp(base));
    assert.match(childNotes[0], /Experiment workspace:/);
    assert.equal(store.getExperimentWorkspace(nativeChild.id).base_commit, base);
    const apiChildResult = await agent.executeTool({
      registry: agent.createToolRegistry(),
      call: { id: "create-child", function: { name: "create_experiment", arguments: JSON.stringify({ idea: idea.id, title: "API child", parent_experiment: experiment.id }) } },
      root, threadId: thread.id, taskId: task.id, turnId: turn.id,
      capabilities: { write: "deny", command: "ask" }, emit: () => {}, recordEvent: () => {}, signal: new AbortController().signal,
    });
    const apiChildId = JSON.parse(apiChildResult.content).experiment_id;
    assert.ok(store.listResearchEdges({ projectId: project.id, threadId: thread.id }).some((edge) => edge.from_node === experiment.id && edge.to_node === apiChildId && edge.kind === "extends"));
    let forkApproval;
    agent.setApprovalSurface(thread.id, true);
    try {
      const pending = agent.executeTool({
        registry: agent.createToolRegistry(), call: { id: "fork-workspace", function: { name: "prepare_experiment_workspace", arguments: JSON.stringify({ experiment: apiChildId, parent_run_id: finished.id }) } },
        root, threadId: thread.id, taskId: task.id, turnId: turn.id, capabilities: { write: "deny", command: "ask" },
        emit: (event) => { if (event.type === "approval") forkApproval = event.action; }, recordEvent: () => {}, signal: new AbortController().signal,
      });
      for (let attempts = 0; attempts < 100 && !forkApproval; attempts++) await new Promise((resolve) => setTimeout(resolve, 10));
      assert.ok(forkApproval);
      assert.match(forkApproval.payload.command, new RegExp(base));
      agent.resolveApproval(forkApproval.id, true);
      assert.equal(JSON.parse((await pending).content).workspace.base_commit, base);
    } finally { agent.setApprovalSurface(thread.id, false); }
    git(isolated.root, "switch", "--detach");
    assert.throws(() => store.createExperimentRun({ projectId: project.id, threadId: thread.id, nodeId: experiment.id, cwd: isolated.root, command: "true", experimentWorkspaceId: isolated.id }), /no longer on its recorded branch/);
  } finally {
    const idle = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-experiment-idle-"));
    store.openWorkspace(idle);
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(idle, { recursive: true, force: true });
  }
});
