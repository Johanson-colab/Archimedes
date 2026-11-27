const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const main = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");

test("stopping a command records cancellation instead of the cached exit code", () => {
  assert.match(main, /cancelled: false/);
  assert.match(main, /session\.cancelled = true/);
  assert.match(main, /session\.cancelled \? "cancelled" : code === 0 \? "completed" : "failed"/);
  assert.match(main, /\[process stopped\]/);
});
