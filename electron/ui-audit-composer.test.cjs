const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const app = read("src", "App.tsx");
const css = read("src", "styles.css");

test("conversation composers keep their resting border while focused", () => {
  assert.doesNotMatch(css, /\.conversation-composer:focus-within/);
  assert.doesNotMatch(css, /\.theme-paper \.conversation-composer:focus-within/);
  assert.doesNotMatch(css, /\.has-welcome \.conversation-composer:focus-within/);
  assert.doesNotMatch(css, /\.paper-ai-compose-input:focus-within/);
  assert.match(css, /\.conversation-composer textarea:focus-visible \{ outline: none; \}/);
});

test("the chat send control is a neutral circular up-arrow", () => {
  assert.match(app, /<ArrowUp size=\{16\} strokeWidth=\{2\.4\} \/>/);
  assert.doesNotMatch(app, /SendHorizontal/);
  assert.match(css, /--chat-send-bg: #34332f/);
  assert.match(css, /\.conversation-send,[\s\S]*?border-radius: 50%;/);
  assert.match(css, /\.conversation-send:hover,[\s\S]*?background: var\(--chat-send-bg-hover\);/);
  assert.match(css, /\.conversation-send:disabled,[\s\S]*?background: var\(--chat-send-disabled-bg\);/);
  assert.doesNotMatch(css, /\.conversation-send \{ color: var\(--accent-ink\); background: var\(--accent\)/);
});
