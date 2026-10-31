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
    "src/LibraryView.tsx",
    "src/ProjectSidebar.tsx",
    "src/PaperWritingView.tsx",
    "src/ImageCreationView.tsx",
    "src/ArtifactsPanel.tsx",
    "src/ExtensionsView.tsx",
  ]) {
    const source = read(file);
    assert.match(source, /useDialogFocus/, `${file} should use useDialogFocus`);
    assert.match(source, /app-dialog/, `${file} should use the shared dialog skin`);
    assert.match(source, /DialogPortal|createPortal/, `${file} should portal its dialog`);
  }
});

test("welcome composer stays quiet while resizers keep explicit focus styling", () => {
  const css = read("src/styles.css");
  assert.doesNotMatch(css, /\.has-welcome \.conversation-composer:focus-within/);
  assert.match(css, /\.sidebar-resizer:focus-visible \{ outline: 2px solid/);
  assert.match(css, /\.paper-pane-resizer:focus-visible \{ outline: 2px solid/);
});

test("paper project dialog is dismissible before a project exists", () => {
  const paper = read("src/PaperWritingView.tsx");
  assert.match(paper, /useDialogFocus<HTMLElement>\(dialogOpen, \(\) => setChooserOpen\(false\)\)/);
  assert.match(paper, /event\.target === event\.currentTarget\) setChooserOpen\(false\)/);
  assert.doesNotMatch(paper, /activeProject && <button[^>]*aria-label="Close project chooser"/);
  assert.match(paper, /<button className="app-dialog-close" onClick=\{\(\) => setChooserOpen\(false\)\} aria-label="Close project chooser">/);
});
