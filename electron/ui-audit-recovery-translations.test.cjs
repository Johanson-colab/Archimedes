const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const reproduce = fs.readFileSync(path.join(root, "src/i18n/translations/reproduce.ts"), "utf8");
const graph = fs.readFileSync(path.join(root, "src/i18n/translations/researchGraph.ts"), "utf8");
const view = fs.readFileSync(path.join(root, "src/ReproduceView.tsx"), "utf8");
const inspector = fs.readFileSync(path.join(root, "src/research-graph/ExperimentInspector.tsx"), "utf8");

function translated(shard, key) {
  const match = new RegExp(`^\\s*"${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}":\\s*"([^"]+)",?\\s*$`, "m").exec(shard);
  assert.ok(match, `missing translation: ${key}`);
  assert.notEqual(match[1], key, `translation should differ: ${key}`);
  assert.match(match[1], /[一-鿿]/);
}

test("recovery warnings are translated at the render boundary", () => {
  translated(reproduce, "Remote process status is unconfirmed after the app closed. Check the SSH host before running again.");
  translated(reproduce, "The app stopped while this was running. Start it again.");
  translated(graph, "A process with the saved PID is still present. Verify its identity before stopping or rerunning it.");
  translated(graph, "The run process is no longer available.");
  assert.match(view, /\{t\(detail\.error\)\}/);
  assert.match(inspector, /<p>\{t\(run\.error\)\}<\/p>/);
});
