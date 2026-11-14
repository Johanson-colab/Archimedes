const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { readLocale } = require("./locale-source.cjs");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const app = read("src/App.tsx");
const css = read("src/styles.css");
const i18nSource = read("src/i18n.tsx");
const settings = read("src/settings/AppearanceSettingsPanel.tsx");
const shortcuts = read("src/file-text-size.ts");
const recorder = read("src/ShortcutRecorder.tsx");
const editor = read("src/FileCodeEditor.tsx");
const locale = readLocale();

test("file text size helpers define safe defaults and platform formatting", () => {
  assert.match(shortcuts, /export const FILE_TEXT_SIZE_DEFAULT = 13;/);
  assert.match(shortcuts, /export const FILE_TEXT_SIZE_MIN = 9;/);
  assert.match(shortcuts, /export const FILE_TEXT_SIZE_MAX = 26;/);
  assert.match(shortcuts, /increase: "Mod\+=",/);
  assert.match(shortcuts, /decrease: "Mod\+-",/);
  assert.match(shortcuts, /reset: "Mod\+0",/);
  assert.match(shortcuts, /export function clampFileTextSize/);
  assert.match(shortcuts, /export function shortcutFromEvent/);
  assert.match(shortcuts, /export function formatFileTextShortcut/);
  assert.match(shortcuts, /isMac \? "⌘" : "Ctrl"/);
});

test("UI settings persist the size and the user-recorded shortcuts", () => {
  assert.match(i18nSource, /FILE_TEXT_SIZE_STORAGE_KEY = "archimedes-file-text-size"/);
  assert.match(i18nSource, /FILE_TEXT_SHORTCUTS_STORAGE_KEY = "archimedes-file-text-shortcuts"/);
  assert.match(i18nSource, /readFileTextShortcuts/);
  assert.match(i18nSource, /increaseFileTextSize/);
  assert.match(i18nSource, /decreaseFileTextSize/);
  assert.match(i18nSource, /resetFileTextSize/);
  assert.match(i18nSource, /setFileTextShortcut/);
  assert.match(i18nSource, /resetFileTextShortcuts/);
  assert.match(i18nSource, /window\.localStorage\.setItem\(FILE_TEXT_SIZE_STORAGE_KEY/);
  assert.match(i18nSource, /window\.localStorage\.setItem\(FILE_TEXT_SHORTCUTS_STORAGE_KEY/);
});

test("file previews listen for the bindings and drive one CSS size token", () => {
  assert.match(app, /import \{ shortcutMatches \} from "\.\/file-text-size"/);
  assert.match(app, /shortcutMatches\(event, fileTextShortcuts\.increase\)/);
  assert.match(app, /shortcutMatches\(event, fileTextShortcuts\.decrease\)/);
  assert.match(app, /shortcutMatches\(event, fileTextShortcuts\.reset\)/);
  assert.match(app, /closest\("\.app-dialog, \[role=\\"dialog\\"\]"\)/);
  assert.match(app, /"--file-content-font-size": `\$\{fileTextSize\}px`/);
  assert.match(app, /fontSize: "var\(--file-content-font-size, 13px\)"/);
  assert.match(editor, /fontSize: "var\(--file-content-font-size, 13px\)"/);
  assert.match(css, /\.artifact-code-editor \.cm-editor \{[^}]*font-size: var\(--file-content-font-size, 13px\)/);
  assert.match(css, /\.markdown-preview \{[^}]*font-size: calc\(var\(--file-content-font-size, 13px\) - 1px\)/);
});

test("Settings records three customizable shortcuts and can restore defaults", () => {
  assert.match(settings, /import ShortcutRecorder from "\.\.\/ShortcutRecorder"/);
  assert.match(settings, /fileTextShortcuts/);
  assert.match(settings, /setFileTextShortcut/);
  assert.match(settings, /resetFileTextShortcuts/);
  assert.match(settings, /\["increase", t\("Increase"\)\]/);
  assert.match(settings, /\["decrease", t\("Decrease"\)\]/);
  assert.match(settings, /\["reset", t\("Reset"\)\]/);
  assert.match(recorder, /shortcutFromEvent\(event\)/);
  assert.match(recorder, /event\.key === "Escape"/);
  assert.match(recorder, /formatFileTextShortcut\(value, isMac\)/);
  assert.match(locale, /"Text size shortcuts"/);
  assert.match(locale, /"Reset shortcuts"/);
  assert.match(css, /\.shortcut-recorder\.recording/);
});
