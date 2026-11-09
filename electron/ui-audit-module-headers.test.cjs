const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "src", "App.tsx"), "utf8");
const paper = fs.readFileSync(path.join(root, "src", "PaperWritingView.tsx"), "utf8");
const imageCreation = fs.readFileSync(path.join(root, "src", "ImageCreationView.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");
const benchmark = fs.readFileSync(path.join(root, "src", "BenchmarkRadarView.tsx"), "utf8");
const library = fs.readFileSync(path.join(root, "src", "LibraryView.tsx"), "utf8");
const workspace = fs.readFileSync(path.join(root, "src", "LibraryWorkspace.tsx"), "utf8");
const workspaceCss = fs.readFileSync(path.join(root, "src", "library-workspace.css"), "utf8");
const typography = fs.readFileSync(path.join(root, "src", "typography.css"), "utf8");
const extensions = fs.readFileSync(path.join(root, "src", "ExtensionsView.tsx"), "utf8");

test("module actions share the main toolbar slot", () => {
  assert.match(app, /id="module-toolbar-actions" className="module-toolbar-actions"/);
  assert.match(app, /<PaperWritingView[^>]*active=\{mainSection === "writing"\}/);
  assert.doesNotMatch(paper, /ToolbarActions/);
  assert.match(paper, /className="paper-pane-actions"/);
  assert.match(paper, /paper-pane-action/);
  assert.doesNotMatch(imageCreation, /ToolbarActions/);
  assert.match(imageCreation, /className="image-creation-actions"/);
  assert.match(benchmark, /<ToolbarActions>/);
});

test("module-specific title headers are removed", () => {
  assert.doesNotMatch(paper, /className="paper-writing-header"/);
  assert.doesNotMatch(imageCreation, /className="gallery-header"/);
  assert.match(imageCreation, /className="image-creation-tabs"/);
  assert.doesNotMatch(benchmark, /className="benchmark-header"/);
  assert.match(library, /className="library-page daily-page">\s*<div className="daily-feed-toolbar/);
});

test("library actions live on the library canvas while extensions stay headerless", () => {
  assert.doesNotMatch(library, /Knowledge base<\/span><h1>Literature library/);
  assert.doesNotMatch(library, /Curated research directions/);
  assert.doesNotMatch(library, /ToolbarActions/);
  assert.match(workspace, /className="library-workspace-actions"/);
  assert.match(workspace, /library-workspace-actions[\s\S]{0,750}syncLibraries/);
  assert.match(workspace, /library-workspace-actions[\s\S]{0,850}Import paper/);
  assert.match(workspace, /setEditor\("new"\)/);
  assert.match(workspaceCss, /\.library-workspace-actions \{[^}]*align-items: center/);
  assert.doesNotMatch(extensions, /extensions-heading/);
  assert.doesNotMatch(extensions, /Everything that changes what the Agent can do/);
});

test("folder browsing keeps search and filters in a compact toolbar", () => {
  assert.doesNotMatch(library, /className="library-detail-title"/);
  assert.doesNotMatch(library, /<span className="eyebrow">Literature library<\/span>/);
  assert.doesNotMatch(library, /library-detail-header[\s\S]{0,400}<h1/);
  assert.doesNotMatch(library, /className="library-description"/);
  assert.doesNotMatch(library, /library-detail-header[\s\S]{0,600}<LibraryGlyph/);
  assert.match(workspace, /className="library-browser-toolbar"/);
  assert.match(workspace, /library-browser-toolbar[\s\S]{0,350}className="library-browser-search"/);
  assert.match(workspace, /className="library-browser-filters"/);
  assert.match(workspaceCss, /\.library-browser-toolbar \{[^}]*flex-wrap: wrap/);
});

test("the toolbar uses one title line and no module subtitle", () => {
  assert.doesNotMatch(app, /mainSubtitle/);
  assert.doesNotMatch(app, /Live research feed/);
  assert.doesNotMatch(app, /Benchmark intelligence/);
  assert.match(app, /<SessionSwitcher/);
});

test("removing the second header reclaims vertical space", () => {
  assert.match(typography, /\.paper-writing-page \{ grid-template-rows: minmax\(0, 1fr\); padding-top: 0; \}/);
  assert.match(css, /\.paper-writing-page \{[^}]*padding: 0;[^}]*\}/);
  assert.match(css, /\.paper-writing-workspace \{[^}]*margin-top: 0;[^}]*border: 0;[^}]*border-radius: 0;[^}]*box-shadow: none;[^}]*\}/);
  assert.match(css, /\.image-creation-page \{[\s\S]*?padding: 18px/);
  assert.match(typography, /\.daily-page \{ padding-top: 18px; \}/);
  assert.match(typography, /\.benchmark-radar-page \{ padding-top: 22px; \}/);
});
