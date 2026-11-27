const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "../src/HarnessPicker.tsx"), "utf8");
const input = /<input className="composer-model-search"[\s\S]*?\/>/.exec(source)?.[0];
assert.ok(input, "the model search field should exist");
const handlerSource = /onKeyDown=\{event => \{([\s\S]*?)\}\}/.exec(input)?.[1];
assert.ok(handlerSource, "the model search field should handle key events");
const handler = new Function("event", handlerSource);

function stopped(key) {
  const calls = [];
  handler({ key, stopPropagation() { calls.push(key); } });
  return calls;
}

test("model search stops text keys but lets dismissal and navigation keys bubble", () => {
  assert.deepEqual(stopped("a"), ["a"]);
  assert.deepEqual(stopped("ArrowLeft"), ["ArrowLeft"]);
  for (const key of ["Escape", "Tab", "ArrowDown", "ArrowUp", "Home", "End", "Enter"]) {
    assert.deepEqual(stopped(key), [], `${key} should reach the menu`);
  }
});
