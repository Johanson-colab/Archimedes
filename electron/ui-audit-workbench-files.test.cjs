const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { readLocale } = require("./locale-source.cjs");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const app = read("src/App.tsx");
const css = read("src/styles.css");
const editor = read("src/FileCodeEditor.tsx");
const i18n = readLocale();
const i18nSource = read("src/i18n.tsx");
const settings = read("src/SettingsModal.tsx");

test("workbench and full editor share the tabbed file shell", () => {
  assert.match(app, /className=\{compact \? "artifact-editor-pane compact" : "artifact-editor-pane"\}/);
  assert.match(app, /const tabs = openFiles\.length > 0 \? <div ref=\{tabsRef\} className="artifact-tabs"/);
  assert.match(app, /className="artifact-workbench artifact-workbench-full"/);
  assert.match(app, /artifact-browser-heading/);
  assert.match(app, /activeModule \? t\(activeModule\.titleKey\) : t\("Files"\)/);
  assert.match(read("src/sidebar-registry.tsx"), /id: "writing"[^\n]*titleKey: "Paper writing"/);
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
  assert.match(app, /fontSize: "var\(--file-content-font-size, 13px\)", lineHeight: 1\.65/);
  assert.match(editor, /fontSize: "var\(--file-content-font-size, 13px\)"/);
});

test("comment composer shares the chat surface language", () => {
  assert.match(css, /\.artifact-comment-box \{[\s\S]*?background: var\(--night-panel\);[\s\S]*?border-radius: 10px;/);
  assert.match(css, /\.artifact-comment-box textarea \{[\s\S]*?font-size: 13px;/);
  assert.match(css, /\.artifact-comment-box textarea:focus,[\s\S]*?outline: none;/);
  assert.match(app, /Ask Archimedes about this passage/);
});

test("file icons default to the real OpenCode sprite and switch across styles", () => {
  assert.match(app, /function workspaceFileTone/);
  assert.match(app, /function workspaceFileGlyphLabel/);
  assert.match(app, /function workspaceFileGlyphSvg/);
  assert.match(app, /function WorkspaceFileGlyph/);
  assert.match(app, /chooseIconName\(entry\.path/);
  assert.match(app, /ensureOpenCodeSprite/);
  assert.match(app, /<FileJson size=\{14\} \/>/);
  assert.match(app, /<FileTerminal size=\{14\} \/>/);
  assert.match(app, /<FileImage size=\{14\} \/>/);
  assert.match(app, /<FileCog size=\{14\} \/>/);
  assert.match(app, /className=\{`tree-file-icon tone-\$\{workspaceFileTone\(entry\)\}`\}/);
  assert.match(app, /className=\{`workspace-tree-row\$\{isDirectory \? " is-directory" : ""\}/);
  assert.match(app, /<WorkspaceFileGlyph entry=\{entry\} expanded=\{isExpanded\} \/>/);
  assert.match(css, /\.tree-file-icon \.file-glyph-image/);
  assert.match(css, /html\[data-file-icons="opencode"\] \.tree-file-icon\.tone-folder/);
  assert.match(css, /html\[data-file-icons="opencode"\] \.workspace-tree-row\.is-directory/);
  assert.match(css, /html\[data-file-icons="opencode"\] \.workspace-tree-row\.is-directory \.tree-file-icon \{[^}]*display: none;/);
  assert.match(css, /html\[data-file-icons="outline"\] \.tree-file-icon:not\(\.tone-folder\) \.file-glyph-text/);
  assert.match(css, /html\[data-file-icons="minimal"\] \.workspace-tree-row/);
  assert.match(css, /html\[data-file-icons="material"\] \{/);
  assert.match(css, /html\[data-file-icons="seti"\] \{/);

  const sprite = read("src/assets/file-icons/opencode-sprite.svg");
  assert.match(sprite, /<symbol[^>]+id="Javascript"/);
  assert.match(sprite, /<symbol[^>]+id="Markdown"/);
  assert.match(read("src/file-icons/opencode/sprite.ts"), /opencode-sprite\.svg\?raw/);
  assert.match(read("src/file-icons/opencode/choose-icon-name.ts"), /export function chooseIconName/);
  assert.ok(fs.existsSync(path.join(root, "src", "file-icons", "opencode", "LICENSE.opencode")));

  assert.match(i18nSource, /export type FileIconStyle = "opencode" \| "city-lights" \| "material" \| "seti" \| "outline" \| "monochrome" \| "minimal"/);
  assert.match(i18nSource, /FILE_ICON_STYLE_STORAGE_KEY/);
  assert.match(i18nSource, /FILE_ICON_STYLE_VERSION_KEY/);
  assert.match(i18nSource, /stored === "city-lights" \|\| stored === "monochrome" \|\| stored === "material"/);
  assert.match(i18nSource, /document\.documentElement\.dataset\.fileIcons = fileIconStyle/);
  assert.match(settings, /onChange=\{setFileIconStyle\}/);
  assert.match(settings, /value: "opencode"/);
  assert.match(settings, /value: "city-lights"/);
  assert.match(settings, /value: "material"/);
  assert.match(settings, /value: "seti"/);
  assert.match(settings, /value: "outline"/);
  assert.match(settings, /value: "monochrome"/);
  assert.match(settings, /value: "minimal"/);
  assert.doesNotMatch(settings, /setFileIconStyle\("colorful"\)/);
});

test("the full Files view keeps the conversation title and a compact tab-strip return action", () => {
  assert.match(app, /onRestore\?: \(\) => void/);
  assert.match(app, /mainSection === "chat" \|\| mainSection === "files"/);
  assert.match(app, /activeThread\?\.title \?\? t\("New research task"\)/);
  assert.match(app, /artifact-tabs-row artifact-tabs-row-full/);
  assert.match(app, /artifact-tabs-restore/);
  assert.match(app, /Restore to workbench/);
  assert.match(app, /onRestore=\{\(\) => \{ setMainSection\("chat"\); openWorkbench\("files"\); \}\}/);
  assert.doesNotMatch(app, /artifact-workbench-full-shell/);
  assert.doesNotMatch(app, /artifact-workbench-return-bar/);
  assert.match(css, /\.artifact-tabs-row-full/);
  assert.match(css, /\.artifact-tabs-restore/);
});

test("file tabs hide their scrollbar until hover and map wheel to horizontal scroll", () => {
  assert.match(app, /addEventListener\("wheel", handleWheel, \{ passive: false \}\)/);
  assert.match(app, /element\.scrollLeft \+= event\.deltaY/);
  assert.match(css, /\.artifact-tabs:hover::-webkit-scrollbar-thumb/);
  assert.match(css, /\.artifact-tabs \{[^}]*scrollbar-color: transparent transparent;/);
});

test("Files preview surfaces and the terminal viewport share the conversation canvas", () => {
  assert.match(css, /\.artifact-workbench-body \.artifact-preview-surface,[\s\S]*?background: var\(--mono-canvas\)/);
  assert.match(css, /\.artifact-workbench-body \.code-preview > pre \{[^}]*background: transparent/);
  assert.match(css, /\.artifact-tabs-row \{[^}]*background: var\(--mono-canvas\)/);
  assert.match(css, /\.terminal-surface \.xterm \.xterm-viewport \{[^}]*background-color: transparent/);
});
