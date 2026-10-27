const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const settings = require("./workbench-settings.cjs");

test("workbench settings normalize unknown and duplicate tabs", () => {
  const normalized = settings.normalize({ order: ["notes", "notes", "unknown"], hidden: ["all"] });
  assert.deepEqual(normalized.order.slice(0, 2), ["notes", "journey"]);
  assert.equal(new Set(normalized.order).size, 6);
  assert.deepEqual(normalized.hidden, []);
});

test("workbench settings always keep one tab visible", () => {
  const normalized = settings.normalize({ hidden: ["journey", "trajectory", "files", "changes", "notes", "terminal"] });
  assert.equal(normalized.hidden.length, 5);
  assert.ok(normalized.order.some((id) => !normalized.hidden.includes(id)));
});

test("workbench settings persist and reset", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-workbench-settings-"));
  try {
    settings.initialize(directory);
    settings.saveWorkbenchSettings({ order: ["changes", "notes", "journey"], hidden: ["terminal"] });
    const saved = JSON.parse(fs.readFileSync(path.join(directory, "workbench-settings.json"), "utf8"));
    assert.equal(saved.order[0], "changes");
    assert.deepEqual(saved.hidden, ["terminal"]);
    assert.equal(settings.workbenchSettings().order[0], "changes");

    const reset = settings.resetWorkbenchSettings();
    assert.equal(reset.order[0], "journey");
    assert.deepEqual(reset.hidden, []);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
