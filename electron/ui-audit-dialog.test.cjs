const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("shared dialog hook implements escape, tab trapping, scroll lock and focus return", () => {
  const hook = read("src/useDialogFocus.ts");
  assert.match(hook, /event\.key === "Escape"/);
  assert.match(hook, /event\.key !== "Tab"/);
  assert.match(hook, /document\.body\.style\.overflow = "hidden"/);
  assert.match(hook, /previous\.focus\(\)/);
});

test("all modal surfaces use the shared dialog contract", () => {
  for (const file of [
    "src/App.tsx",
    "src/ModelSettingsModal.tsx",
    "src/WebSearchSettingsModal.tsx",
    "src/LibraryView.tsx",
    "src/ProjectSidebar.tsx",
    "src/PaperWritingView.tsx",
    "src/ImageCreationView.tsx",
  ]) {
    const source = read(file);
    assert.match(source, /useDialogFocus/, `${file} should use useDialogFocus`);
    assert.match(source, /tabIndex=\{-1\}/, `${file} should expose a focusable dialog root`);
  }
});

test("welcome composer and resizers have explicit focus styling", () => {
  const css = read("src/styles.css");
  assert.match(css, /\.has-welcome \.conversation-composer:focus-within[\s\S]*?box-shadow: 0 0 0 2px var\(--welcome-bronze\)/);
  assert.match(css, /\.sidebar-resizer:focus-visible \{ outline: 2px solid/);
  assert.match(css, /\.paper-pane-resizer:focus-visible \{ outline: 2px solid/);
});
