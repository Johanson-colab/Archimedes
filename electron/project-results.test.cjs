const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { saveAnalysis, loadAnalysis, listAnalyses } = require("./project-results.cjs");

const bytes = Buffer.from("\uFEFFseed,accuracy\r\n1,70\r\n2,72\r\n3,71\r\n");
const recipe = { config: { type: "line", x: 0, y: 1, group: -1 }, column: 1, seedColumn: 0, unit: "%" };
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "saved-analysis-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test("an immutable project analysis reopens with its exact input, units, seed recipe and computed summary", (t) => {
  const root = fixture(t);
  const saved = saveAnalysis(root, "project-a", { name: "accuracy.csv", bytes, recipe });
  assert.deepEqual(listAnalyses(root, "project-a"), [saved]);
  const reopened = loadAnalysis(root, "project-a", saved.id);
  assert.deepEqual(reopened.source.bytes, bytes);
  assert.equal(reopened.source.sha256, createHash("sha256").update(bytes).digest("hex"));
  assert.deepEqual(reopened.recipe, recipe);
  assert.equal(reopened.summary.mean, 71);
  assert.deepEqual(listAnalyses(root, "project-b"), []);
  assert.throws(() => loadAnalysis(root, "project-b", saved.id), { code: "ENOENT" });
});

test("changed and missing sources retain their receipt without substituting a same-named file", (t) => {
  const root = fixture(t);
  const { id } = saveAnalysis(root, "project-a", { name: "accuracy.csv", bytes, recipe });
  const source = path.join(root, "research-results/analysis/project-a", id, "source");
  fs.writeFileSync(path.join(root, "accuracy.csv"), bytes);
  fs.writeFileSync(source, "different source");
  assert.equal(loadAnalysis(root, "project-a", id).source.state, "changed");
  fs.unlinkSync(source);
  const missing = loadAnalysis(root, "project-a", id);
  assert.equal(missing.source.state, "missing");
  assert.equal(missing.source.bytes, undefined);
});

test("refuses an outside result directory before creating any package", (t) => {
  const root = fixture(t), outside = fixture(t);
  fs.symlinkSync(outside, path.join(root, "research-results"));
  assert.throws(() => saveAnalysis(root, "project-a", { name: "accuracy.csv", bytes, recipe }), /symbolic link/);
  assert.deepEqual(fs.readdirSync(outside), []);
});
