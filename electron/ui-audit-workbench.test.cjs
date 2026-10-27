const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "src", "App.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");
const terminal = fs.readFileSync(path.join(root, "src", "TerminalPanel.tsx"), "utf8");
const workbench = fs.readFileSync(path.join(root, "src", "RightWorkbench.tsx"), "utf8");
const tabs = fs.readFileSync(path.join(root, "src", "workbench-tabs.tsx"), "utf8");
const trajectory = fs.readFileSync(path.join(root, "src", "TrajectoryView.tsx"), "utf8");
const jsonCode = fs.readFileSync(path.join(root, "src", "JsonCode.tsx"), "utf8");
const journey = fs.readFileSync(path.join(root, "src", "JourneyView.tsx"), "utf8");
const terminalSettings = fs.readFileSync(path.join(root, "src", "TerminalSettingsModal.tsx"), "utf8");
const store = fs.readFileSync(path.join(root, "electron", "store.cjs"), "utf8");

test("terminal lives in the right workbench instead of the bottom panel", () => {
  assert.match(app, /<RightWorkbench[\s\S]*?onWidthChange/);
  assert.match(app, /<PanelRight size=\{18\}/);
  assert.doesNotMatch(app, /PanelBottom/);
  assert.match(app, /terminal: <TerminalPanel[\s\S]*?orientation="right"/);
  assert.match(workbench, /\{panels\[id\]\}/);
});

test("workbench shares the sidebar top edge and overlays only on narrow screens", () => {
  assert.match(css, /\.codex-main \{[^}]*grid-template-columns: minmax\(0, 1fr\) var\(--workbench-width, 0px\)/);
  assert.match(css, /\.right-workbench \{[^}]*grid-column: 2;[^}]*grid-row: 1 \/ span 2;[^}]*grid-template-rows: 52px minmax\(0, 1fr\)/);
  assert.match(css, /@media \(max-width: 1280px\) \{[\s\S]*?\.codex-main \{ grid-template-columns: minmax\(0, 1fr\); \}[\s\S]*?\.main-toolbar \{ padding-right: calc\(var\(--workbench-width, 0px\) \+ 18px\); \}[\s\S]*?\.right-workbench \{[^}]*position: absolute/);
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
  assert.match(workbench, /WORKBENCH_MAX_WIDTH = 1200/);
  assert.match(workbench, /WORKBENCH_DEFAULT_RATIO = 0\.5/);
  assert.match(workbench, /viewport \* WORKBENCH_DEFAULT_RATIO/);
  assert.match(css, /body\.workbench-resizing/);
});

test("files use a compact workbench pane with drill-down and split modes", () => {
  assert.match(tabs, /FolderTree/);
  assert.match(workbench, /workbench-tab-badge/);
  assert.match(workbench, /activeTab === id/);
  assert.match(app, /openWorkbench\("files"\)/);
  assert.match(app, /<ArtifactsView[\s\S]*?compact[\s\S]*?compactWidth=\{workbenchWidth\}/);
  assert.match(app, /const split = compactWidth >= 560/);
  assert.match(app, /artifact-workbench-back/);
  assert.match(app, /Open full editor/);
  assert.match(app, /FILES_EDITOR_MIN_WIDTH = 260/);
  assert.match(app, /artifact-workbench-pane-toggles/);
  assert.match(app, /artifact-workbench-divider/);
  assert.match(app, /filesListCollapsed/);
  assert.match(app, /filesEditorCollapsed/);
  assert.match(app, /setCompactPane\("editor"\);\s*setFilesEditorCollapsed\(false\)/);
  assert.match(app, /archimedes-files-pane-width/);
  assert.match(css, /\.artifact-workbench-body\.split \{[^}]*grid-template-columns: var\(--files-pane-width, 236px\) 7px minmax\(0, 1fr\)/);
  assert.match(css, /\.artifact-workbench-body\.editor-only, \.artifact-workbench-body\.browser-only/);
  assert.match(css, /body\.files-pane-resizing/);
});

test("files use a tab-first header and keep one visible filename", () => {
  assert.match(app, /openFiles\.length > 1\) && <div className="artifact-tabs"/);
  assert.match(app, /artifact-editor-header compact/);
  assert.match(app, /openFiles\.length <= 1 && <span className="artifact-workbench-file"/);
  assert.match(css, /\.artifact-editor-pane\.no-tabs \{ grid-template-rows: minmax\(0, 1fr\); \}/);
});

test("files collapse the redundant title row and hide the saved label", () => {
  assert.match(app, /!compact && <div className="artifact-browser-title">/);
  assert.match(app, /artifact-workbench-workspace/);
  assert.doesNotMatch(app, /<FolderOpen size=\{13\} \/><strong>Files<\/strong>/);
  assert.match(app, /\{\(saving \|\| dirty\) && <span className=\{`artifact-save-state/);
  assert.doesNotMatch(app, /"Saving" : dirty \? "Unsaved" : "Saved"/);
  assert.match(css, /\.artifact-workbench-location strong\.artifact-workbench-workspace/);
  assert.match(css, /\.workspace-tree-row \{ height: 30px; \}/);
});

test("terminal is a workbench tab with no dock or duplicate close controls", () => {
  assert.match(workbench, /workbench-terminal-panel/);
  assert.match(workbench, /id === "terminal"/);
  assert.doesNotMatch(workbench, /PanelBottom|terminalDock|workbench-dock-divider|workbench-close/);
  assert.doesNotMatch(app, /workbench-dock-divider/);
  assert.doesNotMatch(css, /\.workbench-body\.terminal-dock|\.workbench-dock-divider|\.workbench-close/);
  assert.doesNotMatch(terminal, /close-terminal-panel/);
  assert.doesNotMatch(workbench, /workbench-action/);
});

test("paper workbench toggle uses a warm active tone instead of green", () => {
  assert.match(css, /\.theme-paper \.quiet-icon-button\.active \{ color: #5a4a1c; background: #f1e8cf; box-shadow: inset 0 0 0 1px #d9c48a; \}/);
  assert.match(css, /\.theme-paper \.quiet-icon-button\.active:hover \{ color: #4d3f16; background: #eadfbe; \}/);
  assert.doesNotMatch(css, /\.theme-paper \.quiet-icon-button\.active \{ color: #245e4b/);
});

test("files and trajectory share one row token system", () => {
  assert.match(css, /--rail-row-ink: #a7a8b5/);
  assert.match(css, /--rail-row-hover-bg: #202020/);
  assert.match(css, /--rail-row-active-bg: #25253a/);
  assert.match(css, /\.workspace-tree-row,\s*\.trajectory-event-head \{ color: var\(--rail-row-ink\); \}/);
  assert.match(css, /\.workspace-tree-row:hover,\s*\.trajectory-event-head:hover \{ color: var\(--rail-row-ink-strong\); background: var\(--rail-row-hover-bg\); \}/);
  assert.match(css, /\.workspace-tree-row\.active,\s*\.trajectory-event\.open \.trajectory-event-head \{ color: var\(--rail-row-ink-strong\); background: var\(--rail-row-active-bg\); \}/);
  assert.match(css, /\.theme-paper \{[\s\S]*?--rail-row-hover-bg: #efede9/);
});

test("terminal settings sit in the terminal tab row with a distinct icon", () => {
  assert.match(app, /terminal: <TerminalPanel[\s\S]*?onOpenSettings/);
  assert.match(terminal, /SlidersHorizontal/);
  assert.match(terminal, /className="terminal-settings-button"/);
  assert.match(terminal, /function terminalTabLabel/);
  assert.doesNotMatch(terminal, /terminal-workspace-label/);
  assert.match(terminal, /terminalTabLabel\(settings\?\.detectedShellName \|\| settings\?\.detectedShell \|\| tab\.title, index\)/);
});

test("dirty file changes are protected when the workbench closes", () => {
  assert.match(app, /Hide the workbench\? Unsaved file changes stay in the editor\./);
  assert.match(app, /Object\.values\(artifactDraftsRef\.current\)\.some\(isDraftDirty\)/);
});

test("agent trajectory mirrors the OpenCode context structure", () => {
  assert.match(tabs, /id: "journey"[^\n]*labelKey: "Journey"/);
  assert.match(tabs, /id: "trajectory"[^\n]*labelKey: "Trajectory"/);
  assert.match(workbench, /\{tab\.icon\}<span>\{t\(tab\.labelKey\)\}<\/span>/);
  assert.match(trajectory, /trajectory-stats/);
  assert.match(trajectory, /Session ID/);
  assert.match(trajectory, /Raw events/);
  assert.match(trajectory, /JSON\.stringify\(event, null, 2\)/);
  assert.match(trajectory, /<JsonCode value=\{event\}/);
  assert.match(trajectory, /Expand all/);
  assert.match(trajectory, /Copy JSON/);
  assert.doesNotMatch(trajectory, /Every field is preserved/);
  assert.match(css, /\.trajectory-section-head h3/);
  assert.match(store, /FROM research_events[\s\S]*?ORDER BY turn_id ASC, sequence ASC/);
  assert.match(store, /events,/);
});

test("raw trajectory json is highlighted without changing copied json", () => {
  assert.match(jsonCode, /JSON\.stringify\(value, null, 2\)/);
  assert.match(jsonCode, /function tokenizeJson/);
  assert.match(jsonCode, /json-token-\$\{token\.kind\}/);
  assert.match(css, /\.trajectory-json \.json-token-key \{ color: #9fc7e8/);
  assert.match(css, /\.trajectory-json \.json-token-string \{ color: #c7d7a3/);
  assert.match(css, /\.trajectory-json \.json-token-number \{ color: #e0b66b/);
  assert.match(css, /\.trajectory-json \.json-token-literal \{ color: #d6a3e0/);
  assert.match(css, /\.theme-paper \.trajectory-json \.json-token-key \{ color: #2f607c/);
  assert.match(trajectory, /copy\(JSON\.stringify\(event, null, 2\), event\.id\)/);
});

test("terminal settings expose platform shell, font and external terminal controls", () => {
  assert.match(app, /<TerminalSettingsModal/);
  assert.match(app, /getTerminalSettings\(\)/);
  assert.match(app, /saveTerminalSettings/);
  assert.match(terminalSettings, /Shell profile/);
  assert.match(terminalSettings, /Font family/);
  assert.match(terminalSettings, /Scrollback/);
  assert.match(terminalSettings, /External terminal/);
  assert.match(terminalSettings, /Choose your terminal/);
  assert.match(terminalSettings, /Open external/);
  assert.match(terminal, /settings\?\.fontFamily/);
  assert.match(terminal, /settings\?\.fontSize/);
  assert.match(terminal, /settings\?\.scrollback/);
  assert.match(css, /\.terminal-settings-modal/);
});

test("agent journey is derived from raw trajectory events", () => {
  assert.match(journey, /function buildChapters/);
  assert.match(journey, /function buildEpisodes/);
  assert.match(journey, /function buildBrief/);
  assert.match(journey, /journey-scrubber/);
  assert.match(journey, /journey-chapters/);
  assert.match(journey, /journey-dock/);
  assert.match(journey, /Open trajectory/);
  assert.doesNotMatch(journey, /const phases = \[/);
  assert.doesNotMatch(journey, /derived progress/i);
  assert.match(css, /\.trajectory-json \{[^}]*white-space: pre-wrap/);
  assert.match(css, /\.theme-paper \.right-workbench \{[^}]*background: #f6f4f1/);
});
