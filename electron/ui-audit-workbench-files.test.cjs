const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const app = read("src/App.tsx");
const css = read("src/styles.css");
const editor = read("src/FileCodeEditor.tsx");
const i18n = read("src/i18n.tsx");
const settings = read("src/SettingsModal.tsx");

test("workbench and full editor share the tabbed file shell", () => {
  assert.match(app, /className=\{compact \? "artifact-editor-pane compact" : "artifact-editor-pane"\}/);
  assert.match(app, /const tabs = openFiles\.length > 0 \? <Tabs value=\{selectedPath \?\? ""\}/);
  assert.match(app, /className="artifact-workbench artifact-workbench-full"/);
  assert.match(app, /artifact-browser-heading/);
  assert.match(app, /mainSection === "writing" \? t\("Paper writing"\) : t\("Files"\)/);
  assert.match(app, /artifact-workbench-body split/);
  assert.doesNotMatch(app, /className="files-page"/);
  assert.doesNotMatch(app, /Browse the active folder and inspect files created or changed by Archimedes/);
  assert.match(css, /\.artifact-editor-pane\.compact \{ position: relative; \}/);
  assert.match(css, /\.artifact-tabs-row \{[\s\S]*?height: 38px;/);
  assert.match(css, /\.artifact-tabs-row \.artifact-tabs \{[\s\S]*?height: 100%;/);
  assert.doesNotMatch(css, /padding-right: 258px/);
  assert.match(css, /\.artifact-tabs-row \.artifact-workbench-actions \{ margin-left: auto;/);
});

test("file tabs are larger and view actions are plain text", () => {
  assert.match(css, /\.artifact-tab-main \.artifact-tab-name \{[\s\S]*?font-size: 12px;/);
  assert.match(css, /\.artifact-tab \{ min-width: 120px; max-width: 230px; \}/);
  assert.match(css, /\.artifact-editor-header \.artifact-view-toggle \{[\s\S]*?background: transparent/);
  assert.match(css, /\.artifact-editor-header \.artifact-save-button,[\s\S]*?background: transparent; border: 0;/);
  assert.match(css, /\.artifact-tab-close:hover \{[^}]*background: transparent/);
  assert.match(css, /\.artifact-editor-pane\.compact \.artifact-editor-header\.compact \{[\s\S]*?position: absolute;[\s\S]*?background: transparent;/);
  assert.doesNotMatch(app, /artifact-workbench-toolbar/);
  assert.match(app, /fontSize: "13px", lineHeight: 1.65/);
  assert.match(editor, /fontSize: "13px"/);
});

test("comment composer shares the chat surface language", () => {
  assert.match(css, /\.artifact-comment-box \{[\s\S]*?background: var\(--night-panel\);[\s\S]*?border-radius: 10px;/);
  assert.match(css, /\.artifact-comment-box textarea \{[\s\S]*?font-size: 13px;/);
  assert.match(css, /\.artifact-comment-box textarea:focus,[\s\S]*?outline: none;/);
  assert.match(app, /Ask Archimedes about this passage/);
});

test("file icons default to City Lights and still switch to monochrome", () => {
  assert.match(app, /function workspaceFileTone/);
  assert.match(app, /<FileJson size=\{14\} \/>/);
  assert.match(app, /<FileTerminal size=\{14\} \/>/);
  assert.match(app, /<FileImage size=\{14\} \/>/);
  assert.match(app, /<FileCog size=\{14\} \/>/);
  assert.match(app, /workspaceFileIcon\(\{ type: "file", kind: openFile\.kind, path: openFile\.path \}\)/);
  assert.match(app, /className=\{`tree-file-icon tone-\$\{workspaceFileTone\(entry\)\}`\}/);
  assert.match(css, /\.tree-file-icon\.tone-folder \{/);
  assert.match(css, /html\[data-file-icons="monochrome"\] \.tree-file-icon/);
  assert.match(i18n, /export type FileIconStyle = "city-lights" \| "material" \| "seti" \| "monochrome"/);
  assert.match(i18n, /FILE_ICON_STYLE_STORAGE_KEY/);
  assert.match(i18n, /stored === "monochrome" \|\| stored === "material" \|\| stored === "seti"/);
  assert.match(i18n, /document\.documentElement\.dataset\.fileIcons = fileIconStyle/);
  assert.match(settings, /setFileIconStyle\("city-lights"\)/);
  assert.match(settings, /setFileIconStyle\("material"\)/);
  assert.match(settings, /setFileIconStyle\("seti"\)/);
  assert.match(settings, /setFileIconStyle\("monochrome"\)/);
  assert.doesNotMatch(settings, /setFileIconStyle\("colorful"\)/);
  assert.match(css, /html\[data-file-icons="material"\] \{/);
  assert.match(css, /html\[data-file-icons="seti"\] \{/);
});
