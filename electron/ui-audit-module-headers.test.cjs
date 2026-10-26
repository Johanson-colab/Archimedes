const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "src", "App.tsx"), "utf8");
const paper = fs.readFileSync(path.join(root, "src", "PaperWritingView.tsx"), "utf8");
const gallery = fs.readFileSync(path.join(root, "src", "GalleryView.tsx"), "utf8");
const benchmark = fs.readFileSync(path.join(root, "src", "BenchmarkRadarView.tsx"), "utf8");
const library = fs.readFileSync(path.join(root, "src", "LibraryView.tsx"), "utf8");
const typography = fs.readFileSync(path.join(root, "src", "typography.css"), "utf8");
const extensions = fs.readFileSync(path.join(root, "src", "ExtensionsView.tsx"), "utf8");

test("module actions share the main toolbar slot", () => {
  assert.match(app, /id="module-toolbar-actions" className="module-toolbar-actions"/);
  assert.match(app, /active=\{mainSection === "writing"\}/);
  assert.match(paper, /<ToolbarActions active=\{active\}>/);
  assert.match(gallery, /<ToolbarActions active=\{active\}>/);
  assert.match(benchmark, /<ToolbarActions>/);
});

test("module-specific title headers are removed", () => {
  assert.doesNotMatch(paper, /className="paper-writing-header"/);
  assert.doesNotMatch(gallery, /className="gallery-header"/);
  assert.doesNotMatch(benchmark, /className="benchmark-header"/);
  assert.match(library, /className="library-page daily-page">\s*<div className="daily-feed-toolbar/);
});

test("library and extensions rely on the toolbar instead of a second title block", () => {
  assert.doesNotMatch(library, /Knowledge base<\/span><h1>Literature library/);
  assert.doesNotMatch(library, /Curated research directions/);
  assert.doesNotMatch(library, /className="library-page-header"/);
  assert.match(library, /<ToolbarActions><button className="primary-button"[^>]*>.*New library/);
  assert.doesNotMatch(extensions, /extensions-heading/);
  assert.doesNotMatch(extensions, /Everything that changes what the Agent can do/);
});

test("toolbar carries the knowledge module subtitle", () => {
  assert.match(app, /mainSection === "gallery" \? t\("Visual research index"\)/);
  assert.match(app, /mainSection === "writing" \? t\("LaTeX workspace"\)/);
  assert.match(app, /mainSection === "daily" \? t\("Live research feed"\)/);
  assert.match(app, /mainSection === "benchmark-radar" \? t\("Benchmark intelligence"\)/);
});

test("removing the second header reclaims vertical space", () => {
  assert.match(typography, /\.paper-writing-page \{ grid-template-rows: minmax\(0, 1fr\); padding-top: 16px; \}/);
  assert.match(typography, /\.gallery-page \{ padding-top: 18px; \}/);
  assert.match(typography, /\.daily-page \{ padding-top: 18px; \}/);
  assert.match(typography, /\.benchmark-radar-page \{ padding-top: 22px; \}/);
});
