const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const css = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");
const view = fs.readFileSync(path.join(root, "src", "LibraryView.tsx"), "utf8");

test("paper chat keeps its column bounded and oversized content locally scrollable", () => {
  assert.match(css, /\.paper-ai-conversation \{[^}]*overflow-x: hidden;[^}]*overflow-y: auto/);
  assert.match(css, /\.paper-ai-conversation \.conversation-message \{[^}]*overflow-wrap: anywhere|min-width: 0/);
  assert.match(css, /\.paper-ai-conversation \.message-markdown table \{[^}]*overflow-x: auto/);
  assert.match(view, /className="paper-ai-table-scroll" tabIndex=\{0\} role="region"/);
});

test("paper chat retains a resizable width on narrow layouts", () => {
  assert.match(css, /\.paper-chat-open \.paper-ai-panel \{ width: min\(var\(--paper-chat-width/);
  assert.match(css, /\.paper-chat-open \.paper-chat-resizer \{[^}]*display: block/);
  assert.match(view, /panel\.getBoundingClientRect\(\)\.width/);
  assert.match(view, /setPointerCapture\(event\.pointerId\)/);
  assert.match(view, /onKeyDown=\{handleChatResizeKey\}/);
});

test("the blinking generation cursor does not style the selected passage", () => {
  const cursorRule = css.match(/([^{}]+)\{[^{}]*animation:\s*paper-ai-stream-blink[^{}]*\}/);
  assert.ok(cursorRule, "generation cursor animation is present");
  assert.equal(cursorRule[1].trim(), ".paper-ai-stream-cursor");
});
