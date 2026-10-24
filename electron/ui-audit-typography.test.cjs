const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const main = fs.readFileSync(path.join(root, "src", "main.tsx"), "utf8");
const typography = fs.readFileSync(path.join(root, "src", "typography.css"), "utf8");

test("warm type layer loads after the layout stylesheet", () => {
  assert.match(main, /import "\.\/styles\.css";\s*import "\.\/typography\.css";/);
});

test("charcoal uses warm neutral surfaces and ink", () => {
  assert.match(typography, /--night-ground: #141110/);
  assert.match(typography, /--night-sidebar: #1b1816/);
  assert.match(typography, /--night-panel: #211e1c/);
  assert.match(typography, /--night-ink: #eae8e6/);
  assert.match(typography, /--night-muted: #a5a09c/);
  assert.match(typography, /html:not\(\[data-theme="paper"\]\) \.main-toolbar \{ background: #141110/);
});

test("paper keeps a warm light palette", () => {
  assert.match(typography, /:root\[data-theme="paper"\] \{[\s\S]*?--night-ground: #faf7f2/);
  assert.match(typography, /--night-sidebar: #f4f0e9/);
  assert.match(typography, /--night-ink: #2c2826/);
  assert.match(typography, /\.theme-paper \.main-toolbar \{ background: rgba\(255, 253, 248, \.96\)/);
});

test("primary UI text moves to a 14px/15px scale", () => {
  assert.match(typography, /\.codex-nav-item \{ font-size: 14px/);
  assert.match(typography, /\.conversation-title strong \{ font-size: 14px/);
  assert.match(typography, /\.message-markdown \{ font-size: 15px; line-height: 1\.68/);
  assert.match(typography, /\.conversation-composer textarea \{ font-size: 14px/);
});

test("reading and settings surfaces use a clearer hierarchy", () => {
  assert.match(typography, /\.paper-inspector-title h2 \{ font-size: 24px/);
  assert.match(typography, /\.paper-abstract \{ font-size: 14px; line-height: 1\.65/);
  assert.match(typography, /\.library-card-copy strong \{ font-size: 16px/);
  assert.match(typography, /\.settings-header h2 \{ font-size: 24px/);
  assert.match(typography, /\.settings-nav-item \{ height: 34px; font-size: 12px/);
});

test("phase B does not bundle or load Geist yet", () => {
  assert.doesNotMatch(typography, /font-family:[^;]*Geist/i);
  assert.doesNotMatch(typography, /@font-face/);
});
