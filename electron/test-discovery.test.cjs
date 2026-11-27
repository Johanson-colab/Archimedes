const assert = require("node:assert/strict");
const test = require("node:test");
const { testFiles } = require("../scripts/run-tests.cjs");

test("automatic discovery includes runtime quit-guard tests", () => {
  const files = testFiles("all");
  assert.ok(files.includes("electron/runtime/active-runs.test.cjs"));
  assert.equal(files.filter(file => file.startsWith("electron/runtime/")).length, 1);
});

test("core and all modes discover the same runtime tests", () => {
  assert.deepEqual(testFiles("core").filter(file => file.startsWith("electron/runtime/")), testFiles("all").filter(file => file.startsWith("electron/runtime/")));
});
