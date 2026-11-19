const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

test("Research mode refreshes the graph from automatic graph-update events", () => {
  const app = read("src", "App.tsx");
  const panel = read("src", "research-graph", "ResearchGraphPanel.tsx");
  const css = read("src", "styles.css");
  assert.match(app, /const \[graphVersion, setGraphVersion\] = useState\(0\)/);
  assert.match(app, /const \[graphUpdate, setGraphUpdate\] = useState<ResearchGraphUpdate \| null>\(null\)/);
  assert.match(app, /event\.type === "graph_update"/);
  assert.match(app, /version=\{graphVersion\}/);
  assert.match(app, /update=\{graphUpdate\}/);
  assert.match(app, /threadId=\{pathThread\?\.id \?\? null\}/);
  assert.match(app, /pinned=\{pathIsPinned\}/);
  assert.match(app, /onTogglePin=\{togglePathPin\}/);
  assert.match(app, /mode=\{pathMode\}/);
  assert.match(app, /researchMode === "experiment-setup"/);
  assert.match(panel, /layoutLineage\(/);
  assert.doesNotMatch(panel, /research-graph-stage-switch|setViewStage/);
  assert.match(panel, /listExperimentRuns\(\{ projectId, threadId \}\)/);
  assert.match(panel, /onExperimentRunUpdate/);
  assert.doesNotMatch(panel, /createQuestion|createChild|updateNodePlan|startExperiment\(|createResult\(/);
  assert.match(panel, /The graph builds automatically from the conversation/);
  assert.match(panel, /includeArchived: true/);
  assert.match(panel, /listResearchGraph\(\{ projectId, threadId, includeArchived: true \}\)/);
  assert.match(panel, /update\.threadId === threadId/);
  assert.match(panel, /archiveResearchNode\(nodeId, "Undo automatic research graph update"\)/);
  assert.match(panel, /setResearchNodeStatus\?\.\(item\.nodeId, item\.previousStatus/);
  assert.match(panel, /Research graph updated/);
  assert.match(css, /\.research-graph-update \{/);
});

test("the graph hides superseded ideas until History is opened", () => {
  const panel = read("src", "research-graph", "ResearchGraphPanel.tsx");
  const css = read("src", "styles.css");
  assert.match(panel, /const \[showHistory, setShowHistory\] = useState\(false\)/);
  assert.match(panel, /node\.status !== "retracted"/);
  assert.match(panel, /Show history/);
  assert.match(panel, /Hide history/);
  assert.match(panel, /previous ideas moved to history/);
  assert.match(css, /\.research-graph-node\.status-retracted \{ opacity: \.5; \}/);
  assert.match(css, /\.research-graph-edge\.secondary \{/);
  assert.match(css, /\.research-graph-expanded-head \.agent-path-icon:hover:not\(:disabled\)/);
});

test("Agent turns schedule a background graph build for Research mode", () => {
  const agent = read("electron", "agent.cjs");
  const auto = read("electron", "research-graph", "auto-build.cjs");
  assert.match(agent, /graphAutoBuild\.maybeAutoBuild/);
  assert.match(agent, /scheduleGraphAutoBuild\(response\)/);
  assert.match(auto, /extractWithApi/);
  assert.match(auto, /extractWithNative/);
  assert.match(auto, /graph_update_pending/);
  assert.match(auto, /graph_applied/);
  assert.match(auto, /allowResults: true/);
});

test("the experiment inspector is read-only and shows plan and run evidence", () => {  const inspector = read("src", "research-graph", "ExperimentInspector.tsx");
  const nodeInspector = read("src", "research-graph", "NodeInspector.tsx");
  const view = read("src", "research-graph", "ResearchGraphView.tsx");
  const main = read("electron", "main.cjs");
  const preload = read("electron", "preload.cjs");
  const css = read("src", "styles.css");
  assert.match(inspector, /Experiment hypothesis/);
  assert.match(inspector, /Experiment baseline/);
  assert.match(inspector, /Experiment metrics/);
  assert.match(inspector, /Experiment stop criteria/);
  assert.match(inspector, /The agent will fill this plan from the conversation/);
  assert.match(inspector, /The agent has not run this experiment yet/);
  assert.doesNotMatch(inspector, /onStartRun|onCancelRun|onCreateResult|Save plan|Run experiment|Create result from run/);
  assert.match(nodeInspector, /ExperimentInspector/);
  assert.doesNotMatch(nodeInspector, /onCreateChild|Add child/);
  assert.match(view, /runsByNode/);
  assert.match(main, /experiment-run:start/);
  assert.match(main, /experiment-run:result/);
  assert.match(preload, /startExperimentRun/);
  assert.match(preload, /createResultFromRun/);
  assert.match(css, /\.experiment-section \{/);
  assert.match(css, /\.experiment-plan-row \{/);
  assert.match(css, /\.experiment-run-log \{/);
  assert.match(css, /\.research-graph-node-runs \{/);
});

test("the agent can create and run experiments from the conversation", () => {
  const agent = read("electron", "agent.cjs");
  const directives = read("electron", "agent", "experiment-directives.cjs");
  const codex = read("electron", "agent", "codex-backend.cjs");
  assert.match(agent, /name: "create_idea"/);
  assert.match(agent, /name: "create_experiment"/);
  assert.match(agent, /name: "run_experiment"/);
  assert.match(agent, /name: "wait_experiment"/);
  assert.match(agent, /name: "read_experiment_log"/);
  assert.match(agent, /name: "create_experiment_result"/);
  assert.match(agent, /executeExperimentDirectives/);
  assert.match(directives, /function experimentPrompt/);
  assert.match(directives, /function extractExperimentDirectives/);
  assert.match(codex, /experimentPrompt\(\)/);
});
