const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const main = fs.readFileSync(path.join(root, "electron", "main.cjs"), "utf8");

test("a second launch focuses the existing window instead of starting a second process", () => {
  assert.match(main, /const singleInstanceLock = app\.requestSingleInstanceLock\(\)/);
  assert.match(main, /if \(!singleInstanceLock\) \{\s*app\.quit\(\)/);
  assert.match(main, /app\.on\("second-instance"/);
  assert.match(main, /if \(existing\.isMinimized\(\)\) existing\.restore\(\)/);
  assert.match(main, /existing\.focus\(\)/);
});

test("the ready handler does not initialise services without the lock", () => {
  assert.match(main, /app\.whenReady\(\)\.then\(async \(\) => \{\s*if \(!singleInstanceLock\) return;/);
});
