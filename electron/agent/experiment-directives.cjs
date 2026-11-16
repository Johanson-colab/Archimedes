const fs = require("node:fs");
const path = require("node:path");
const store = require("../store.cjs");
const graph = require("../research-graph/service.cjs");
const runner = require("../research-graph/experiment-runner.cjs");
const runs = require("../research-graph/experiment-runs.cjs");

const MAX_DIRECTIVES = 3;
const MAX_COMMAND_CHARS = 4_000;
const BLOCK = /```experiment[ \t]*\r?\n([\s\S]*?)```/gi;

function extractExperimentDirectives(text) {
  const directives = [];
  const cleaned = String(text || "").replace(BLOCK, (_match, body) => {
    try {
      const value = JSON.parse(body.trim());
      if (value && typeof value === "object" && !Array.isArray(value)) directives.push(value);
    } catch {
      // A malformed block is dropped from the visible answer; the model can
      // retry with a valid one in the next turn.
    }
    return "";
  }).replace(/\n{3,}/g, "\n\n").trim();
  return { text: cleaned, directives: directives.slice(0, MAX_DIRECTIVES) };
}

function resolveNode({ thread, value, kind, label }) {
  const key = String(value || "").trim();
  if (!key) throw new Error(`An ${label} id or title is required.`);
  const listed = store.listResearchGraph({ projectId: thread.project_id, threadId: thread.id });
  const node = listed.nodes.find((item) => item.id === key)
    || listed.nodes.find((item) => item.kind === kind && item.title === key)
    || listed.nodes.find((item) => item.kind === kind && item.title.toLowerCase() === key.toLowerCase());
  if (!node) throw new Error(`${label} not found in this session: ${key}`);
  if (node.kind !== kind) throw new Error(`The selected node is not an ${label}.`);
  return node;
}

function resolveRun({ thread, runId }) {
  const run = store.getExperimentRun(String(runId || "").trim());
  if (!run || run.thread_id !== thread.id) throw new Error("Experiment run not found in this session.");
  return run;
}

function graphUpdateEvent({ thread, turnId, nodeIds = [], edgeIds = [], nodeCount = 0, edgeCount = 0 }) {
  return {
    type: "graph_update",
    title: "Research graph updated",
    graph: {
      projectId: thread.project_id,
      threadId: thread.id,
      turnId,
      createdNodeIds: nodeIds,
      createdEdgeIds: edgeIds,
      superseded: [],
      nodeCount,
      edgeCount,
    },
  };
}

function experimentPrompt() {
  return [
    "Experiment recording directive (Experiment setup only):",
    "When you are ready to create or run an experiment, emit one fenced block at the very end of your response:",
    "```experiment",
    '{"action":"create","idea":"<exact idea title>","title":"...","hypothesis":"...","baseline":"...","method":"...","metrics":["..."],"stopCriteria":"..."}',
    "```",
    "or",
    "```experiment",
    '{"action":"run","experiment":"<exact experiment title>","command":"<shell command>"}',
    "```",
    "The app strips the block, creates the experiment or starts the run, and records its log. Do not claim the run finished in this turn.",
    "On a later turn, recorded runs appear under 'Recent experiment runs'. Use:",
    "```experiment",
    '{"action":"log","runId":"..."}',
    "```",
    "to read a log, then",
    "```experiment",
    '{"action":"result","runId":"...","verdict":"supports|contradicts|inconclusive","reasoning":"..."}',
    "```",
    "to write the measured result into the graph.",
  ].join("\n");
}

function recentExperimentRuns(threadId, limit = 3) {
  try {
    const thread = store.getResearchThread(threadId);
    const latest = new Map();
    for (const event of thread.events || []) {
      if (event.type !== "experiment_run" || !event.payload?.run) continue;
      latest.set(event.payload.run.id, event.payload.run);
    }
    return [...latest.values()].slice(-limit).map((run) => {
      const node = store.getResearchNode(run.node_id);
      return `- run ${run.id} · ${node?.title || run.node_id} · ${run.status} · exit ${run.exit_code ?? "unknown"} · log ${run.log_path}`;
    }).join("\n");
  } catch {
    return "";
  }
}

async function executeExperimentDirectives({ directives = [], threadId, workspace, mode = null, turnId = null, emit = () => {}, recordEvent = () => {}, approve = null } = {}) {
  if (!directives.length) return [];
  const thread = store.getResearchThread(threadId);
  if ((mode || thread.mode) !== "experiment-setup") throw new Error("Experiment directives are only allowed in the Experiment setup stage.");
  const notes = [];
  for (const directive of directives) {
    const action = String(directive.action || "").toLowerCase();
    try {
      if (action === "create") {
        const idea = resolveNode({ thread, value: directive.idea, kind: "idea", label: "Idea" });
        const title = String(directive.title || "").trim();
        if (!title) throw new Error("An experiment title is required.");
        const existing = store.listResearchGraph({ projectId: thread.project_id, threadId: thread.id }).nodes
          .find((item) => item.kind === "experiment" && item.title.toLowerCase() === title.toLowerCase());
        if (existing) {
          notes.push(`Experiment already exists: ${existing.title} (${existing.id}).`);
          continue;
        }
        const metrics = Array.isArray(directive.metrics) ? directive.metrics.map((item) => String(item).trim()).filter(Boolean).slice(0, 20) : [];
        const experiment = graph.createNode({
          projectId: thread.project_id,
          threadId: thread.id,
          kind: "experiment",
          status: "active",
          title,
          summary: String(directive.hypothesis || "").slice(0, 500),
          content: {
            hypothesis: String(directive.hypothesis || "").trim(),
            baseline: String(directive.baseline || "").trim(),
            method: String(directive.method || "").trim(),
            metrics,
            stopCriteria: String(directive.stopCriteria || "").trim(),
          },
          parents: [{ nodeId: idea.id, kind: "tests" }],
          sourceTurnId: turnId,
        });
        emit(graphUpdateEvent({ thread, turnId, nodeIds: [experiment.id], nodeCount: 1, edgeCount: 1 }));
        notes.push(`Experiment created: ${experiment.title} (${experiment.id}).`);
        continue;
      }

      if (action === "run") {
        const experiment = resolveNode({ thread, value: directive.experiment, kind: "experiment", label: "Experiment" });
        const command = String(directive.command || "").trim();
        if (!command) throw new Error("A run command is required.");
        if (command.length > MAX_COMMAND_CHARS) throw new Error("The experiment command is too long.");
        const cwd = directive.cwd ? path.resolve(workspace, String(directive.cwd)) : workspace;
        if (cwd !== workspace && !cwd.startsWith(`${workspace}${path.sep}`)) throw new Error("The run folder is outside the workspace.");
        if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) throw new Error("The run folder is no longer available.");
        if (approve) {
          const allowed = await approve({
            command,
            cwd,
            reason: `Experiment: ${experiment.title}`,
            nativeMethod: "archimedes/experiment",
          });
          if (!allowed) {
            notes.push(`Experiment run rejected: ${experiment.title}.`);
            continue;
          }
        }
        const started = runner.startExperimentRun({
          projectId: thread.project_id,
          threadId: thread.id,
          nodeId: experiment.id,
          command,
          cwd,
          workspace,
          onUpdate: (run) => {
            emit({ type: "tool", title: "Experiment run", detail: `${run.status} · ${experiment.title}`, experimentRun: run });
            recordEvent({ type: "experiment_run", payload: { run } });
          },
        });
        void started.completion.then((run) => {
          recordEvent({ type: "experiment_run", payload: { run } });
          emit({ type: "tool", title: "Experiment run finished", detail: `${run.status} · exit ${run.exit_code ?? "unknown"} · ${experiment.title}`, experimentRun: run });
        }).catch((error) => {
          recordEvent({ type: "experiment_run_error", payload: { experimentId: experiment.id, error: error.message || String(error) } });
        });
        notes.push(`Experiment run started: ${experiment.title} (run ${started.run.id}). The log will be recorded when it finishes.`);
        continue;
      }

      if (action === "log") {
        const runId = String(directive.runId || directive.run_id || "").trim();
        if (!runId) throw new Error("A run id is required.");
        resolveRun({ thread, runId });
        const log = runs.readExperimentRunLog({ runId, maxBytes: 4_000 });
        notes.push(`Experiment run ${runId} log:\n\`\`\`text\n${log.text || "(no output yet)"}\n\`\`\``);
        continue;
      }

      if (action === "result") {
        const runId = String(directive.runId || directive.run_id || "").trim();
        if (!runId) throw new Error("A run id is required.");
        resolveRun({ thread, runId });
        const result = graph.createResultFromRun({
          runId,
          verdict: directive.verdict,
          reasoning: directive.reasoning,
        });
        emit(graphUpdateEvent({ thread, turnId, nodeIds: [result.id], nodeCount: 1, edgeCount: 1 }));
        recordEvent({ type: "experiment_result_created", payload: { result_id: result.id, source_run_id: result.source_run_id } });
        notes.push(`Result recorded: ${result.title} (${result.id}).`);
        continue;
      }

      notes.push(`Experiment directive ignored: unknown action ${action}.`);
    } catch (error) {
      notes.push(`Experiment directive failed: ${error.message || String(error)}`);
    }
  }
  return notes;
}

module.exports = {
  executeExperimentDirectives,
  experimentPrompt,
  extractExperimentDirectives,
  recentExperimentRuns,
};
