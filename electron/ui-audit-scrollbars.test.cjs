const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const css = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");
const tokens = fs.readFileSync(path.join(root, "src", "tokens.css"), "utf8");

test("scrollbars share theme tokens and hide native arrow buttons", () => {
  assert.match(tokens, /--scrollbar-size: 10px/);
  assert.match(tokens, /--scrollbar-thumb: #454545/);
  assert.match(tokens, /--scrollbar-thumb-hover: #5f5f5f/);
  assert.match(tokens, /--scrollbar-thumb: #c9c4bc/);
  assert.match(tokens, /--scrollbar-thumb-hover: #b3ada4/);
  assert.match(css, /\*::-webkit-scrollbar \{ width: var\(--scrollbar-size\); height: var\(--scrollbar-size\); \}/);
  assert.match(css, /\*::-webkit-scrollbar-track \{ background: transparent; \}/);
  assert.match(css, /\*::-webkit-scrollbar-button \{ display: none; width: 0; height: 0; \}/);
  assert.match(css, /border-radius: 999px/);
  assert.match(css, /background-clip: content-box/);
  assert.match(css, /@supports not selector\(::-webkit-scrollbar\)/);
});

test("conversation scrollbar reveals only while hovering the transcript", () => {
  assert.match(css, /\.conversation-scroll::-webkit-scrollbar-thumb \{[^}]*background-color: transparent;/);
  assert.match(css, /\.conversation-scroll:hover::-webkit-scrollbar-thumb \{[^}]*background-color: var\(--scrollbar-thumb\);/);
  assert.match(css, /\.conversation-scroll:hover::-webkit-scrollbar-thumb:hover \{[^}]*var\(--scrollbar-thumb-hover\)/);
  assert.match(css, /\.conversation-scroll \{ scrollbar-color: transparent transparent; \}/);
  assert.match(css, /\.conversation-scroll:hover \{ scrollbar-color: var\(--scrollbar-thumb\) transparent; \}/);
});

test("intentionally hidden scrollbars stay hidden", () => {
  assert.match(css, /\.latex-highlight \{[^}]*scrollbar-width: none/);
  assert.match(css, /\.latex-highlight::-webkit-scrollbar \{ display: none; \}/);
  assert.match(css, /html\[data-titlebar="overlay"\] \.workbench-tabs \{[^}]*scrollbar-width: none/);
  assert.match(css, /html\[data-titlebar="overlay"\] \.workbench-tabs::-webkit-scrollbar \{ display: none; \}/);
});
