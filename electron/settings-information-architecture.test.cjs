const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const registry = read("src", "settings", "registry.tsx");
const modal = read("src", "SettingsModal.tsx");
const workbench = read("src", "settings", "WorkbenchSettingsHub.tsx");
const researchAids = read("src", "settings", "ResearchAidsSettingsHub.tsx");
const workspace = read("src", "settings", "WorkspaceSettingsHub.tsx");
const sessionToolsPanel = read("src", "settings", "SessionToolsSettingsPanel.tsx");
const app = read("src", "App.tsx");
const css = read("src", "styles.css");
const model = read("src", "ModelSettingsModal.tsx");
const backend = read("src", "AgentBackendSettings.tsx");
const picker = read("src", "HarnessPicker.tsx");

let sessionTools;
test.before(async () => {
  const { transformWithOxc } = await import("vite");
  const file = path.join(root, "src", "session-tools.ts");
  const source = fs.readFileSync(file, "utf8");
  const { code } = await transformWithOxc(source, file);
  const runnable = code.replace(/^export /gm, "");
  sessionTools = new Function(`${runnable}\nreturn { DEFAULT_SESSION_TOOL_PREFERENCES, normalizeSessionToolPreferences, readSessionToolPreferences, writeSessionToolPreferences };`)();
});

test("Settings navigation is grouped and keeps only durable modules", () => {
  assert.match(registry, /export type SettingsSectionId =\n  \| "general"/);
  assert.match(registry, /export const SETTINGS_GROUPS/);
  for (const group of ["Personal", "Research", "Connections"]) assert.match(registry, new RegExp(`label: "${group}"`));
  assert.match(registry, /\{ id: "personal", label: "Personal" \}/);
  assert.match(registry, /id: "workbench"[\s\S]*?subviews: \[/);
  assert.match(registry, /id: "research-aids"[\s\S]*?subviews: \[/);
  assert.match(registry, /id: "workspace"[\s\S]*?subviews: \[/);
  for (const retired of ["journey", "proactive", "terminal", "about"]) {
    assert.doesNotMatch(registry, new RegExp(`\\n    id: "${retired}",\\n`));
  }
});

test("legacy settings entry points resolve to their new module and subview", () => {
  assert.match(registry, /journey: \{ section: "workbench", subview: "research-path" \}/);
  assert.match(registry, /terminal: \{ section: "workbench", subview: "terminal" \}/);
  assert.match(registry, /proactive: \{ section: "research-aids", subview: "proactive" \}/);
  assert.match(registry, /members: \{ section: "workspace", subview: "members" \}/);
  assert.match(registry, /export function resolveSettingsLocation/);
  assert.match(modal, /const location = resolveSettingsLocation\(section\);/);
  assert.match(modal, /activeSection\.subviews && <SettingsSubnav/);
  assert.match(read("src", "settings", "SettingsSubnav.tsx"), /event\.key === "ArrowRight"/);
  assert.match(read("src", "settings", "SettingsSubnav.tsx"), /role="tablist"/);
});

test("Workbench owns layout, terminal, and research path settings", () => {
  assert.match(workbench, /<WorkbenchSettingsPanel/);
  assert.match(workbench, /<TerminalSettingsModal/);
  assert.match(workbench, /<JourneySettingsPanel/);
  for (const view of ["layout", "terminal", "research-path"]) assert.match(workbench, new RegExp(`view !== "${view}"`));
  assert.match(workbench, /terminalSettings/);
  assert.match(workbench, /journeySettings/);
});

test("Research aids groups Proactive with comments and snapshots", () => {
  assert.match(researchAids, /<ProactiveSettingsPanel/);
  assert.match(researchAids, /<CommentsSettingsPanel/);
  assert.match(researchAids, /<SnapshotSettingsPanel/);
  for (const view of ["proactive", "comments", "snapshots"]) assert.match(researchAids, new RegExp(`view !== "${view}"`));
  assert.match(sessionToolsPanel, /Show comments button/);
  assert.match(sessionToolsPanel, /Show resolved comments by default/);
  assert.match(sessionToolsPanel, /Show snapshot button/);
  assert.match(sessionToolsPanel, /Default export format/);
  assert.match(sessionToolsPanel, /Include diagnostic events by default/);
});

test("Workspace groups the folder and project members", () => {
  assert.match(workspace, /<ProjectMembersPanel/);
  assert.match(workspace, /view !== "folder"/);
  assert.match(workspace, /view !== "members"/);
  assert.match(workspace, /Current workspace/);
});

test("session tools preferences normalize, persist, and drive the conversation toolbar", () => {
  assert.deepEqual(sessionTools.normalizeSessionToolPreferences({}), sessionTools.DEFAULT_SESSION_TOOL_PREFERENCES);
  const normalized = sessionTools.normalizeSessionToolPreferences({
    showComments: false,
    commentsShowResolved: true,
    showSnapshots: false,
    snapshotFormat: "png",
    snapshotSources: false,
    snapshotDiagnostics: true,
  });
  assert.equal(normalized.showComments, false);
  assert.equal(normalized.commentsShowResolved, true);
  assert.equal(normalized.showSnapshots, false);
  assert.equal(normalized.snapshotFormat, "png");
  assert.equal(normalized.snapshotSources, false);
  assert.equal(normalized.snapshotDiagnostics, true);
  assert.equal(sessionTools.normalizeSessionToolPreferences({ snapshotFormat: "exe" }).snapshotFormat, "md");
  const stored = new Map();
  sessionTools.writeSessionToolPreferences(normalized, { setItem: (key, value) => stored.set(key, value) });
  const restored = sessionTools.readSessionToolPreferences({ getItem: (key) => stored.get(key) });
  assert.deepEqual(restored, normalized);
  assert.match(app, /sessionTools\.showSnapshots && <button/);
  assert.match(app, /sessionTools\.showComments && <button/);
  assert.match(app, /commentsShowResolved=\{sessionTools\.commentsShowResolved\}/);
  assert.match(app, /defaults=\{\{ format: sessionTools\.snapshotFormat/);
});

test("provider and harness marks render without white tiles, and Custom has no icon", () => {
  assert.doesNotMatch(css, /\.provider-icon:has\(\.provider-brand-logo\)[^}]*background:\s*#fff/);
  assert.doesNotMatch(css, /\.provider-brand-tile/);
  assert.match(css, /\.provider-icon \{ display: grid; width: 29px; height: 29px; place-items: center; color: var\(--night-ink-soft\); background: transparent;/);
  assert.match(css, /\.provider-icon\.large \{ width: 38px; height: 38px; color: var\(--night-ink\); background: transparent;/);
  assert.match(css, /\.provider-option\.no-icon \{ grid-template-columns: minmax\(0, 1fr\) 16px; \}/);
  assert.match(css, /html\[data-theme="charcoal"\] \.provider-brand-mono \{ filter: invert\(1\); \}/);
  assert.match(model, /provider-brand-mono/);
  assert.match(backend, /provider-brand-mono/);
  assert.match(picker, /provider-brand-mono/);
  assert.match(model, /id: "custom", name: "Custom", caption: "Any OpenAI-compatible endpoint", baseUrl: "", models: \[\] \}/);
  assert.match(model, /\{item\.icon && <span className="provider-icon">/);
  assert.match(backend, /icons\/openai\.svg/);
  assert.match(picker, /icons\/openai\.svg/);
  for (const file of [model, backend, picker]) assert.doesNotMatch(file, /providers\/openai\.png/);
});
