const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const sidebarSettings = require("./sidebar-settings.cjs");

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("core module settings default to a flat sidebar with everything visible", () => {
  const root = tempDir("archimedes-sidebar-settings-");
  const settings = sidebarSettings.initialize(root);
  assert.deepEqual(settings, { version: 2, layout: "flat", disabledCore: [] });
});

test("setCoreEnabled toggles and persists a core module", () => {
  const root = tempDir("archimedes-sidebar-settings-");
  sidebarSettings.initialize(root);
  const hidden = sidebarSettings.setCoreEnabled("library", false);
  assert.deepEqual(hidden.disabledCore, ["library"]);
  const shown = sidebarSettings.setCoreEnabled("library", true);
  assert.deepEqual(shown.disabledCore, []);
  // The change survived a re-initialize from disk.
  const reloaded = sidebarSettings.initialize(root);
  assert.deepEqual(reloaded.disabledCore, []);
  sidebarSettings.setCoreEnabled("daily", false);
  sidebarSettings.setCoreEnabled("writing", false);
  const reloaded2 = sidebarSettings.initialize(root);
  assert.deepEqual(reloaded2.disabledCore, ["daily", "writing"]);
});

test("sidebar layout switches between flat, tabs, and sections", () => {
  const root = tempDir("archimedes-sidebar-settings-");
  sidebarSettings.initialize(root);
  assert.equal(sidebarSettings.setLayout("tabs").layout, "tabs");
  assert.equal(sidebarSettings.setLayout("sections").layout, "sections");
  const reloaded = sidebarSettings.initialize(root);
  assert.equal(reloaded.layout, "sections");
  assert.throws(() => sidebarSettings.setLayout("columns"));
});

test("core visibility changes keep the selected layout", () => {
  const root = tempDir("archimedes-sidebar-settings-");
  sidebarSettings.initialize(root);
  sidebarSettings.setLayout("tabs");
  const updated = sidebarSettings.setCoreEnabled("daily", false);
  assert.equal(updated.layout, "tabs");
  assert.deepEqual(updated.disabledCore, ["daily"]);
});

test("v1 settings migrate to flat without losing hidden modules", () => {
  const root = tempDir("archimedes-sidebar-settings-");
  fs.writeFileSync(path.join(root, "sidebar-settings.json"), `${JSON.stringify({ version: 1, disabledCore: ["daily"] }, null, 2)}\n`, "utf8");
  const settings = sidebarSettings.initialize(root);
  assert.deepEqual(settings, { version: 2, layout: "flat", disabledCore: ["daily"] });
});

test("unknown core module ids are rejected and sanitized on load", () => {
  const root = tempDir("archimedes-sidebar-settings-");
  fs.writeFileSync(path.join(root, "sidebar-settings.json"), `${JSON.stringify({ version: 1, disabledCore: ["library", "not-a-module", 42] }, null, 2)}\n`, "utf8");
  const settings = sidebarSettings.initialize(root);
  assert.deepEqual(settings.disabledCore, ["library"]);
  assert.throws(() => sidebarSettings.setCoreEnabled("not-a-module", false));
});
