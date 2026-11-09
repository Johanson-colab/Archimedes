const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("charcoal uses the neutral canvas and sidebar surfaces", () => {
  const tokens = read("src/tokens.css");
  assert.match(tokens, /--mono-canvas: #161616/);
  assert.match(tokens, /--mono-sidebar: #1d1d1d/);
  assert.match(tokens, /--mono-text: #f2f2f2/);
  assert.match(tokens, /--mono-text-soft: #c9c9c9/);
  assert.match(tokens, /--mono-text-muted: #909090/);

  const typography = read("src/typography.css");
  assert.match(typography, /html:not\(\[data-theme="paper"\]\) \.codex-main,[\s\S]*?background: var\(--mono-canvas\)/);
  assert.match(typography, /html:not\(\[data-theme="paper"\]\) \.codex-sidebar \{ background: var\(--mono-sidebar\); \}/);
});

test("charcoal conversation text stays neutral", () => {
  const css = read("src/styles.css");
  assert.match(css, /\.conversation-message p, \.message-markdown \{ color: #d7d7d7;/);
  assert.match(css, /\.conversation-message\.user \.conversation-message-copy \{ color: #ededed; background: #2a2a2a;/);
  assert.match(css, /\.conversation-message\.user p \{ color: #ededed; \}/);
});

test("workbench chrome shares the conversation canvas and keeps structural rules", () => {
  const tokens = read("src/tokens.css");
  assert.match(tokens, /--workbench-ground: var\(--mono-canvas\)/);

  const css = read("src/styles.css");
  assert.match(css, /html:not\(\[data-theme="paper"\]\) \.right-workbench,\s*\.theme-paper \.right-workbench \{[^}]*background: var\(--workbench-ground\);[^}]*border-left-color: var\(--night-line\);/);
  assert.match(css, /html:not\(\[data-theme="paper"\]\) \.workbench-header,\s*\.theme-paper \.workbench-header \{[^}]*background: var\(--workbench-ground\);[^}]*border-bottom-color: transparent;/);
  assert.match(css, /\.workbench-pane-divider::after \{[^}]*background: var\(--night-line\);/);
  assert.match(css, /\.workbench-pane\.focused > \.workbench-header \{[^}]*box-shadow: none;/);
  assert.match(css, /\.workbench-pane:not\(\.focused\) \.workbench-tab\.active \{[^}]*opacity: \.66;/);
});

test("the workbench shell keeps its canvas while reserving a single seam", () => {
  const typography = read("src/typography.css");
  assert.match(typography, /html:not\(\[data-theme="paper"\]\) \.main-toolbar \{ background: var\(--mono-canvas\); border-color: transparent; \}/);
  assert.match(typography, /html:not\(\[data-theme="paper"\]\) \.right-workbench \{ background: var\(--mono-canvas\); border-color: transparent; border-left-color: var\(--night-line\); \}/);
  assert.match(typography, /html:not\(\[data-theme="paper"\]\) \.workbench-header \{ background: var\(--mono-canvas\); border-color: transparent; \}/);
});
