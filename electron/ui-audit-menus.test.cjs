const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const css = read("src", "styles.css");
const tokens = read("src", "tokens.css");
const menuSource = read("src", "Menu.tsx");

const menuFiles = [
  ["AccountChip.tsx", 1],
  ["ProjectSidebar.tsx", 2],
  ["RightWorkbench.tsx", 2],
  ["ContextPicker.tsx", 1],
  ["App.tsx", 2],
  ["ProactiveAgentPanel.tsx", 1],
  ["ModelSettingsModal.tsx", 1],
  ["LibraryView.tsx", 1],
  ["ImageCreationView.tsx", 1],
  ["DataChartGallery.tsx", 1],
];

test("every dropdown / overflow menu renders through the shared MenuSurface", () => {
  let total = 0;
  for (const [file, count] of menuFiles) {
    const source = read("src", file);
    const uses = (source.match(/<MenuSurface\b/g) ?? []).length;
    total += uses;
    assert.ok(uses >= count, `${file} should use MenuSurface at least ${count} time(s), found ${uses}`);
    assert.match(source, /from "\.\/Menu"/, `${file} should import the menu primitive`);
  }
  assert.equal(total, 15, "all menu surfaces should be accounted for");
});

test("menu semantics only live in the primitive", () => {
  for (const [file] of menuFiles) {
    const source = read("src", file);
    assert.doesNotMatch(source, /role="menu"/, `${file} should not hand-roll role="menu"`);
    assert.doesNotMatch(source, /role="menuitem(?:radio|checkbox)?"/, `${file} should render items through MenuItem`);
  }
  assert.match(menuSource, /role=\{role\}/);
  assert.match(menuSource, /role=\{checked === undefined \? "menuitem" : "menuitemradio"\}/);
});

test("menu primitive owns positioning, dismissal and keyboard behaviour", () => {
  assert.match(menuSource, /createPortal/);
  assert.match(menuSource, /getBoundingClientRect/);
  assert.match(menuSource, /ArrowDown/);
  assert.match(menuSource, /Escape/);
  assert.match(menuSource, /pointerdown/);
  assert.match(menuSource, /ResizeObserver/);
  assert.match(menuSource, /anchor\?\.focus\(\)/);
  assert.match(css, /\.menu-surface \{/);
  assert.match(css, /\.menu-surface \.menu-item \{/);
  assert.match(css, /var\(--menu-radius\)/);
  assert.match(css, /var\(--menu-item-height\)/);
  assert.match(tokens, /--menu-surface:/);
  assert.match(tokens, /--menu-item-height: 44px/);
});

test("menu style presets apply to the shared surface", () => {
  assert.match(css, /html\[data-menu-style="flat"\] \.menu-surface/);
  assert.match(css, /html\[data-menu-style="outlined"\] \.menu-surface/);
  assert.match(css, /html\[data-menu-style="glass"\] \.menu-surface/);
});

test("legacy and dead menu implementations are removed", () => {
  assert.doesNotMatch(read("src", "App.tsx"), /runtimeMenuOpen/);
  assert.doesNotMatch(css, /\.research-mode-menu/);
  assert.doesNotMatch(css, /(^|[ ,])\.proactive-menu([ ,{:]|$)/m);
  assert.doesNotMatch(css, /data-menu-style="[^"]+"\] :is\(/);
});

test("context picker, filters and model catalog expose correct roles", () => {
  assert.match(read("src", "ContextPicker.tsx"), /role="group"/);
  assert.match(read("src", "ImageCreationView.tsx"), /role="group"/);
  assert.match(read("src", "DataChartGallery.tsx"), /role="group"/);
  const model = read("src", "ModelSettingsModal.tsx");
  assert.match(model, /role="combobox"/);
  assert.match(model, /aria-activedescendant/);
  assert.match(model, /role="option"/);
});
