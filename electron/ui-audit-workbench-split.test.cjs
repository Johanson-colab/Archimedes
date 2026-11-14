const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { readLocale } = require("./locale-source.cjs");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const app = read("src/App.tsx");
const right = read("src/RightWorkbench.tsx");
const tabs = read("src/workbench-tabs.tsx");
const css = read("src/styles.css");
const settings = read("electron/workbench-settings.cjs");
const settingsPanel = read("src/WorkbenchSettingsPanel.tsx");
const i18n = readLocale();

test("workbench layout model stores split panes with a bounded orientation", () => {
  assert.match(tabs, /WORKBENCH_PREFERENCES_VERSION = 5/);
  assert.match(tabs, /MAX_WORKBENCH_PANES = 2/);
  assert.match(tabs, /MIN_WORKBENCH_PANE_PERCENT = 25/);
  assert.match(tabs, /export type WorkbenchPaneOrientation = "row" \| "column"/);
  assert.match(tabs, /export type WorkbenchLayout = \{/);
  assert.match(tabs, /panes: WorkbenchPane\[\]/);
  assert.match(tabs, /layout: WorkbenchLayout/);
  assert.match(tabs, /export function normalizeWorkbenchLayout/);
  assert.match(tabs, /export function defaultWorkbenchLayout/);
  assert.match(tabs, /export function splitWorkbenchTab/);
  assert.match(tabs, /export function moveWorkbenchTabToPane/);
  assert.match(tabs, /export function closeWorkbenchPane/);
  assert.match(tabs, /export function resizeWorkbenchPanes/);
  assert.match(tabs, /export function showWorkbenchTab/);
  assert.match(tabs, /export function activeWorkbenchPaneTabs/);
  assert.match(tabs, /tabs\.filter\(\(id\) => id !== tab\)/);
  assert.match(tabs, /layout\.panes\.length >= MAX_WORKBENCH_PANES/);
  assert.equal((tabs.match(/layout: normalizeWorkbenchLayout\(source\.layout/g) || []).length, 1);
});

test("workbench panes render a tab strip, body and drop preview per pane", () => {
  assert.match(right, /className=\{`workbench-pane/);
  assert.match(right, /<Tabs value=\{pane\.active\}/);
  assert.match(right, /\{pane\.tabs\.map\(\(id\) =>/);
  assert.match(right, /hidden=\{pane\.active !== id\}/);
  assert.match(right, /workbench-pane-divider/);
  assert.match(right, /workbench-drop-preview/);
  assert.match(right, /role="separator"/);
  assert.match(right, /aria-orientation=\{preferences\.layout\.orientation === "row" \? "vertical" : "horizontal"\}/);
  assert.match(right, /onDragOver=\{onPaneDragOver\}/);
  assert.match(right, /onDrop=\{onPaneDrop\}/);
  assert.match(right, /moveWorkbenchTabToPane/);
  assert.match(right, /splitWorkbenchTab/);
  assert.match(right, /resizeWorkbenchPanes/);
  assert.match(right, /closeWorkbenchPane/);
  assert.match(right, /Split right/);
  assert.match(right, /Split down/);
  assert.match(right, /Move to other pane/);
  assert.match(right, /Close pane/);
  assert.match(right, /dataTransfer/);
  assert.match(right, /ResizeObserver/);
  assert.match(right, /PANE_COMPACT_TABS_WIDTH/);
});

test("workbench panels are partitioned so a tab never mounts twice", () => {
  assert.match(tabs, /function workbenchPaneForTab/);
  assert.match(tabs, /pane\.tabs\.includes/);
  assert.match(right, /pane\.tabs\.map/);
  assert.doesNotMatch(right, /visited/);
  assert.match(app, /activeWorkbenchPaneTabs/);
  assert.match(app, /workbenchActiveTabs\.has\("terminal"\)/);
  assert.match(app, /workbenchActiveTabs\.has\("browser"\)/);
  assert.match(app, /workbenchActiveTabs\.has\("journey"\)/);
  assert.match(app, /compactWidth=\{workbenchFilesPaneWidth\}/);
  assert.doesNotMatch(app, /workbenchTab ===/);
});

test("split layout persists through the workbench settings bridge", () => {
  assert.match(settings, /PREFERENCES_VERSION = 5/);
  assert.match(settings, /MAX_PANES = 2/);
  assert.match(settings, /MIN_PANE_PERCENT = 25/);
  assert.match(settings, /function normalizeLayout/);
  assert.match(settings, /layout: normalizeLayout\(source\.layout/);
  assert.match(settings, /layout: defaultLayout/);
  assert.match(read("src/vite-env.d.ts"), /type WorkbenchLayoutSnapshot/);
  assert.match(read("src/vite-env.d.ts"), /layout\?: WorkbenchLayoutSnapshot/);
  assert.match(settingsPanel, /preferences\.order/);
});

test("split panes follow the workbench visual language", () => {
  assert.match(css, /\.workbench-panes \{ display: grid/);
  assert.match(css, /\.workbench-pane \{[^}]*grid-template-rows: 44px minmax\(0, 1fr\)/);
  assert.match(css, /\.workbench-pane-divider \{[^}]*cursor: col-resize/);
  assert.match(css, /\.workbench-panes\.column > \.workbench-pane-divider \{ cursor: row-resize/);
  assert.match(css, /\.workbench-drop-preview\.left/);
  assert.match(css, /\.workbench-drop-preview\.right/);
  assert.match(css, /\.workbench-drop-preview\.top/);
  assert.match(css, /\.workbench-drop-preview\.bottom/);
  assert.match(css, /body\.workbench-panes-resizing-row/);
  assert.match(css, /body\.workbench-panes-resizing-column/);
  assert.match(css, /\.workbench-pane\.compact-tabs \.ui-tabs \.ui-tab \.ui-tab-label \{ display: none/);
});

test("split pane controls are translated", () => {
  for (const key of ["Close pane", "Move to other pane", "Resize panes", "Side by side", "Split down", "Split right", "Stacked", "Workbench pane"]) {
    assert.match(i18n, new RegExp(`"${key}"`), `missing ${key}`);
  }
});
