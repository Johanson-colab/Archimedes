const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const store = require("./store.cjs");
const graph = require("./research-graph/service.cjs");
const agent = require("./agent.cjs");
const directives = require("./agent/experiment-directives.cjs");

test("reported activity belongs to one experiment and cannot masquerade as a run", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-activity-"));
  try {
    store.openWorkspace(root);
    const project = store.createResearchProject({ name: "Activity" });
    const thread = store.createResearchThread({ prompt: "Research", mode: "research", projectId: project.id });
    const other = store.createResearchThread({ prompt: "Other", mode: "research", projectId: project.id });
    const q = graph.createNode({ projectId: project.id, threadId: thread.id, kind: "question", title: "Question", content: {} });
    const idea = graph.createNode({ projectId: project.id, threadId: thread.id, kind: "idea", title: "Idea", content: {}, parents: [{ nodeId: q.id }] });
    const exp = graph.createNode({ projectId: project.id, threadId: thread.id, kind: "experiment", title: "Experiment", content: {}, parents: [{ nodeId: idea.id }] });
    const task = store.startTask({ prompt: "Prepare baseline" });
    const turn = store.startResearchTurn({ threadId: thread.id, taskId: task.id, prompt: "Prepare baseline", mode: "research" });
    const events = [];
    const response = await agent.executeTool({ registry: agent.createToolRegistry(), call: { id: "activity", function: { name: "record_experiment_activity", arguments: JSON.stringify({ experiment: exp.id, category: "baseline", status: "completed", title: "Baseline checked" }) } }, root, threadId: thread.id, taskId: task.id, turnId: turn.id, capabilities: { write: "deny", command: "deny" }, emit: (event) => events.push(event), recordEvent: () => {}, signal: new AbortController().signal });
    assert.equal(JSON.parse(response.content).activity.source, "agent_reported");
    assert.ok(events.some((event) => event.type === "graph_update"));
    assert.equal(store.listExperimentActivities({ projectId: project.id, threadId: thread.id })[0].title, "Baseline checked");
    assert.equal(store.listExperimentRuns({ nodeId: exp.id }).length, 0);
    assert.throws(() => store.recordExperimentActivity({ projectId: project.id, threadId: other.id, nodeId: exp.id, category: "baseline", status: "completed", title: "Bad" }), /not found in this session/);
    assert.throws(() => store.recordExperimentActivity({ projectId: project.id, threadId: thread.id, nodeId: exp.id, runId: "bad", category: "execution", status: "completed", title: "Bad" }), /Run does not belong/);
    const notes = await directives.executeExperimentDirectives({ directives: [{ action: "activity", experiment: exp.id, category: "repair", status: "failed", title: "Dependency failed" }], threadId: thread.id, workspace: root, mode: "research", turnId: turn.id });
    assert.match(notes[0], /agent-reported/);
    assert.equal(store.listExperimentActivities({ projectId: project.id, threadId: thread.id }).length, 2);
    assert.equal(store.listExperimentActivities({ projectId: project.id, threadId: other.id }).length, 0);
  } finally {
    const idle = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-activity-idle-"));
    store.openWorkspace(idle); fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(idle, { recursive: true, force: true });
  }
});
