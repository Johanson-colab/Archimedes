const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const settings = require("./workbench-settings.cjs");

test("workbench settings normalize unknown and duplicate tabs", () => {
  const normalized = settings.normalize({ order: ["notes", "notes", "unknown"], hidden: ["all"] });
  assert.deepEqual(normalized.order.slice(0, 2), ["notes", "journey"]);
  assert.equal(new Set(normalized.order).size, 8);
  assert.deepEqual(normalized.hidden, ["artifacts", "browser"]);
});

test("workbench settings hide optional tabs by default and keep explicit choices", () => {
  const migrated = settings.normalize({ version: 1, order: ["journey", "terminal"], hidden: [] });
  assert.equal(migrated.version, settings.PREFERENCES_VERSION);
  assert.deepEqual(migrated.hidden, ["artifacts", "browser"]);

  const enabled = settings.normalize({ version: settings.PREFERENCES_VERSION, order: ["journey", "browser", "artifacts"], hidden: [] });
  assert.deepEqual(enabled.hidden, []);

  const v2BrowserEnabled = settings.normalize({ version: 2, order: ["journey", "browser"], hidden: [] });
  assert.deepEqual(v2BrowserEnabled.hidden, ["artifacts"]);

  // v4 only adds the split layout; it must not re-hide Artifacts for v3 users.
  const v3ArtifactsEnabled = settings.normalize({ version: 3, order: ["journey", "artifacts"], hidden: [] });
  assert.deepEqual(v3ArtifactsEnabled.hidden, []);
});

test("workbench settings always keep one tab visible", () => {
  const normalized = settings.normalize({ hidden: ["journey", "trajectory", "files", "changes", "artifacts", "notes", "terminal", "browser"] });
  assert.equal(normalized.hidden.length, 7);
  assert.ok(normalized.order.some((id) => !normalized.hidden.includes(id)));
});

test("workbench settings default to one full-width pane", () => {
  const normalized = settings.normalize({});
  assert.equal(normalized.version, 4);
  assert.equal(normalized.layout.orientation, "row");
  assert.equal(normalized.layout.panes.length, 1);
  assert.equal(normalized.layout.focused, normalized.layout.panes[0].id);
  assert.equal(normalized.layout.panes[0].size, 100);
  assert.deepEqual(normalized.layout.panes[0].tabs, normalized.order.filter((id) => !normalized.hidden.includes(id)));
  assert.equal(normalized.layout.panes[0].active, "trajectory");
});

test("workbench settings keep split panes stable and readable", () => {
  const normalized = settings.normalize({
    version: 4,
    order: ["journey", "trajectory", "files", "changes", "artifacts", "notes", "terminal", "browser"],
    hidden: ["artifacts", "browser"],
    layout: {
      orientation: "column",
      focused: "pane-2",
      panes: [
        { id: "pane-1", tabs: ["journey", "trajectory", "journey"], active: "files", size: 96 },
        { id: "pane-2", tabs: ["trajectory", "files"], active: "files", size: 4 },
        { id: "pane-3", tabs: ["notes"], active: "notes", size: 100 },
      ],
    },
  });
  assert.equal(normalized.layout.orientation, "column");
  assert.equal(normalized.layout.focused, "pane-2");
  assert.equal(normalized.layout.panes.length, 2);
  assert.deepEqual(normalized.layout.panes[0].tabs, ["journey", "trajectory", "changes", "notes", "terminal"]);
  assert.equal(normalized.layout.panes[0].active, "trajectory");
  assert.deepEqual(normalized.layout.panes[1].tabs, ["files"]);
  assert.equal(normalized.layout.panes[1].active, "files");
  const total = normalized.layout.panes.reduce((sum, pane) => sum + pane.size, 0);
  assert.equal(Math.round(total), 100);
  assert.ok(normalized.layout.panes.every((pane) => pane.size >= 25));
});

test("workbench settings recover from empty and orphaned panes", () => {
  const normalized = settings.normalize({
    version: 4,
    order: ["journey", "trajectory", "files", "changes", "artifacts", "notes", "terminal", "browser"],
    hidden: ["artifacts", "browser"],
    layout: {
      orientation: "row",
      focused: "missing",
      panes: [
        { id: "pane-1", tabs: [], active: "journey", size: 100 },
        { id: "pane-1", tabs: ["files"], active: "unknown", size: 100 },
      ],
    },
  });
  assert.equal(normalized.layout.panes.length, 1);
  assert.notEqual(normalized.layout.panes[0].id, "");
  assert.ok(normalized.layout.panes.some((pane) => pane.id === normalized.layout.focused));
  assert.deepEqual(
    normalized.layout.panes.flatMap((pane) => pane.tabs).sort(),
    ["changes", "files", "journey", "notes", "terminal", "trajectory"],
  );
});

test("workbench settings persist and reset", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-workbench-settings-"));
  try {
    settings.initialize(directory);
    settings.saveWorkbenchSettings({ version: settings.PREFERENCES_VERSION, order: ["changes", "notes", "journey"], hidden: ["terminal"] });
    const saved = JSON.parse(fs.readFileSync(path.join(directory, "workbench-settings.json"), "utf8"));
    assert.equal(saved.order[0], "changes");
    assert.deepEqual(saved.hidden, ["terminal"]);
    assert.equal(settings.workbenchSettings().order[0], "changes");

    const reset = settings.resetWorkbenchSettings();
    assert.equal(reset.order[0], "journey");
    assert.deepEqual(reset.hidden, ["artifacts", "browser"]);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
