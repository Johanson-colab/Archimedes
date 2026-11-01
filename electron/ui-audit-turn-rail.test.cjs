const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { readLocale } = require("./locale-source.cjs");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "src", "App.tsx"), "utf8");
const rail = fs.readFileSync(path.join(root, "src", "TurnRail.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");
const tokens = fs.readFileSync(path.join(root, "src", "tokens.css"), "utf8");
const i18n = readLocale();

test("conversation turns get a rail inside the scroll area", () => {
  assert.match(app, /import TurnRail from "\.\/TurnRail"/);
  assert.match(app, /<TurnRail messages=\{visibleMessages\} scrollRef=\{scrollRef\} \/>/);
  assert.match(app, /data-turn-id=\{message\.role === "user" \? message\.id : undefined\}/);
  assert.match(app, /created_at\?: string/);
  assert.match(rail, /function TurnRail/);
  assert.match(rail, /data-turn-id/);
  assert.match(rail, /aria-current=\{index === active \? "step" : undefined\}/);
  assert.match(rail, /requestAnimationFrame\(update\)/);
  assert.match(rail, /ResizeObserver/);
  assert.match(rail, /turnSignature/);
});

test("turn rail ticks are short lines with a gold hover state", () => {
  assert.match(tokens, /--turn-rail-tick: #5b554f/);
  assert.match(tokens, /--turn-rail-hover: #e0b43b/);
  assert.match(tokens, /--turn-rail-hover: #b07a2b/);
  assert.match(css, /\.turn-rail-tick \{[^}]*width: 7px; height: 2px/);
  assert.match(css, /\.turn-rail-item:hover \.turn-rail-tick/);
  assert.match(css, /width: 11px; background: var\(--turn-rail-hover\)/);
  assert.match(css, /\.turn-rail-item\.active \.turn-rail-tick \{[^}]*width: 18px/);
  assert.match(css, /\.turn-rail \{[^}]*display: flex/);
  assert.match(css, /\.turn-rail\.hidden \{ display: none; \}/);
  assert.match(css, /\.turn-rail-viewport::-webkit-scrollbar \{ display: none; \}/);
  assert.match(css, /\.turn-rail-tip/);
  assert.doesNotMatch(rail, /Click to jump/);
  assert.doesNotMatch(rail, /5 \/ 8/);
  assert.match(i18n, /"Conversation turns": "对话轮次"/);
  assert.match(i18n, /"Jump to turn \{count\}": "跳到第 \{count\} 轮"/);
  assert.match(i18n, /"\{count\} source": "\{count\} 个来源"/);
});
