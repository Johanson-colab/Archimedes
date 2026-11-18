const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile, spawn } = require("node:child_process");
const { promisify } = require("node:util");
const test = require("node:test");
const { createExperimentBridge } = require("./experiment-bridge.cjs");
const store = require("../store.cjs");
const graph = require("../research-graph/service.cjs");
const agent = require("../agent.cjs");
const cli = path.join(__dirname, "experiment-bridge-cli.cjs");
const exec = promisify(execFile);

async function invoke(bridge, method, args) {
  const result = await exec(process.execPath, [cli, bridge.credentialPath, method, JSON.stringify(args)], { timeout: 5000 });
  return JSON.parse(result.stdout);
}

test("live bridge records session-scoped work and is revoked at turn end", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ab-"));
  let bridge;
  try {
    store.openWorkspace(root);
    const project = store.createResearchProject({ name: "Bridge" });
    const thread = store.createResearchThread({ prompt: "Research", mode: "research", projectId: project.id });
    const question = graph.createNode({ projectId: project.id, threadId: thread.id, kind: "question", title: "Question", content: {} });
    const idea = graph.createNode({ projectId: project.id, threadId: thread.id, kind: "idea", title: "Idea", content: {}, parents: [{ nodeId: question.id }] });
    const task = store.startTask({ prompt: "Run experiment" });
    const turn = store.startResearchTurn({ threadId: thread.id, taskId: task.id, prompt: "Run experiment", mode: "research" });
    let approval;
    agent.setApprovalSurface(thread.id, true);
    const controller = new AbortController();
    bridge = await createExperimentBridge({ workspace: root, signal: controller.signal, invoke: async (name, args, signal, isRequestActive) => {
      const result = await agent.executeTool({ registry: agent.createToolRegistry(), root, threadId: thread.id, taskId: task.id, turnId: turn.id,
        call: { id: `call-${name}`, function: { name, arguments: JSON.stringify(args) } }, capabilities: { write: "ask", command: "ask" }, signal, isRequestActive,
        emit: (event) => { if (event.type === "approval") approval = event.action; }, recordEvent: () => {} });
      return JSON.parse(result.content);
    } });
    assert.match(bridge.instructions, /Live Archimedes experiment tools/);
    const created = await invoke(bridge, "create_experiment", { idea: idea.id, title: "Bridge experiment" });
    assert.ok(created.experiment_id);
    assert.equal(store.listResearchGraph({ projectId: project.id, threadId: thread.id }).nodes.filter((node) => node.kind === "experiment").length, 1);
    const recorded = await invoke(bridge, "record_experiment_activity", { experiment: created.experiment_id, category: "baseline", status: "completed", title: "Baseline checked" });
    assert.equal(recorded.activity.source, "agent_reported");
    assert.equal(store.listExperimentRuns({ nodeId: created.experiment_id }).length, 0);
    const pending = invoke(bridge, "run_experiment", { experiment: created.experiment_id, command: `${JSON.stringify(process.execPath)} -e "console.log('bridge')"` });
    for (let i = 0; i < 200 && !approval; i++) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.ok(approval, "a live bridge run must request approval");
    assert.equal(store.listExperimentRuns({ nodeId: created.experiment_id }).length, 0);
    agent.resolveApproval(approval.id, true);
    const started = await pending;
    assert.equal(started.approved, true);
    for (let i = 0; i < 200 && !["succeeded", "failed"].includes(store.getExperimentRun(started.run_id).status); i++) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(store.getExperimentRun(started.run_id).status, "succeeded");
    const second = await invoke(bridge, "create_experiment", { idea: idea.id, title: "Denied experiment" });
    approval = null;
    const rejected = invoke(bridge, "run_experiment", { experiment: second.experiment_id, command: "true" });
    for (let i = 0; i < 200 && !approval; i++) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.ok(approval);
    agent.resolveApproval(approval.id, false);
    assert.equal((await rejected).approved, false);
    assert.equal(store.listExperimentRuns({ nodeId: second.experiment_id }).length, 0);
    await assert.rejects(() => invoke(bridge, "execute_shell", { command: "true" }), /not authorized or is invalid/);
    const disconnected = await invoke(bridge, "create_experiment", { idea: idea.id, title: "Disconnected experiment" });
    approval = null;
    const child = spawn(process.execPath, [cli, bridge.credentialPath, "run_experiment", JSON.stringify({ experiment: disconnected.experiment_id, command: "true" })], { stdio: "ignore" });
    for (let i = 0; i < 200 && !approval; i++) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.ok(approval);
    child.kill("SIGKILL");
    await new Promise((resolve) => child.once("exit", resolve));
    agent.resolveApproval(approval.id, true);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(store.listExperimentRuns({ nodeId: disconnected.experiment_id }).length, 0);
    assert.equal(store.getAction(approval.id).status, "rejected");
    const third = await invoke(bridge, "create_experiment", { idea: idea.id, title: "Interrupted experiment" });
    approval = null;
    const interrupted = invoke(bridge, "run_experiment", { experiment: third.experiment_id, command: "true" }).catch((error) => error);
    for (let i = 0; i < 200 && !approval; i++) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.ok(approval);
    controller.abort();
    await interrupted;
    for (let i = 0; i < 100 && store.getAction(approval.id).status === "pending"; i++) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(store.getAction(approval.id).status, "rejected");
    assert.equal(store.listExperimentRuns({ nodeId: third.experiment_id }).length, 0);
    assert.equal(fs.existsSync(bridge.credentialPath), false);
    await assert.rejects(() => invoke(bridge, "create_experiment", { idea: idea.id, title: "Late" }));
    agent.setApprovalSurface(thread.id, false);
  } finally {
    bridge?.close();
    const idle = fs.mkdtempSync(path.join(os.tmpdir(), "ab-idle-"));
    store.openWorkspace(idle); fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(idle, { recursive: true, force: true });
  }
});

test("bridge rejects requests without the per-turn secret", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ab-"));
  let bridge;
  try {
    let called = false;
    bridge = await createExperimentBridge({ workspace: root, invoke: async () => { called = true; } });
    const connection = JSON.parse(fs.readFileSync(bridge.credentialPath, "utf8"));
    const id = "a".repeat(32);
    const requestPath = path.join(connection.directory, `${id}.request`);
    const responsePath = path.join(connection.directory, `${id}.response`);
    fs.writeFileSync(requestPath, JSON.stringify({ secret: "wrong", method: "create_experiment", arguments: {}, pid: process.pid }));
    for (let i = 0; i < 100 && !fs.existsSync(responsePath); i++) await new Promise((resolve) => setTimeout(resolve, 20));
    const reply = JSON.parse(fs.readFileSync(responsePath, "utf8"));
    assert.match(reply.error, /not authorized/);
    fs.unlinkSync(requestPath);
    assert.equal(called, false);
  } finally { bridge?.close(); fs.rmSync(root, { recursive: true, force: true }); }
});

test("interrupt revokes pending requests without deleting unrelated files", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ab-"));
  let bridge;
  try {
    let invoked;
    const ready = new Promise((resolve) => { invoked = resolve; });
    let cancelled = false;
    const controller = new AbortController();
    bridge = await createExperimentBridge({ workspace: root, signal: controller.signal, invoke: async (_name, _args, signal) => {
      invoked();
      return new Promise((_resolve, reject) => signal.addEventListener("abort", () => { cancelled = true; reject(new Error("interrupted")); }, { once: true }));
    } });
    const unexpected = path.join(path.dirname(bridge.credentialPath), "user-data.txt");
    fs.writeFileSync(unexpected, "preserve");
    const pending = invoke(bridge, "create_experiment", { idea: "x", title: "y" }).catch((error) => error);
    await ready;
    controller.abort();
    await pending;
    assert.equal(cancelled, true);
    assert.equal(fs.readFileSync(unexpected, "utf8"), "preserve");
    assert.equal(fs.existsSync(bridge.credentialPath), false);
  } finally { bridge?.close(); fs.rmSync(root, { recursive: true, force: true }); }
});

test("the bundled Electron runtime can invoke the live CLI in Node mode", async (t) => {
  let electron;
  try { electron = require("electron"); } catch { t.skip("Electron runtime not installed"); return; }
  if (typeof electron !== "string" || !fs.existsSync(electron)) { t.skip("Electron executable unavailable"); return; }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ab-"));
  let bridge;
  try {
    bridge = await createExperimentBridge({ workspace: root, invoke: async (method) => ({ method }) });
    const result = await exec(electron, [cli, bridge.credentialPath, "create_experiment", "{}"], { timeout: 5000, env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } });
    assert.equal(JSON.parse(result.stdout).method, "create_experiment");
  } finally { bridge?.close(); fs.rmSync(root, { recursive: true, force: true }); }
});
