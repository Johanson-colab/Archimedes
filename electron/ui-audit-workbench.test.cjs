const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "src", "App.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");
const terminal = fs.readFileSync(path.join(root, "src", "TerminalPanel.tsx"), "utf8");
const workbench = fs.readFileSync(path.join(root, "src", "RightWorkbench.tsx"), "utf8");
const trajectory = fs.readFileSync(path.join(root, "src", "TrajectoryView.tsx"), "utf8");
const journey = fs.readFileSync(path.join(root, "src", "JourneyView.tsx"), "utf8");
const store = fs.readFileSync(path.join(root, "electron", "store.cjs"), "utf8");

test("terminal lives in the right workbench instead of the bottom panel", () => {
  assert.match(app, /<RightWorkbench[\s\S]*?onWidthChange/);
  assert.match(app, /<PanelRight size=\{18\}/);
  assert.doesNotMatch(app, /PanelBottom/);
  assert.doesNotMatch(app, /<TerminalPanel/);
  assert.match(workbench, /<TerminalPanel[\s\S]*?orientation="right"/);
});

test("workbench opens from the right and becomes an overlay on narrow screens", () => {
  assert.match(css, /\.main-workspace \{[^}]*grid-template-columns: minmax\(0, 1fr\) var\(--workbench-width, 0px\)/);
  assert.match(css, /\.right-workbench \{[^}]*grid-template-rows: 42px minmax\(0, 1fr\)/);
  assert.match(css, /@media \(max-width: 1280px\) \{[\s\S]*?\.right-workbench \{[^}]*position: absolute/);
});

test("terminal sessions stay mounted when the workbench is hidden", () => {
  assert.match(workbench, /aria-hidden=\{!open\} inert=\{!open\}/);
  assert.match(terminal, /className=\{\[open \? "smart-terminal open" : "smart-terminal"/);
  assert.match(terminal, /in-workbench/);
  assert.match(terminal, /window\.setTimeout\(fitWhenSettled, 260\)/);
});

test("workbench supports keyboard toggle and resizing", () => {
  assert.match(app, /event\.key === "`"/);
  assert.match(workbench, /role="separator"/);
  assert.match(workbench, /event\.key === "ArrowLeft"/);
  assert.match(workbench, /WORKBENCH_MAX_WIDTH = 560/);
  assert.match(css, /body\.workbench-resizing/);
});

test("files use a compact workbench pane with drill-down and split modes", () => {
  assert.match(workbench, /FolderTree/);
  assert.match(workbench, /workbench-tab-badge/);
  assert.match(workbench, /activeTab === "files"/);
  assert.match(app, /openWorkbench\("files"\)/);
  assert.match(app, /<ArtifactsView[\s\S]*?compact[\s\S]*?compactWidth=\{workbenchWidth\}/);
  assert.match(app, /const split = compactWidth >= 520/);
  assert.match(app, /artifact-workbench-back/);
  assert.match(app, /Open full editor/);
  assert.match(css, /\.artifact-workbench-body\.split \{[^}]*grid-template-columns: 168px minmax\(0, 1fr\)/);
});

test("dirty file changes are protected when the workbench closes", () => {
  assert.match(app, /Hide the workbench\? Unsaved file changes stay in the editor\./);
  assert.match(app, /Object\.values\(artifactDraftsRef\.current\)\.some\(isDraftDirty\)/);
});

test("agent trajectory mirrors the OpenCode context structure", () => {
  assert.match(workbench, /activeTab === "journey"/);
  assert.match(workbench, /activeTab === "trajectory"/);
  assert.match(workbench, />Journey<\/span>/);
  assert.match(workbench, />Trajectory<\/span>/);
  assert.match(trajectory, /trajectory-stats/);
  assert.match(trajectory, /Session ID/);
  assert.match(trajectory, /Raw events/);
  assert.match(trajectory, /JSON\.stringify\(event, null, 2\)/);
  assert.match(trajectory, /Expand all/);
  assert.match(trajectory, /Copy JSON/);
  assert.match(store, /FROM research_events[\s\S]*?ORDER BY turn_id ASC, sequence ASC/);
  assert.match(store, /events,/);
});

test("agent journey is derived from raw trajectory events", () => {
  assert.match(journey, /Derived from \{events\.length\} raw events/);
  assert.match(journey, /from trajectory event #\{event\.sequence\}/);
  assert.match(journey, /const phases = \[/);
  assert.match(journey, /View raw/);
  assert.match(journey, /Open trajectory/);
  assert.match(css, /\.trajectory-json \{[^}]*white-space: pre-wrap/);
  assert.match(css, /\.theme-paper \.right-workbench \{[^}]*background: #f6f4f1/);
});
