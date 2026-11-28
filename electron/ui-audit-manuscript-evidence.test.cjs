const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const view = fs.readFileSync(path.join(__dirname, "../src/PaperWritingView.tsx"), "utf8");

test("evidence selections follow the textarea's LF offsets and keep tiny values", () => {
  assert.match(view, /draft\.replace\(\/\\r\\n\?\/g, "\\n"\)/);
  assert.match(view, /toExponential\(4\)/);
  assert.match(view, /lineStart\(normalized, source\.line\)/);
  assert.match(view, /revealSearchMatch\(start, start \+ source\.text\.length, normalized\)/);
});
