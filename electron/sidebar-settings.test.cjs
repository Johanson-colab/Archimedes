const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const sidebarSettings = require("./sidebar-settings.cjs");

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("core module settings default to everything visible", () => {
  const root = tempDir("archimedes-sidebar-settings-");
  const settings = sidebarSettings.initialize(root);
  assert.deepEqual(settings, { version: 1, disabledCore: [] });
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

test("unknown core module ids are rejected and sanitized on load", () => {
  const root = tempDir("archimedes-sidebar-settings-");
  fs.writeFileSync(path.join(root, "sidebar-settings.json"), `${JSON.stringify({ version: 1, disabledCore: ["library", "not-a-module", 42] }, null, 2)}\n`, "utf8");
  const settings = sidebarSettings.initialize(root);
  assert.deepEqual(settings.disabledCore, ["library"]);
  assert.throws(() => sidebarSettings.setCoreEnabled("not-a-module", false));
});
