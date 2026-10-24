const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const css = fs.readFileSync(path.resolve(__dirname, "..", "src", "styles.css"), "utf8");

test("dark PDF reader header uses the night panel background", () => {
  assert.match(css, /\.paper-workbench-header \{ background: var\(--night-panel\); \}/);
});

test("dark PDF reader header text and controls use night ink tokens", () => {
  assert.match(css, /\.reader-title span \{ color: var\(--night-muted\); \}/);
  assert.match(css, /\.reader-title strong \{ color: var\(--night-ink\); \}/);
  assert.match(css, /\.reader-header-divider \{ background: var\(--night-line\); \}/);
  assert.match(css, /\.reader-back-button \{ color: var\(--night-ink-soft\); \}/);
  assert.match(css, /\.paper-workbench-header \.reader-icon-button,[\s\S]*?color: var\(--night-muted\)/);
  assert.match(css, /\.reader-ask-button \{ color: var\(--night-ink-soft\); background: var\(--night-panel-soft\)/);
});
