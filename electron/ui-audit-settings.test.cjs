const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "src", "App.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");
const settings = fs.readFileSync(path.join(root, "src", "SettingsModal.tsx"), "utf8");
const i18n = fs.readFileSync(path.join(root, "src", "i18n.tsx"), "utf8");
const main = fs.readFileSync(path.join(root, "src", "main.tsx"), "utf8");
const model = fs.readFileSync(path.join(root, "src", "ModelSettingsModal.tsx"), "utf8");
const web = fs.readFileSync(path.join(root, "src", "WebSearchSettingsModal.tsx"), "utf8");
const terminal = fs.readFileSync(path.join(root, "src", "TerminalSettingsModal.tsx"), "utf8");

test("global settings is a single dialog with app-level sections", () => {
  assert.match(app, /<SettingsModal/);
  assert.match(settings, /type SettingsSection = "general" \| "journey" \| "appearance" \| "models" \| "web" \| "terminal" \| "workspace" \| "about"/);
  assert.match(settings, /className="settings-modal"/);
  assert.match(settings, /settings-nav/);
  assert.match(settings, /t\("General"\)/);
  assert.match(settings, /t\("Appearance"\)/);
  assert.match(settings, /t\("Models"\)/);
  assert.match(settings, /t\("Web search"\)/);
  assert.match(settings, /t\("Terminal"\)/);
  assert.match(settings, /t\("Workspace"\)/);
  assert.match(settings, /t\("About"\)/);
  assert.match(css, /\.settings-modal \{[^}]*grid-template-columns: 256px minmax\(0, 1fr\)/);
});

test("settings entry is a small quiet icon next to the workspace", () => {
  assert.match(app, /className="sidebar-settings-button"/);
  assert.match(app, /<Settings size=\{15\} strokeWidth=\{1\.7\}/);
  assert.match(app, /event\.key !== ","/);
  assert.doesNotMatch(app, /theme-switcher/);
  assert.match(css, /\.sidebar-settings-button \{ display: grid; width: 26px; height: 26px/);
});

test("model and web configuration live in settings instead of the toolbar", () => {
  assert.doesNotMatch(app, /model-provider-button/);
  assert.doesNotMatch(app, /Web search settings/);
  assert.doesNotMatch(app, /<ModelSettingsModal/);
  assert.doesNotMatch(app, /<WebSearchSettingsModal/);
  assert.match(settings, /<ModelSettingsModal bridge=\{bridge\} open embedded/);
  assert.match(settings, /<WebSearchSettingsModal bridge=\{bridge\} open embedded/);
  assert.match(model, /embedded = false/);
  assert.match(web, /embedded = false/);
  assert.match(terminal, /embedded = false/);
});

test("language can switch between English and Chinese with English as default", () => {
  assert.match(main, /<UISettingsProvider>/);
  assert.match(i18n, /export type Language = "en" \| "zh"/);
  assert.match(i18n, /return window\.localStorage\.getItem\(LANGUAGE_STORAGE_KEY\) === "zh" \? "zh" : "en"/);
  assert.match(i18n, /document\.documentElement\.lang = language === "zh" \? "zh-CN" : "en"/);
  assert.match(settings, /<option value="en">English<\/option>/);
  assert.match(settings, /<option value="zh">简体中文<\/option>/);
  assert.match(i18n, /"Settings": "设置"/);
  assert.match(i18n, /"Literature library": "文献库"/);
});

test("text size has five steps behind a horizontal slider", () => {
  assert.match(i18n, /export type TextSize = "smaller" \| "small" \| "default" \| "large" \| "larger"/);
  assert.match(settings, /\{ id: "smaller", label: "Smaller", scale: 1 \}/);
  assert.match(settings, /\{ id: "small", label: "Small", scale: 1\.05 \}/);
  assert.match(settings, /\{ id: "default", label: "Default", scale: 1\.1 \}/);
  assert.match(settings, /\{ id: "large", label: "Large", scale: 1\.15 \}/);
  assert.match(settings, /\{ id: "larger", label: "Larger", scale: 1\.2 \}/);
  assert.match(settings, /type="range"[\s\S]*?max=\{textSizeSteps\.length - 1\}/);
  assert.match(settings, /--settings-slider-progress/);
  assert.match(settings, /settings-slider-scale/);
  assert.match(css, /html\[data-ui-zoom="css"\]\[data-text-size="smaller"\] \{ --ui-scale: 1; \}/);
  assert.match(css, /html\[data-ui-zoom="css"\]\[data-text-size="small"\] \{ --ui-scale: 1\.05; \}/);
  assert.match(css, /html\[data-ui-zoom="css"\]\[data-text-size="default"\] \{ --ui-scale: 1\.1; \}/);
  assert.match(css, /html\[data-ui-zoom="css"\]\[data-text-size="large"\] \{ --ui-scale: 1\.15; \}/);
  assert.match(css, /html\[data-ui-zoom="css"\]\[data-text-size="larger"\] \{ --ui-scale: 1\.2; \}/);
  assert.match(i18n, /const TEXT_SCALE: Record<TextSize, number> = \{ smaller: 1, small: 1\.05, default: 1\.1, large: 1\.15, larger: 1\.2 \};/);
  assert.match(css, /\.codex-shell \{[^}]*zoom: var\(--ui-scale, 1\)/);
  assert.match(i18n, /root\.dataset\.uiZoom = "native"/);
  assert.match(fs.readFileSync(path.join(root, "electron", "preload.cjs"), "utf8"), /setUiZoom: \(factor\) => ipcRenderer\.invoke\("window:set-ui-zoom", factor\)/);
});

test("settings use flat grouped lists instead of per-item cards", () => {
  assert.match(settings, /className="settings-section"/);
  assert.match(settings, /className="settings-group"/);
  assert.match(settings, /className="settings-row"/);
  assert.match(settings, /className="settings-row-copy"/);
  assert.match(settings, /settings-row-stacked/);
  assert.doesNotMatch(settings, /settings-card/);
  assert.match(css, /\.settings-group \{[^}]*box-shadow: inset 0 0 0 1px var\(--night-line-soft\)/);
  assert.match(css, /\.settings-row \+ \.settings-row \{ border-top: 1px solid var\(--night-line-soft\); \}/);
  assert.match(css, /\.settings-content \{ width: 100%; max-width: 720px; \}/);
  assert.match(css, /\.settings-nav-item\.active \{/);
});

test("chat verbosity follows the opencode low / medium / high model", () => {
  assert.match(i18n, /export type ChatVerbosity = "low" \| "medium" \| "high"/);
  assert.match(i18n, /const CHAT_VERBOSITY_STORAGE_KEY = "archimedes-chat-verbosity"/);
  assert.match(i18n, /function readChatVerbosity\(\): ChatVerbosity \{[\s\S]*?return "medium"/);
  assert.match(i18n, /document\.documentElement\.dataset\.chatVerbosity = chatVerbosity/);
  assert.match(settings, /\{ id: "low", label: "Low", description: "Summary only" \}/);
  assert.match(settings, /\{ id: "medium", label: "Medium", description: "Grouped steps" \}/);
  assert.match(settings, /\{ id: "high", label: "High", description: "Full detail" \}/);
  assert.match(settings, /t\("Chat verbosity"\)/);
  assert.match(settings, /setChatVerbosity\(item\.id\)/);
});

test("settings support dark and paper themes", () => {
  assert.match(css, /\.settings-modal \{[^}]*color: var\(--night-ink\); background: var\(--night-ground\)/);
  assert.match(css, /\.settings-group \{[^}]*background: var\(--night-panel\)/);
  assert.match(css, /\.settings-nav-item\.active \{ color: var\(--night-ink\)/);
  assert.match(css, /\.theme-paper \.sidebar-settings-button/);
});

