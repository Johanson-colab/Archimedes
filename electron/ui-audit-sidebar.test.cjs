const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "src", "App.tsx"), "utf8");
const sidebar = fs.readFileSync(path.join(root, "src", "ProjectSidebar.tsx"), "utf8");
const extensions = fs.readFileSync(path.join(root, "src", "ExtensionsView.tsx"), "utf8");
const palette = fs.readFileSync(path.join(root, "src", "CommandPalette.tsx"), "utf8");
const registry = fs.readFileSync(path.join(root, "src", "sidebar-registry.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");
const i18n = fs.readFileSync(path.join(root, "src", "i18n.tsx"), "utf8");

test("sidebar keeps Work below stable Knowledge and Create modules", () => {
  const modules = app.indexOf('<nav className="sidebar-nav sidebar-modules"');
  const work = app.indexOf("<ProjectSidebar");
  assert.ok(modules > 0 && work > modules, "Knowledge → Create → Work order");
  assert.match(app, /\["knowledge", "create"\] as const/);
  assert.match(registry, /id: "library"[^\n]*labelKey: "Library"/);
  assert.match(registry, /id: "extensions"[^\n]*labelKey: "Extensions"/);
  assert.match(registry, /id: "writing"[^\n]*labelKey: "Paper writing"/);
  assert.match(registry, /id: "image-creation"[^\n]*labelKey: "Image creation"/);
  assert.doesNotMatch(registry, /id: "gallery"/);
  assert.doesNotMatch(registry, /badge: "Soon"[^\n]*disabled: true/);
  assert.match(app, /sidebarEntries\(section\)\.map/);
});

test("navigation is registry-driven and every entry has a command", () => {
  assert.match(registry, /export type SidebarSection = "knowledge" \| "create"/);
  assert.ok(registry.includes('source?: "core" | `plugin:${string}`'));
  assert.match(registry, /commandId: string/);
  assert.match(registry, /destination: \{ type: "section"; section: MainSection \}/);
  assert.match(app, /sidebarEntries\(section\)/);
  assert.match(app, /flatMap\(\(section\)/);
});

test("Files and Artifacts leave the sidebar but stay command reachable", () => {
  assert.doesNotMatch(app, /<Folder size=\{16\} \/><span>\{t\("Files"\)\}<\/span>/);
  assert.doesNotMatch(app, /workspace-button/);
  assert.doesNotMatch(app, />Choose workspace</);
  assert.match(app, /openWorkbench\("files"\)/);
  assert.match(app, /id: "files", group: t\("Panels"\)/);
  assert.match(app, /id: "terminal", group: t\("Panels"\)/);
});

test("Work rows are text-only with a folded filter and state labels", () => {
  assert.doesNotMatch(sidebar, /project-toggle/);
  assert.doesNotMatch(sidebar, /<Folder size=\{14\}/);
  assert.match(sidebar, /<span className="project-name">\{project\.name\}<\/span>/);
  assert.match(sidebar, /projectThreads\.length > 0 && <small>/);
  assert.match(sidebar, /work-filter-button/);
  assert.match(sidebar, /t\("All work"\)/);
  assert.match(sidebar, /t\("Running"\)/);
  assert.match(sidebar, /t\("Needs review"\)/);
  assert.match(sidebar, /t\("Automations"\)/);
  assert.match(sidebar, /t\("Archived"\)/);
  assert.match(sidebar, /className="work-status running"/);
  assert.match(sidebar, /className="work-status review"/);
  assert.match(sidebar, /thread\.status === "error"\) return "failed"/);
  assert.match(sidebar, /className="work-status failed"/);
});

test("a selected session does not keep its project highlighted", () => {
  assert.match(sidebar, /const isActiveProject = activeProjectId === project\.id && !activeThreadId/);
  assert.match(sidebar, /className=\{isActiveProject \? "project-tree-row active" : "project-tree-row"\}/);
});

test("project overflow actions collapse into one vertical menu", () => {
  assert.match(sidebar, /<MoreVertical size=\{14\} \/>/);
  assert.match(sidebar, /<MenuSurface[\s\S]{0,500}?className="project-more-menu"/);
  assert.match(sidebar, /Change project folder/);
  assert.match(sidebar, /<MenuDivider \/>/);
  assert.match(sidebar, /danger icon=\{<Trash2/);
});

test("Work row typography matches the Knowledge items", () => {
  assert.match(css, /\.work-group \.project-select \.project-name \{ font-size: 14px; font-weight: 400/);
  assert.match(css, /\.work-group \.project-chat-open \{[^}]*font-size: 14px; font-weight: 400/);
  assert.doesNotMatch(css, /\.work-group \.project-chat-open \{[^}]*font-size: 11px/);
});

test("running uses the Journey-style sheen and review keeps an open ring", () => {
  assert.match(css, /@keyframes sidebar-running-sheen/);
  assert.match(css, /animation: sidebar-running-sheen 2\.1s linear infinite/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.work-status\.review i \{[^}]*border-radius: 50%/);
  assert.match(css, /\.work-group \.project-chat-list \{[^}]*border-left: 0/);
});

test("Extensions uses Installed, Available, and Updates with Workbench tabs", () => {
  assert.match(extensions, /Installed/);
  assert.match(extensions, /Available/);
  assert.match(extensions, /Updates/);
  assert.match(extensions, /workbench-tab active/);
  assert.match(extensions, /listExtensions/);
  assert.match(extensions, /previewExtension/);
  assert.match(extensions, /installExtension/);
  assert.match(extensions, /SourceManager/);
  assert.match(app, /<ExtensionsView[^>]*workspace=\{executionWorkspace\}/);
  assert.match(app, /setExtensionsTab\("installed"\)/);
});

test("account chip is global and runtime moves to the composer", () => {
  assert.match(app, /className="sidebar-runtime"/);
  assert.match(app, /<AccountChip authState=\{authState\}/);
  assert.match(app, /className="composer-runtime-switch" aria-label="Runtime location"/);
  assert.match(app, /className="composer-runtime-local"/);
  assert.match(app, /composer-runtime-cloud/);
  assert.match(app, /Cloud runs need an account/);
  assert.match(css, /\.account-chip \{ display: flex;/);
  assert.match(css, /\.composer-runtime-switch \{ display: inline-flex;/);
  assert.doesNotMatch(app, /className="runtime-tabs" role="group"/);
  assert.match(i18n, /"Local": "本地"/);
  assert.match(i18n, /"Cloud": "云端"/);
});

test("search opens a command palette and Ctrl/Cmd+K is wired", () => {
  assert.match(app, /<button className="sidebar-search-button" onClick=\{\(\) => setPaletteOpen\(true\)\}/);
  assert.match(app, /event\.key\.toLowerCase\(\) === "k"/);
  assert.match(app, /<CommandPalette open=\{paletteOpen\}/);
  assert.match(palette, /<Dialog open=\{open\} onClose=\{onClose\}/);
  assert.match(palette, /ariaLabel="Command palette"/);
  assert.match(palette, /event\.key === "ArrowDown"/);
  assert.match(palette, /event\.key === "Enter"/);
});
