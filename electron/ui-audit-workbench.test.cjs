const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "src", "App.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");
const terminal = fs.readFileSync(path.join(root, "src", "TerminalPanel.tsx"), "utf8");
const workbench = fs.readFileSync(path.join(root, "src", "RightWorkbench.tsx"), "utf8");

test("terminal lives in the right workbench instead of the bottom panel", () => {
  assert.match(app, /<RightWorkbench[\s\S]*?onWidthChange/);
  assert.match(app, /<PanelRight size=\{18\}/);
  assert.doesNotMatch(app, /PanelBottom/);
  assert.doesNotMatch(app, /<TerminalPanel/);
  assert.match(workbench, /<TerminalPanel[\s\S]*?orientation="right"/);
});

test("workbench opens from the right and becomes an overlay on narrow screens", () => {
  assert.match(css, /\.main-workspace \{[^}]*grid-template-columns: minmax\(0, 1fr\) var\(--workbench-width, 0px\)/);
  assert.match(css, /\.right-workbench \{[^}]*grid-template-rows: 38px minmax\(0, 1fr\)/);
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
