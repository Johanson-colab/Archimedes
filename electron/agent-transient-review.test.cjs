const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const agent = fs.readFileSync(path.resolve(__dirname, "agent.cjs"), "utf8");

test("transient review workers include their active turn in the in-memory context", () => {
  assert.match(agent, /thread: transient \? \{ id: thread\.id, title: thread\.title, mode, context_summary: "", turns: \[turn\] \}/);
  assert.doesNotMatch(agent, /thread: transient \? \{ id: thread\.id, title: thread\.title, mode, context_summary: "", turns: \[\] \}/);
});
