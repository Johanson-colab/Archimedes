const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const css = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");
const library = fs.readFileSync(path.join(root, "src", "LibraryView.tsx"), "utf8");
const sidebar = fs.readFileSync(path.join(root, "src", "ProjectSidebar.tsx"), "utf8");
const app = fs.readFileSync(path.join(root, "src", "App.tsx"), "utf8");

test("high-frequency metadata uses the denser 10–11px scale", () => {
  assert.match(css, /\.daily-paper-row p \{[^}]*font-size: 11px/);
  assert.match(css, /\.daily-paper-date span \{[^}]*font-size: 10px/);
  assert.match(css, /\.artifact-tab-main span \{[^}]*font-size: 10px/);
  assert.match(css, /\.artifact-editor-header small \{[^}]*font-size: 10px/);
  assert.match(css, /\.codex-sidebar-label \{ color: var\(--night-faint\); font-size: 10px/);
});

test("daily dates use an explicit English locale", () => {
  assert.match(library, /toLocaleDateString\("en-US"/);
  assert.doesNotMatch(library, /toLocaleDateString\(undefined/);
});

test("zero counts and empty archived groups are hidden", () => {
  assert.match(sidebar, /projectThreads\.length > 0 && <small>/);
  assert.match(sidebar, /archivedProjects\.length > 0 && <>/);
  assert.match(sidebar, /archivedThreads\.length > 0 && <>/);
  assert.match(app, /"Ready for a new task"/);
});
