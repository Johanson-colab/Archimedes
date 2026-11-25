const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID, createHash } = require("node:crypto");
const { execFile, execFileSync } = require("node:child_process");
const { promisify } = require("node:util");
const test = require("node:test");
const store = require("../store.cjs");
const graph = require("../research-graph/service.cjs");
const agent = require("../agent.cjs");
const { createExperimentBridge } = require("./experiment-bridge.cjs");
const exec = promisify(execFile);

test("mailbox bridge retains one experiment through numerical failure, repair, rerun and reopen", { skip: process.platform === "win32" }, async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-retry-audit-")));
  const idle = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-retry-idle-"));
  let bridge;
  let thread;
  const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const digest = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  try {
    git(root, "init");
    git(root, "config", "user.name", "Isolated audit");
    git(root, "config", "user.email", "audit@example.invalid");
    fs.writeFileSync(path.join(root, ".gitignore"), ".archimedes/\nmetrics.json\n");
    fs.writeFileSync(path.join(root, "data.json"), JSON.stringify([-2, -1, 0, 1, 2].map((x) => ({ x, y: 3 * x + 2 }))));
    fs.writeFileSync(path.join(root, "fit.cjs"), [
      'const fs = require("node:fs");',
      'const data = JSON.parse(fs.readFileSync("data.json", "utf8"));',
      'const mean = data.reduce((s, p) => s + p.y, 0) / data.length;',
      'const slope = data.reduce((s, p) => s + p.x * p.y, 0) / data.reduce((s, p) => s + p.x * p.x, 0);',
      'const intercept = 0; // BUG: omitted intercept',
      'const metrics = { baseline_mse: data.reduce((s, p) => s + (p.y - mean) ** 2, 0) / data.length, mse: data.reduce((s, p) => s + (p.y - slope * p.x - intercept) ** 2, 0) / data.length };',
      'fs.writeFileSync("metrics.json", JSON.stringify(metrics));',
      'console.log(JSON.stringify(metrics));',
      'process.exit(metrics.mse < 1e-10 ? 0 : 2);',
    ].join("\n"));
    git(root, "add", ".");
    git(root, "commit", "-m", "Synthetic regression fixture with missing intercept");
    const originalCommit = git(root, "rev-parse", "HEAD");
    store.openWorkspace(root);
    const project = store.createResearchProject({ name: "Synthetic regression audit", workspacePath: root });
    thread = store.createResearchThread({ projectId: project.id, prompt: "Can linear regression improve on a mean baseline?", mode: "research" });
    const question = graph.createNode({ projectId: project.id, threadId: thread.id, kind: "question", title: "Can a linear model beat the mean baseline?", content: {} });
    const idea = graph.createNode({ projectId: project.id, threadId: thread.id, kind: "idea", title: "Fit slope and intercept", content: { hypothesis: "A fitted line lowers MSE on the synthetic data." }, parents: [{ nodeId: question.id }] });
    const task = store.startTask({ prompt: "Validate the fitted-line idea" });
    const turn = store.startResearchTurn({ threadId: thread.id, taskId: task.id, prompt: "Validate this idea", mode: "research" });
    const registry = agent.createToolRegistry();
    const approvals = [];
    agent.setApprovalSurface(thread.id, true);
    bridge = await createExperimentBridge({ workspace: root, invoke: async (name, args, signal, isRequestActive) => {
      const result = await agent.executeTool({ registry, root, threadId: thread.id, taskId: task.id, turnId: turn.id,
        call: { id: randomUUID(), function: { name, arguments: JSON.stringify(args) } }, capabilities: { write: "ask", command: "ask" }, signal, isRequestActive,
        emit: (event) => {
          if (event.type !== "approval") return;
          const action = event.action;
          // Only approve this fixture's known worktree/command and paths.
          assert.ok(action.payload.cwd === root || action.payload.cwd.startsWith(`${root}${path.sep}`));
          assert.ok(action.payload.command.startsWith("Create an isolated Git worktree") || action.payload.command === command);
          approvals.push(action.id);
          agent.resolveApproval(action.id, true);
        }, recordEvent: () => {} });
      return JSON.parse(result.content);
    } });
    const invoke = async (method, args) => JSON.parse((await exec(process.execPath, [path.join(__dirname, "experiment-bridge-cli.cjs"), bridge.credentialPath, method, JSON.stringify(args)], { timeout: 12_000 })).stdout);
    const command = `'${process.execPath.replaceAll("'", "'\\''")}' fit.cjs`;
    const created = await invoke("create_experiment", { idea: idea.id, title: "Fit a line on fixed synthetic data", metrics: ["baseline_mse", "mse"] });
    const experiment = created.experiment_id;
    const prepared = await invoke("prepare_experiment_workspace", { experiment });
    const worktree = prepared.workspace.root;
    await invoke("record_experiment_activity", { experiment, category: "baseline", status: "started", title: "Compare against the sample mean" });
    assert.equal(store.listExperimentRuns({ nodeId: experiment }).length, 0);
    const first = await invoke("run_experiment", { experiment, command, use_experiment_workspace: true });
    assert.equal((await invoke("wait_experiment", { run_id: first.run_id, timeout_seconds: 5 })).status, "failed");
    const failedMetrics = JSON.parse(fs.readFileSync(path.join(worktree, "metrics.json"), "utf8"));
    assert.deepEqual(failedMetrics, { baseline_mse: 18, mse: 4 });
    assert.match((await invoke("read_experiment_log", { run_id: first.run_id })).text, /"mse":4/);
    await invoke("record_experiment_evidence", { run_id: first.run_id, metrics: failedMetrics, artifacts: ["metrics.json"] });
    await assert.rejects(() => invoke("create_experiment_result", { run_id: first.run_id, verdict: "supports", reasoning: "Not valid: acceptance check failed." }), /Only a successful run/);
    await invoke("record_experiment_activity", { experiment, run_id: first.run_id, category: "repair", status: "completed", title: "Restore the omitted intercept before retrying" });
    fs.writeFileSync(path.join(worktree, "fit.cjs"), fs.readFileSync(path.join(worktree, "fit.cjs"), "utf8").replace("const intercept = 0; // BUG: omitted intercept", "const intercept = mean;"));
    git(worktree, "add", "fit.cjs");
    git(worktree, "commit", "-m", "Restore the intercept for centered synthetic inputs");
    const second = await invoke("run_experiment", { experiment, command, use_experiment_workspace: true });
    assert.equal((await invoke("wait_experiment", { run_id: second.run_id, timeout_seconds: 5 })).status, "succeeded");
    const passedMetrics = JSON.parse(fs.readFileSync(path.join(worktree, "metrics.json"), "utf8"));
    assert.deepEqual(passedMetrics, { baseline_mse: 18, mse: 0 });
    const evidence = await invoke("record_experiment_evidence", { run_id: second.run_id, metrics: passedMetrics, artifacts: ["metrics.json"] });
    assert.match(evidence.notice, /reported by the agent/);
    const result = await invoke("create_experiment_result", { run_id: second.run_id, verdict: "supports", reasoning: "On this fixed synthetic dataset, MSE fell from 18 for the mean baseline to 0 for the fitted line." });
    await assert.rejects(() => invoke("create_experiment_result", { run_id: second.run_id, verdict: "supports", reasoning: "Duplicate submission" }), /already has a result/);
    assert.equal(approvals.length, 3);
    bridge.close();
    store.openWorkspace(idle);
    store.openWorkspace(root);
    const runs = store.listExperimentRuns({ nodeId: experiment });
    assert.deepEqual(runs.map((run) => [run.id, run.status, run.exit_code]), [[first.run_id, "failed", 2], [second.run_id, "succeeded", 0]]);
    assert.equal(runs[0].commit_sha, originalCommit);
    assert.notEqual(runs[0].commit_sha, runs[1].commit_sha);
    assert.notEqual(runs[0].evidence[0].artifacts[0].sha256, runs[1].evidence[0].artifacts[0].sha256);
    for (const run of runs) {
      assert.equal(run.provenance.workspace.id, prepared.workspace.id);
      assert.equal(run.provenance.ideas[0].nodeId, idea.id);
      assert.equal(digest(run.provenance.codeSnapshot.path), run.provenance.codeSnapshot.sha256);
      assert.equal(run.evidence[0].turn_id, turn.id);
    }
    const listed = graph.listGraph({ projectId: project.id, threadId: thread.id });
    assert.deepEqual(listed.nodes.map((node) => node.kind).sort(), ["experiment", "idea", "question", "result"]);
    assert.equal(listed.nodes.find((node) => node.id === result.result_id).source_run_id, second.run_id);
    assert.ok(listed.edges.some((edge) => edge.kind === "tests" && edge.from_node === idea.id && edge.to_node === experiment));
    assert.ok(listed.edges.some((edge) => edge.kind === "produces" && edge.from_node === experiment && edge.to_node === result.result_id));
    const activities = store.listExperimentActivities({ projectId: project.id, threadId: thread.id });
    assert.equal(activities.length, 2);
    assert.ok(activities.every((activity) => activity.source === "agent_reported"));
    assert.equal(graph.validateGraph({ projectId: project.id, threadId: thread.id }).ok, true);
  } finally {
    bridge?.close();
    if (thread) agent.setApprovalSurface(thread.id, false);
    store.openWorkspace(idle);
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(idle, { recursive: true, force: true });
  }
});
