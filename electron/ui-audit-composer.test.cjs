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
  assert.doesNotMatch(css, /\.paper-ai-compose textarea:focus \{ border-color: #8fb6a0/);
  assert.doesNotMatch(css, /\.reader-notebook-section textarea:focus \{ border-color: #8fb6a0/);
  assert.match(css, /\.conversation-composer textarea:focus-visible \{ outline: none; \}/);
});

test("chat-like side inputs share the quiet focus contract", () => {
  for (const selector of [
    ".paper-ai-compose textarea:focus",
    ".paper-ai-compose textarea:focus-visible",
    ".paper-comment-composer textarea:focus",
    ".paper-comment-composer textarea:focus-visible",
    ".artifact-comment-box textarea:focus",
    ".artifact-comment-box textarea:focus-visible",
    ".reader-notebook-section textarea:focus",
    ".reader-notebook-section textarea:focus-visible",
    ".notes-editor:focus",
    ".notes-editor:focus-visible",
  ]) {
    assert.ok(css.includes(selector), `${selector} should be included in the quiet focus reset`);
  }
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
