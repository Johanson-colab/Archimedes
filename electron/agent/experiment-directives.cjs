const fs = require("node:fs");
const path = require("node:path");
const store = require("../store.cjs");
const graph = require("../research-graph/service.cjs");
const runner = require("../research-graph/experiment-runner.cjs");
const runs = require("../research-graph/experiment-runs.cjs");
const evidence = require("../research-graph/experiment-evidence.cjs");

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
    "Experiment recording directive (Research or Experiment setup):",
    "Use these directives only when the user explicitly asks to undertake or run a specific experiment. Do not repeat an already completed run. Keep setup and baseline work inside the experiment.",
    "When you are ready to create or run an experiment, emit one fenced block at the very end of your response:",
    "```experiment",
    '{"action":"create","idea":"<exact idea title>","title":"...","hypothesis":"...","baseline":"...","method":"...","metrics":["..."],"stopCriteria":"...","parentExperiment":"<optional parent title>"}',
    "```",
    "To prepare an isolated worktree from committed project code, request approval with:",
    "```experiment",
    '{"action":"prepare_workspace","experiment":"<exact experiment title>","parentRunId":"<required for a child experiment>"}',
    "```",
    "The worktree starts with committed code only. Prepare and commit the experiment code there before running; uncommitted or untracked files block the run. The app saves a Git archive, excluding ignored files, submodule contents and LFS objects. Then run it with:",
    "```experiment",
    '{"action":"run","experiment":"<exact experiment title>","command":"<shell command>","useExperimentWorkspace":true}',
    "```",
    "The app strips the block, creates the experiment or starts the run, and records its log. Do not claim the run finished in this turn.",
    "On a later turn, recorded runs appear under 'Recent experiment runs'. Use:",
    "```experiment",
    '{"action":"log","runId":"..."}',
    "```",
    "to read a log. After inspecting actual output, report numeric metrics or output paths with:",
    "```experiment",
    '{"action":"evidence","runId":"...","metrics":{"accuracy":0.91},"artifacts":["results/plot.png"]}',
    "```",
    "Paths are relative to the run workspace and are references, not copies. Report only observed values.",
    "To record an observed preparation, reproduction, baseline, implementation, execution, repair or observation step within the experiment (not a new graph node), use:",
    "```experiment",
    '{"action":"activity","experiment":"...","category":"baseline","status":"completed","title":"..."}',
    "```",
    "Record only observed activities, and never treat an activity as a managed run. Then use:",
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
  if (!["research", "experiment-setup"].includes(mode || thread.mode)) throw new Error("Experiment directives are only allowed in Research or Experiment setup mode.");
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
        const parentExperiment = directive.parentExperiment ? resolveNode({ thread, value: directive.parentExperiment, kind: "experiment", label: "Experiment" }) : null;
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
          parents: [{ nodeId: idea.id, kind: "tests" }, ...(parentExperiment ? [{ nodeId: parentExperiment.id, kind: "extends" }] : [])],
          sourceTurnId: turnId,
        });
        emit(graphUpdateEvent({ thread, turnId, nodeIds: [experiment.id], nodeCount: 1, edgeCount: parentExperiment ? 2 : 1 }));
        notes.push(`Experiment created: ${experiment.title} (${experiment.id}).`);
        continue;
      }

      if (action === "prepare_workspace") {
        const experiment = resolveNode({ thread, value: directive.experiment, kind: "experiment", label: "Experiment" });
        const projectRoot = store.getResearchProject(thread.project_id)?.workspace_path;
        if (!projectRoot || fs.realpathSync(projectRoot) !== fs.realpathSync(workspace)) {
          throw new Error("Open the project’s shared workspace before preparing an experiment worktree.");
        }
        const existing = store.getExperimentWorkspace(experiment.id);
        if (existing) {
          if (directive.parentRunId && directive.parentRunId !== existing.parent_run_id) throw new Error("This experiment workspace is already tied to a different base.");
          notes.push(`Experiment workspace already exists: ${existing.root} (branch ${existing.branch_name}, base ${existing.base_commit}).`);
          continue;
        }
        const base = store.experimentWorkspaceBase(experiment.id, directive.parentRunId || null);
        const baseDescription = base.parentRunId ? `parent run ${base.parentRunId} at commit ${base.baseCommit}` : "committed project HEAD";
        if (!approve) throw new Error("Creating an experiment worktree requires approval.");
        const allowed = await approve({
          command: `Create an isolated Git worktree from ${baseDescription}`,
          cwd: workspace,
          reason: `Experiment: ${experiment.title}. Uncommitted and untracked files are not copied.`,
          nativeMethod: "archimedes/experiment",
        });
        if (!allowed) { notes.push(`Experiment workspace rejected: ${experiment.title}.`); continue; }
        const result = store.createExperimentWorkspace(experiment.id, { parentRunId: base.parentRunId });
        notes.push(`Experiment workspace: ${result.workspace.root} (branch ${result.workspace.branch_name}, base ${result.workspace.base_commit}). Only committed code was copied; uncommitted and untracked files remain in the original workspace.`);
        continue;
      }

      if (action === "run") {
        const experiment = resolveNode({ thread, value: directive.experiment, kind: "experiment", label: "Experiment" });
        const command = String(directive.command || "").trim();
        if (!command) throw new Error("A run command is required.");
        if (command.length > MAX_COMMAND_CHARS) throw new Error("The experiment command is too long.");
        const isolated = directive.useExperimentWorkspace === true ? store.getExperimentWorkspace(experiment.id) : null;
        if (directive.useExperimentWorkspace === true && !isolated) throw new Error("Prepare the experiment workspace before running in it.");
        if (isolated) {
          const activeRoot = fs.realpathSync(workspace);
          const isolatedRoot = fs.realpathSync(isolated.root);
          if (!isolatedRoot.startsWith(`${activeRoot}${path.sep}`)) throw new Error("The experiment workspace is outside the active workspace.");
        }
        const runRoot = isolated ? isolated.root : workspace;
        if (isolated) require("../research-graph/code-snapshot.cjs").inspectCodeState(runRoot);
        const cwd = directive.cwd ? path.resolve(runRoot, String(directive.cwd)) : runRoot;
        if (cwd !== runRoot && !cwd.startsWith(`${runRoot}${path.sep}`)) throw new Error("The run folder is outside the workspace.");
        if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) throw new Error("The run folder is no longer available.");
        const realRoot = fs.realpathSync(runRoot);
        const realCwd = fs.realpathSync(cwd);
        if (realCwd !== realRoot && !realCwd.startsWith(`${realRoot}${path.sep}`)) throw new Error("The run folder resolves outside the workspace.");
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
          workspace: runRoot,
          experimentWorkspaceId: isolated?.id || null,
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
        const snapshot = started.run.provenance?.codeSnapshot;
        notes.push(`Experiment run started: ${experiment.title} (run ${started.run.id}). The log will be recorded when it finishes.${snapshot ? ` Code archive: ${snapshot.path} (commit ${snapshot.commit}, SHA-256 ${snapshot.sha256}). ${snapshot.limitations}` : " No code snapshot was created for this run."}`);
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

      if (action === "activity") {
        const experiment = resolveNode({ thread, value: directive.experiment, kind: "experiment", label: "Experiment" });
        const activity = store.recordExperimentActivity({ projectId: thread.project_id, threadId: thread.id, nodeId: experiment.id, runId: directive.runId || null, turnId, category: directive.category, status: directive.status, title: directive.title });
        recordEvent({ type: "experiment_activity", payload: { activity } });
        emit(graphUpdateEvent({ thread, turnId }));
        notes.push(`Experiment activity recorded: ${activity.title} (agent-reported, not a managed run).`);
        continue;
      }

      if (action === "evidence") {
        const runId = String(directive.runId || directive.run_id || "").trim();
        resolveRun({ thread, runId });
        const run = await evidence.recordExperimentEvidence({ runId, threadId, workspace, turnId, metrics: directive.metrics || {}, artifacts: directive.artifacts || [] });
        emit({ type: "tool", title: "Experiment evidence recorded", detail: `Run ${run.id}`, experimentRun: run });
        recordEvent({ type: "experiment_run", payload: { run } });
        notes.push(`Evidence report recorded for run ${run.id}. Metrics are agent-reported; artifact files are referenced with hashes and may later change.`);
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
