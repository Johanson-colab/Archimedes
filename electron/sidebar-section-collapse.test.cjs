const assert = require("node:assert/strict");
const test = require("node:test");
const {
  DEFAULT_SIDEBAR_SECTION_COLLAPSE,
  LEGACY_SIDEBAR_SECTION_KEYS,
  readSidebarSectionCollapse,
  SIDEBAR_SECTION_COLLAPSE_STORAGE_KEY,
  writeSidebarSectionCollapse,
} = require("../src/sidebar-section-collapse.ts");

test("section collapse preferences default open and persist independently", () => {
  const storage = {
    value: "",
    getItem(key) {
      if (LEGACY_SIDEBAR_SECTION_KEYS.includes(key)) return null;
      assert.equal(key, SIDEBAR_SECTION_COLLAPSE_STORAGE_KEY);
      return this.value;
    },
    setItem(key, value) {
      assert.equal(key, SIDEBAR_SECTION_COLLAPSE_STORAGE_KEY);
      this.value = value;
    },
  };

  assert.deepEqual(readSidebarSectionCollapse(storage), DEFAULT_SIDEBAR_SECTION_COLLAPSE);
  const collapsed = { apps: true, projects: false };
  writeSidebarSectionCollapse(collapsed, storage);
  assert.deepEqual(readSidebarSectionCollapse(storage), collapsed);
});

test("legacy section settings retain collapse state without using their saved order", () => {
  const collapsed = readSidebarSectionCollapse({
    getItem(key) {
      if (key === LEGACY_SIDEBAR_SECTION_KEYS[0]) {
        return JSON.stringify({
          order: ["projects", "apps"],
          collapsed: { apps: false, projects: true },
        });
      }
      return null;
    },
  });

  assert.deepEqual(collapsed, { apps: false, projects: true });
  assert.equal("order" in collapsed, false);
});

test("invalid stored collapse preferences fall back to open sections", () => {
  assert.deepEqual(readSidebarSectionCollapse({ getItem: () => "{" }), DEFAULT_SIDEBAR_SECTION_COLLAPSE);
});
