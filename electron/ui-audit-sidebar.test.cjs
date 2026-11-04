const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { readLocale } = require("./locale-source.cjs");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "src", "App.tsx"), "utf8");
const sidebar = fs.readFileSync(path.join(root, "src", "ProjectSidebar.tsx"), "utf8");
const extensions = fs.readFileSync(path.join(root, "src", "ExtensionsView.tsx"), "utf8");
const palette = fs.readFileSync(path.join(root, "src", "CommandPalette.tsx"), "utf8");
const registry = fs.readFileSync(path.join(root, "src", "sidebar-registry.tsx"), "utf8");
const pluginRuntime = fs.readFileSync(path.join(root, "src", "plugin-runtime.tsx"), "utf8");
const settingsPanel = fs.readFileSync(path.join(root, "src", "PluginsSettingsPanel.tsx"), "utf8");
const preload = fs.readFileSync(path.join(root, "electron", "preload.cjs"), "utf8");
const main = fs.readFileSync(path.join(root, "electron", "main.cjs"), "utf8");
const css = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");
const i18n = readLocale();

test("sidebar defaults to one flat Micro app section above Work", () => {
  const modules = app.indexOf('<nav className="sidebar-nav sidebar-modules"');
  const work = app.indexOf("<ProjectSidebar");
  assert.ok(modules > 0 && work > modules, "Micro app → Work order");
  assert.match(app, /\["knowledge", "create", "evaluate"\] as const/);
  assert.match(app, /className="sidebar-section-label">\{t\("Micro app"\)\}/);
  assert.match(app, /sidebarLayout === "flat" && <div className="sidebar-module-list">\{flatModuleEntries\.map\(moduleButton\)\}/);
  assert.match(app, /sidebarLayout === "tabs"/);
  assert.match(app, /sidebarLayout === "sections"/);
  assert.match(registry, /id: "library"[^\n]*labelKey: "Library"/);
  assert.match(registry, /id: "extensions"[^\n]*labelKey: "Extensions"/);
  assert.match(registry, /id: "writing"[^\n]*labelKey: "Paper writing"/);
  assert.match(registry, /id: "image-creation"[^\n]*labelKey: "Image creation"/);
  assert.doesNotMatch(registry, /id: "gallery"/);
  assert.doesNotMatch(registry, /badge: "Soon"[^\n]*disabled: true/);
  assert.match(app, /sidebarEntries\(id\)\.filter\(\(entry\) => !entry\.disabled && !hiddenCoreModules\.has\(entry\.id\)\)/);
});

test("navigation is registry-driven and every entry has a command", () => {
  assert.match(registry, /export type SidebarSection = "knowledge" \| "create" \| "evaluate"/);
  assert.ok(registry.includes('source?: "core" | `plugin:${string}`'));
  assert.match(registry, /commandId: string/);
  assert.match(registry, /destination: \{ type: "section"; section: MainSection \}/);
  assert.match(app, /sidebarEntries\(id\)/);
  assert.match(app, /flatModuleEntries/);
});

test("sidebar modules are declared with mount semantics, not scattered conditions", () => {
  assert.match(registry, /icon: LucideIcon/);
  assert.match(registry, /titleKey: string/);
  assert.match(registry, /keepMounted\?: boolean/);
  assert.match(registry, /cacheClass\?: string/);
  assert.match(registry, /requiresWorkspace\?: boolean/);
  assert.doesNotMatch(registry, /icon: </);
  for (const line of registry.split("\n").filter((line) => /^\s*\{ id: "/.test(line))) {
    assert.match(line, /source: "core"/);
  }
  assert.match(app, /Object\.entries\(sidebarModuleContent\)/);
  assert.match(app, /<Suspense fallback=\{null\}>/);
  assert.match(app, /entry\.keepMounted/);
  assert.match(app, /lazy\(\(\) => import\("\.\/LibraryView"\)\)/);
  assert.doesNotMatch(app, /import LibraryView from "\.\/LibraryView"/);
});

test("runtime plugins flow through the same registry projection", () => {
  assert.match(registry, /export function registerPluginEntries/);
  assert.match(registry, /SidebarModuleId \| `plugin:\$\{string\}`/);
  assert.match(registry, /plugin\?: PluginContribution/);
  assert.match(pluginRuntime, /archimedes-plugin:\/\//);
  assert.match(pluginRuntime, /export async function loadSidebarPlugins/);
  assert.match(pluginRuntime, /registerPluginEntries\(entries\)/);
  assert.match(pluginRuntime, /source: `plugin:\$\{record\.id\}`/);
  assert.match(app, /loadSidebarPlugins\(desktopBridge\)/);
  assert.match(app, /PluginModuleView key=\{entry\.id\} entry=\{entry\}/);
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
  assert.match(sidebar, /work-more-button/);
  assert.match(sidebar, /<MenuLabel>\{t\("Filter"\)\}<\/MenuLabel>/);
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

test("sidebar layout modes are switchable from Micro apps settings", () => {
  assert.match(settingsPanel, /t\("Sidebar layout"\)/);
  assert.match(settingsPanel, /\{ value: "flat", label: t\("Flat"\) \}/);
  assert.match(settingsPanel, /\{ value: "tabs", label: t\("Group tabs"\) \}/);
  assert.match(settingsPanel, /\{ value: "sections", label: t\("Group sections"\) \}/);
  assert.match(settingsPanel, /<SettingsChoiceGroup/);
  assert.match(preload, /setSidebarLayout: \(layout\) => ipcRenderer\.invoke\("sidebar:set-layout", \{ layout \}\)/);
  assert.match(main, /sidebar:set-layout/);
  assert.match(app, /setSidebarLayoutMode\(layout\)/);
});

test("section labels match project-row typography and Filter lives in More", () => {
  assert.match(css, /\.sidebar-section-label \{[^}]*font-size: 14px; font-weight: 400/);
  assert.match(css, /\.work-heading \{[^}]*font-size: 14px; font-weight: 400/);
  assert.match(css, /\.sidebar-group-name \{[^}]*font-size: 14px; font-weight: 400/);
  assert.match(css, /\.work-more-button/);
  assert.doesNotMatch(css, /\.work-heading \{[^}]*font-size: 10px/);
  assert.match(sidebar, /<MenuLabel>\{t\("Filter"\)\}<\/MenuLabel>/);
  assert.match(sidebar, /onNewProject\(\)/);
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
