const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const css = fs.readFileSync(path.resolve(__dirname, "..", "src", "styles.css"), "utf8");

test("composer textarea no longer paints its own focus outline", () => {
  assert.match(css, /\.conversation-composer textarea:focus-visible \{ outline: none; \}/);
});

test("composer focus no longer changes the container border", () => {
  assert.doesNotMatch(css, /\.conversation-composer:focus-within/);
  assert.doesNotMatch(css, /\.theme-paper \.conversation-composer:focus-within/);
  assert.doesNotMatch(css, /\.has-welcome \.conversation-composer:focus-within/);
  assert.doesNotMatch(css, /border-color: var\(--focus-ring\)/);
});
