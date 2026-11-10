const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const sidebarSettings = require("./sidebar-settings.cjs");

function initialize(t, saved) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-sidebar-settings-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  if (saved) fs.writeFileSync(path.join(root, "sidebar-settings.json"), JSON.stringify(saved));
  return { root, settings: sidebarSettings.initialize(root) };
}

const hiddenByDefault = ["news", "benchmark-radar", "extensions", "paper-review"];
test("new installations show the eight default Research Apps", (t) => {
  const { settings } = initialize(t);
  assert.deepEqual(settings, { version: 4, layout: "flat", disabledCore: hiddenByDefault });
  assert.deepEqual(sidebarSettings.CORE_MODULE_IDS.filter((id) => !settings.disabledCore.includes(id)), ["library", "daily", "reproduce", "writing", "image-creation", "data-charts", "data-analysis", "paper-to-slides"]);
});

test("visibility toggles persist without reapplying defaults", (t) => {
  const { root } = initialize(t);
  sidebarSettings.setCoreEnabled("library", false);
  assert.ok(sidebarSettings.initialize(root).disabledCore.includes("library"));
  sidebarSettings.setCoreEnabled("library", true);
  for (const id of hiddenByDefault) sidebarSettings.setCoreEnabled(id, true);
  assert.deepEqual(sidebarSettings.initialize(root).disabledCore, []);
  sidebarSettings.setCoreEnabled("news", false);
  assert.deepEqual(sidebarSettings.initialize(root).disabledCore, ["news"]);
});

test("legacy default-all installations adopt Research Apps defaults in every old layout", (t) => {
  for (const layout of ["flat", "tabs", "sections"]) {
    const { settings } = initialize(t, { version: 2, layout, disabledCore: [] });
    assert.deepEqual(settings, { version: 4, layout: "flat", disabledCore: hiddenByDefault });
  }
});

test("legacy custom visibility is preserved while grouped layout is retired", (t) => {
  for (const version of [1, 2]) {
    const { settings } = initialize(t, { version, layout: "sections", disabledCore: ["daily"] });
    assert.deepEqual(settings, { version: 4, layout: "flat", disabledCore: ["daily"] });
  }
});

test("legacy layout IPC cannot restore grouped navigation or reset app choices", (t) => {
  const { root } = initialize(t);
  sidebarSettings.setCoreEnabled("news", true);
  assert.equal(sidebarSettings.setLayout("tabs").layout, "flat");
  assert.equal(sidebarSettings.setLayout("sections").layout, "flat");
  assert.deepEqual(sidebarSettings.initialize(root).disabledCore, ["benchmark-radar", "extensions", "paper-review"]);
  assert.throws(() => sidebarSettings.setLayout("columns"));
});

test("corrupt settings fall back safely and unknown ids are sanitized", (t) => {
  const { root, settings } = initialize(t, { version: 3, disabledCore: ["library", "library", "unknown", 42] });
  assert.deepEqual(settings.disabledCore, ["library"]);
  assert.throws(() => sidebarSettings.setCoreEnabled("unknown", false));
  fs.writeFileSync(path.join(root, "sidebar-settings.json"), "not JSON");
  assert.deepEqual(sidebarSettings.initialize(root).disabledCore, hiddenByDefault);
});


test("split charts inherits Image creation visibility once and keeps later independent choices", (t) => {
  const { root, settings } = initialize(t, { version: 3, disabledCore: ["news", "image-creation"] });
  assert.deepEqual(settings.disabledCore, ["news", "image-creation", "data-charts"]);
  sidebarSettings.setCoreEnabled("data-charts", true);
  assert.deepEqual(sidebarSettings.initialize(root).disabledCore, ["news", "image-creation"]);
  sidebarSettings.setCoreEnabled("data-charts", false);
  assert.ok(sidebarSettings.initialize(root).disabledCore.includes("data-charts"));
});

test("upgrading version 3 keeps explicit all-visible preferences", (t) => {
  const { settings } = initialize(t, { version: 3, layout: "flat", disabledCore: [] });
  assert.deepEqual(settings, { version: 4, layout: "flat", disabledCore: [] });
});
