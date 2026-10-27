const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const app = read("src/App.tsx");
const css = read("src/styles.css");
const editor = read("src/ArtifactCodeEditor.tsx");
const i18n = read("src/i18n.tsx");
const settings = read("src/SettingsModal.tsx");

test("compact Files keeps tabs and view actions on one row", () => {
  assert.match(app, /compact \? "artifact-editor-pane compact"/);
  assert.match(app, /\(compact \|\| openFiles\.length > 1\) && <div className="artifact-tabs"/);
  assert.match(css, /\.artifact-editor-pane\.compact \{ position: relative; \}/);
  assert.match(css, /\.artifact-editor-pane\.compact \.artifact-tabs \{ min-height: 38px; padding-right: 258px; \}/);
  assert.match(css, /\.artifact-editor-header\.compact \{[\s\S]*?position: absolute;/);
});

test("view actions are plain text and code defaults are larger", () => {
  assert.match(css, /\.artifact-editor-header\.compact \.artifact-view-toggle \{[\s\S]*?background: transparent/);
  assert.match(css, /\.artifact-editor-header\.compact \.artifact-save-button,[\s\S]*?background: transparent !important/);
  assert.match(app, /fontSize: "13px", lineHeight: 1.65/);
  assert.match(editor, /fontSize: "13px"/);
});

test("file icons have tones and a monochrome setting", () => {
  assert.match(app, /function workspaceFileTone/);
  assert.match(app, /<FileJson size=\{14\} \/>/);
  assert.match(app, /<FileTerminal size=\{14\} \/>/);
  assert.match(app, /<FileImage size=\{14\} \/>/);
  assert.match(app, /<FileCog size=\{14\} \/>/);
  assert.match(app, /workspaceFileIcon\(\{ type: "file", kind: openFile\.kind, path: openFile\.path \}\)/);
  assert.match(app, /className=\{`tree-file-icon tone-\$\{workspaceFileTone\(entry\)\}`\}/);
  assert.match(css, /\.tree-file-icon\.tone-folder \{/);
  assert.match(css, /html\[data-file-icons="monochrome"\] \.tree-file-icon/);
  assert.match(i18n, /FILE_ICON_STYLE_STORAGE_KEY/);
  assert.match(i18n, /document\.documentElement\.dataset\.fileIcons = fileIconStyle/);
  assert.match(settings, /setFileIconStyle\("colorful"\)/);
  assert.match(settings, /setFileIconStyle\("monochrome"\)/);
});
