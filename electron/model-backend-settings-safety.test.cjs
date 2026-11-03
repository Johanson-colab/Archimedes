const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("model settings assertions never hand live DOM objects to Node's diff formatter", () => {
  const source = fs.readFileSync(path.join(__dirname, "model-backend-settings.test.cjs"), "utf8");
  // A failed identity assertion walks React's enumerable Fiber references at
  // depth 1000 in Node 25. Compare booleans/primitive properties, never the DOM.
  const unsafe = source.split("\n").filter((line) =>
    /assert\.(?:equal|strictEqual|deepEqual|deepStrictEqual)\(\s*document\.activeElement\s*,/.test(line) ||
    /assert\.(?:equal|strictEqual|deepEqual|deepStrictEqual)\(\s*document\.querySelector\([^\n;]+?\)\s*,\s*null\s*\)/.test(line));
  assert.deepEqual(unsafe, [], "DOM identity/presence assertions must compare booleans to keep failure output bounded");
});
