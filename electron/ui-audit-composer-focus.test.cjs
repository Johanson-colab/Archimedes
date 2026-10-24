const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const css = fs.readFileSync(path.resolve(__dirname, "..", "src", "styles.css"), "utf8");

test("composer textarea no longer paints its own focus outline", () => {
  assert.match(css, /\.conversation-composer textarea:focus-visible \{ outline: none; \}/);
});

test("composer focus ring is applied to the container after the graphite reset", () => {
  const reset = css.search(/\.conversation-composer, \.conversation-composer:focus-within \{ box-shadow: none; \}/);
  const ring = css.search(/\.conversation-composer:focus-within \{\s*border-color: var\(--focus-ring\);\s*box-shadow: 0 0 0 2px/);
  assert.ok(reset >= 0, "graphite box-shadow reset is missing");
  assert.ok(ring >= 0, "composer focus ring rule is missing");
  assert.ok(ring > reset, "focus ring must override the graphite reset");
});
