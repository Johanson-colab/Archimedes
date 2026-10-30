const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const css = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");
const view = fs.readFileSync(path.join(root, "src", "LibraryView.tsx"), "utf8");

test("paper chat keeps its column bounded and oversized content locally scrollable", () => {
  assert.match(css, /\.paper-ai-thread \{[^}]*grid-template-columns: minmax\(0, 1fr\);[^}]*overflow-x: hidden;[^}]*overflow-y: auto/);
  assert.match(css, /\.paper-ai-thread article \{[^}]*min-width: 0;[^}]*overflow-wrap: anywhere/);
  assert.match(css, /\.paper-ai-markdown pre, \.paper-ai-markdown \.katex-display, \.paper-ai-table-scroll \{[^}]*overflow-x: auto/);
  assert.match(view, /className="paper-ai-table-scroll" tabIndex=\{0\} role="region"/);
});

test("paper chat retains a resizable width on narrow layouts", () => {
  assert.match(css, /\.paper-chat-open \.paper-ai-panel \{ width: min\(var\(--paper-chat-width/);
  assert.match(css, /\.paper-chat-open \.paper-chat-resizer \{[^}]*display: block/);
  assert.match(view, /panel\.getBoundingClientRect\(\)\.width/);
  assert.match(view, /setPointerCapture\(event\.pointerId\)/);
  assert.match(view, /onKeyDown=\{handleChatResizeKey\}/);
});
