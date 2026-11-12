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

test("sidebar is one Research Apps list above Work with a management entry", () => {
  const modules = app.indexOf('<nav className="sidebar-nav sidebar-modules"');
  const work = app.indexOf("<ProjectSidebar");
  assert.ok(modules > 0 && work > modules, "Research Apps → Work order");
  assert.ok(app.includes('t("Research Apps")'));
  assert.ok(app.includes('aria-label={t("Manage Research Apps")}'));
  assert.ok(app.includes('{flatModuleEntries.map(moduleButton)}'));
  assert.ok(!app.includes("sidebarLayout"), "obsolete layout preferences cannot change navigation");
  for (const id of ["library", "extensions", "writing", "image-creation"]) {
    assert.ok(registry.includes(`id: "${id}"`), `${id} remains registered`);
  }
  assert.ok(!registry.includes('id: "gallery"'));
  assert.ok(app.includes('sidebarEntries().filter((entry) => !entry.disabled && !hiddenCoreModules.has(entry.id))'));
});

test("navigation is registry-driven and every entry has a command", () => {
  assert.match(registry, /export type SidebarSection = "knowledge" \| "create" \| "evaluate"/);
  assert.ok(registry.includes('source?: "core" | `plugin:${string}`'));
  assert.match(registry, /commandId: string/);
  assert.match(registry, /destination: \{ type: "section"; section: MainSection \}/);
  assert.ok(app.includes("sidebarEntries()"));
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

test("Projects lists workspaces and exposes New project directly without filters", () => {
  assert.doesNotMatch(sidebar, /project-toggle/);
  assert.doesNotMatch(sidebar, /<Folder size=\{14\}/);
  assert.match(sidebar, /<span className="project-name">\{project\.name\}<\/span>/);
  assert.match(sidebar, /t\("Projects"\)/);
  assert.match(sidebar, /projectWorkspaces\.length > 0 && <small>/);
  assert.match(sidebar, /onNewWorkspace\(project\.id\)/);
  assert.match(sidebar, /<Plus size=\{13\} \/>/);
  assert.match(sidebar, /projectWorkspaces\.map\(\(workspace\)/);
  assert.match(sidebar, /workspaceName\(workspace, t\)/);
  assert.doesNotMatch(sidebar, /projectThreads\.map/);
  assert.doesNotMatch(sidebar, /onOpenThread|onArchiveThread|onRemoveThread/);
  assert.match(sidebar, /className="work-new-project" onClick=\{onNewProject\} title=\{t\("New project"\)\}/);
  assert.doesNotMatch(sidebar, /work-more-button|filterOpen|filterOptions|WorkFilter/);
  assert.match(sidebar, /t\("Archived projects"\)/);
  assert.match(sidebar, /onArchiveProject\(project, false\)/);
  assert.match(sidebar, /aria-expanded=\{showArchivedProjects\}/);
});

test("Research Apps settings groups apps into categories without a layout selector", () => {
  assert.ok(!settingsPanel.includes("SettingsChoiceGroup"));
  assert.ok(!settingsPanel.includes("sidebarLayout"));
  assert.ok(settingsPanel.includes("researchAppCategories.map"));
  assert.ok(settingsPanel.includes("entry.researchCategory === category.id"));
  assert.ok(settingsPanel.includes("researchAppCategory(record) === category.id"));
  // Old clients keep a harmless IPC endpoint while current UI has no layout control.
  assert.match(preload, /setSidebarLayout: \(layout\) => ipcRenderer\.invoke\("sidebar:set-layout", \{ layout \}\)/);
  assert.match(main, /sidebar:set-layout/);
});

test("section labels match project-row typography and New project is a direct icon action", () => {
  assert.match(css, /\.sidebar-section-label \{[^}]*font-size: 14px; font-weight: 400/);
  assert.match(css, /\.work-heading \{[^}]*font-size: 14px; font-weight: 400/);
  assert.match(css, /\.work-new-project/);
  assert.doesNotMatch(css, /\.work-filter-menu|\.work-filter-option/);
  assert.doesNotMatch(css, /\.work-heading \{[^}]*font-size: 10px/);
  assert.doesNotMatch(sidebar, /More work actions|t\("Filter"\)/);
  assert.match(sidebar, /onClick=\{onNewProject\}/);
});

test("only the selected workspace is highlighted, not its parent project", () => {
  assert.match(sidebar, /<div className="project-tree-row">/);
  assert.doesNotMatch(sidebar, /isActiveProject|project-tree-row active/);
  assert.match(sidebar, /activeWorkspaceId === workspace\.id \? "project-chat-row active"/);
  assert.doesNotMatch(css, /\.project-tree-row\.active/);
});

test("project overflow actions collapse into one vertical menu", () => {
  assert.match(sidebar, /<MoreVertical size=\{14\} \/>/);
  assert.match(sidebar, /<MenuSurface[\s\S]{0,500}?className="project-more-menu"/);
  assert.match(sidebar, /Change project folder/);
  assert.match(sidebar, /<MenuDivider \/>/);
  assert.match(sidebar, /danger icon=\{<Trash/);
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

test("account chip is global and the composer drops duplicate runtime controls", () => {
  const settings = app.indexOf('className="codex-nav-item sidebar-settings-entry"');
  assert.ok(settings > app.indexOf('className="new-task-button"') && settings < app.indexOf('<nav className="sidebar-nav sidebar-modules"'), "Settings is above Research Apps and Projects");
  assert.ok(!app.slice(app.indexOf('<div className="sidebar-runtime"'), app.indexOf('<div className="sidebar-resizer"')).includes('aria-label={t("Settings")}'), "footer contains account access only");
  assert.match(app, /className="sidebar-runtime"/);
  assert.match(app, /<AccountChip authState=\{authState\}/);
  assert.doesNotMatch(app, /composer-runtime-switch|composer-runtime-local|composer-runtime-cloud|cloud-gate/);
  assert.doesNotMatch(app, /thread-visibility-trigger/);
  assert.match(css, /\.account-chip \{ display: flex;/);
  assert.doesNotMatch(css, /\.composer-runtime-switch|\.cloud-gate|\.thread-visibility-trigger/);
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
