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
  assert.match(panel, /includeArchived: false/);
  assert.match(panel, /archiveResearchNode\(nodeId, "Undo automatic research graph update"\)/);
  assert.match(panel, /Research graph updated/);
  assert.match(css, /\.research-graph-update \{/);
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
});
