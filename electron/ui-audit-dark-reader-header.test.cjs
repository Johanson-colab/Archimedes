const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const css = fs.readFileSync(path.resolve(__dirname, "..", "src", "styles.css"), "utf8");

test("dark PDF reader bar uses the night panel background", () => {
  assert.match(css, /html:not\(\[data-theme="paper"\]\) \.paper-reader-bar \{ background: var\(--night-panel\); border-color: var\(--night-line\); \}/);
});

test("dark PDF reader bar controls use night ink tokens", () => {
  assert.match(css, /html:not\(\[data-theme="paper"\]\) \.paper-reader-bar \.reader-back-button \{ color: var\(--night-ink-soft\); \}/);
  assert.match(css, /html:not\(\[data-theme="paper"\]\) \.paper-reader-bar \.reader-icon-button \{ color: var\(--night-muted\); \}/);
  assert.match(css, /html:not\(\[data-theme="paper"\]\) \.paper-reader-bar \.reader-ask-button \{ color: var\(--night-ink-soft\); background: var\(--night-panel-raised\); border-color: var\(--night-line\); \}/);
});
