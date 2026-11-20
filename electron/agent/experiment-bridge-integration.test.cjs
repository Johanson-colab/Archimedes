const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const test = require("node:test");
const store = require("../store.cjs");
const graph = require("../research-graph/service.cjs");
const external = require("./external-backend.cjs");
const exec = promisify(execFile);
let connectionFile;
external.runNative = async (options) => {
  if (options.config.permissionMode === "read-only") {
    assert.equal(options.experimentDynamicTools.length, 0);
    assert.equal(options.invokeExperimentTool, null);
    assert.match(options.experimentBridgeInstructions, /read-only or plan/);
    return 'Read-only.\n```experiment\n{"action":"create","idea":"Idea","title":"Must not be created"}\n```';
  }
  assert.ok(options.experimentDynamicTools.some((tool) => tool.name === "create_experiment"));
  const created = await options.invokeExperimentTool("create_experiment", { idea: "Idea", title: "Live experiment" }, options.signal);
  const match = options.experimentBridgeInstructions.match(/Command prefix: .*'([^']+connection\.json)'/);
  assert.ok(match, "the native turn receives the CLI connection path");
  connectionFile = match[1];
  const cli = path.join(__dirname, "experiment-bridge-cli.cjs");
  const output = await exec(process.execPath, [cli, connectionFile, "record_experiment_activity", JSON.stringify({ experiment: created.experiment_id, category: "baseline", status: "completed", title: "Baseline checked" })]);
  assert.equal(JSON.parse(output.stdout).activity.source, "agent_reported");
  return "Experiment prepared.";
};
const agent = require("../agent.cjs");

test("native Research turn creates an experiment and reports a step before finishing", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ab-"));
  try {
    store.openWorkspace(root);
    const project = store.createResearchProject({ name: "Bridge integration", workspacePath: root });
    const thread = store.createResearchThread({ prompt: "Research", mode: "research", projectId: project.id });
    const q = graph.createNode({ projectId: project.id, threadId: thread.id, kind: "question", title: "Question", content: {} });
    graph.createNode({ projectId: project.id, threadId: thread.id, kind: "idea", title: "Idea", content: {}, parents: [{ nodeId: q.id }] });
    const result = await agent.runAgent({ prompt: "Validate Idea", workspace: root, threadId: thread.id, projectId: project.id, mode: "research", origin: "research", externalBackend: { backend: "codex", permissionMode: "ask" }, capabilities: { write: "ask", command: "ask" }, autoBuildGraph: false });
    assert.equal(result.status, "completed");
    const experiment = store.listResearchGraph({ projectId: project.id, threadId: thread.id }).nodes.find((node) => node.kind === "experiment");
    assert.equal(experiment.title, "Live experiment");
    assert.equal(store.listExperimentActivities({ projectId: project.id, threadId: thread.id })[0].title, "Baseline checked");
    assert.equal(store.listExperimentRuns({ nodeId: experiment.id }).length, 0);
    assert.equal(fs.existsSync(connectionFile), false);
  } finally {
    const idle = fs.mkdtempSync(path.join(os.tmpdir(), "ab-idle-")); store.openWorkspace(idle);
    fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(idle, { recursive: true, force: true });
  }
});


test("read-only native turns cannot use live or fallback experiment writes", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ab-"));
  try {
    store.openWorkspace(root);
    const project = store.createResearchProject({ name: "Read-only bridge", workspacePath: root });
    const thread = store.createResearchThread({ prompt: "Research", mode: "research", projectId: project.id });
    const q = graph.createNode({ projectId: project.id, threadId: thread.id, kind: "question", title: "Question", content: {} });
    graph.createNode({ projectId: project.id, threadId: thread.id, kind: "idea", title: "Idea", content: {}, parents: [{ nodeId: q.id }] });
    const result = await agent.runAgent({ prompt: "Consider an experiment", workspace: root, threadId: thread.id, projectId: project.id, mode: "research", origin: "research", externalBackend: { backend: "codex", permissionMode: "read-only" }, capabilities: { write: "ask", command: "ask" }, autoBuildGraph: false });
    assert.equal(result.status, "completed");
    assert.match(result.response, /not executed/);
    assert.equal(store.listResearchGraph({ projectId: project.id, threadId: thread.id }).nodes.filter((node) => node.kind === "experiment").length, 0);
  } finally {
    const idle = fs.mkdtempSync(path.join(os.tmpdir(), "ab-idle-")); store.openWorkspace(idle);
    fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(idle, { recursive: true, force: true });
  }
});
