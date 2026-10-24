const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const main = fs.readFileSync(path.join(root, "src", "main.tsx"), "utf8");
const typography = fs.readFileSync(path.join(root, "src", "typography.css"), "utf8");

test("warm type layer loads after the layout stylesheet", () => {
  assert.match(main, /import "\.\/styles\.css";\s*import "\.\/typography\.css";/);
});

test("charcoal uses warm neutral surfaces and ink", () => {
  assert.match(typography, /--night-ground: #141110/);
  assert.match(typography, /--night-sidebar: #1b1816/);
  assert.match(typography, /--night-panel: #211e1c/);
  assert.match(typography, /--night-ink: #eae8e6/);
  assert.match(typography, /--night-muted: #a5a09c/);
  assert.match(typography, /html:not\(\[data-theme="paper"\]\) \.main-toolbar \{ background: #141110/);
});

test("paper keeps a warm light palette", () => {
  assert.match(typography, /:root\[data-theme="paper"\] \{[\s\S]*?--night-ground: #faf7f2/);
  assert.match(typography, /--night-sidebar: #f4f0e9/);
  assert.match(typography, /--night-ink: #2c2826/);
  assert.match(typography, /\.theme-paper \.main-toolbar \{ background: rgba\(255, 253, 248, \.96\)/);
});

test("primary UI text moves to a 14px/15px scale", () => {
  assert.match(typography, /\.codex-nav-item \{ font-size: 14px/);
  assert.match(typography, /\.conversation-title strong \{ font-size: 14px/);
  assert.match(typography, /\.message-markdown \{ font-size: 15px; line-height: 1\.68/);
  assert.match(typography, /\.conversation-composer textarea \{ font-size: 14px/);
});

test("conversation and projects share one readable scale", () => {
  assert.match(typography, /\.message-markdown p,\s*\.conversation-message p \{ font-size: 15px; \}/);
  assert.match(typography, /\.conversation-message-role \{ font-size: 11px; \}/);
  assert.match(typography, /\.conversation-sources a \{ font-size: 11px; \}/);
  assert.match(typography, /\.project-select span \{ font-size: 13px; \}/);
  assert.match(typography, /\.project-chat-open \{ font-size: 12px; line-height: 1\.4; \}/);
  assert.match(typography, /\.project-select small \{ font-size: 11px; \}/);
  assert.match(typography, /\.nav-count \{ font-size: 11px; \}/);
});

test("reading and settings surfaces use a clearer hierarchy", () => {
  assert.match(typography, /\.paper-inspector-title h2 \{ font-size: 24px/);
  assert.match(typography, /\.paper-abstract \{ font-size: 14px; line-height: 1\.65/);
  assert.match(typography, /\.library-card-copy strong \{ font-size: 16px/);
  assert.match(typography, /\.settings-header h2 \{ font-size: 24px/);
  assert.match(typography, /\.settings-nav-item \{ height: 34px; font-size: 13px/);
});

test("settings metadata no longer drops to 8-9px", () => {
  assert.match(typography, /\.settings-version \{ font-size: 11px; \}/);
  assert.match(typography, /\.settings-card-heading strong \{ font-size: 14px/);
  assert.match(typography, /\.settings-card-heading p \{ font-size: 12px/);
  assert.match(typography, /\.settings-field \{ font-size: 12px; \}/);
  assert.match(typography, /\.provider-option small \{ font-size: 11px; \}/);
  assert.match(typography, /\.model-catalog-header \{ font-size: 11px; \}/);
  assert.match(typography, /\.terminal-settings-field \{ font-size: 12px; \}/);
  assert.match(typography, /\.terminal-settings-field small \{ font-size: 11px; \}/);
  assert.match(typography, /\.terminal-settings-actions \.primary-button,[\s\S]*?font-size: 12px/);
  assert.match(typography, /\.settings-workspace-path \{ font-size: 11px; \}/);
  assert.match(typography, /\.settings-about dd \{ font-size: 11px; \}/);
});

test("right workbench metadata moves above the 10px floor", () => {
  assert.match(typography, /\.workbench-tab \{ font-size: 12px/);
  assert.match(typography, /\.journey-goal p \{ font-size: 13px/);
  assert.match(typography, /\.journey-progress-meta \{ font-size: 11px; \}/);
  assert.match(typography, /\.journey-phase small \{ font-size: 11px; \}/);
  assert.match(typography, /\.journey-signals span \{ font-size: 11px; \}/);
  assert.match(typography, /\.journey-note \{ font-size: 12px/);
  assert.match(typography, /\.trajectory-stat span,\s*\.trajectory-section-title \{ font-size: 11px; \}/);
  assert.match(typography, /\.trajectory-event-copy small,\s*\.trajectory-event-time,\s*\.trajectory-event-meta \{ font-size: 11px; \}/);
  assert.match(typography, /\.trajectory-json \{ font-size: 11px/);
});

test("mono and editorial surfaces follow the selected font tokens", () => {
  assert.match(typography, /\.paper-page-controls strong,[\s\S]*?\.paper-zoom-control > \.paper-zoom-readout,[\s\S]*?font-family: var\(--font-mono\)/);
  assert.match(typography, /\.trajectory-event-copy small,[\s\S]*?\.trajectory-json,[\s\S]*?font-family: var\(--font-mono\)/);
  assert.match(typography, /\.research-welcome-copy h1,[\s\S]*?\.research-workflow-copy strong,[\s\S]*?\.research-stage-node \{[\s\S]*?font-family: var\(--font-ui\)/);
});

test("code terminal and trace text keeps an 11px floor", () => {
  const block = typography.match(/\/\* Code, terminal, and trace text keeps an 11px floor\. \*\/([\s\S]*?)\r?\n\r?\n/);
  assert.ok(block, "mono floor block is missing");
  for (const selector of [
    ".paper-code-file-content pre",
    ".paper-code-readme",
    ".trajectory-event-copy small",
    ".trajectory-event-meta code",
    ".latex-diagnostics pre",
    ".paper-ai-markdown code",
    ".artifact-comment-box pre",
  ]) {
    assert.ok(block[1].includes(selector), `${selector} is missing from the mono floor`);
  }
  assert.match(block[1], /font-size: 11px/);
  assert.match(typography, /\.codebase-editor pre,[\s\S]*?\.paper-ai-compose textarea \{[\s\S]*?font-size: 12px/);
});

test("Geist Sans and Geist Mono are bundled locally", () => {
  const settings = fs.readFileSync(path.join(root, "src", "SettingsModal.tsx"), "utf8");
  const i18n = fs.readFileSync(path.join(root, "src", "i18n.tsx"), "utf8");
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(root, "src", "App.tsx"), "utf8");
  const library = fs.readFileSync(path.join(root, "src", "LibraryView.tsx"), "utf8");
  const editor = fs.readFileSync(path.join(root, "src", "ArtifactCodeEditor.tsx"), "utf8");

  assert.ok(fs.existsSync(path.join(root, "src", "assets", "fonts", "Geist-Variable.woff2")));
  assert.ok(fs.existsSync(path.join(root, "src", "assets", "fonts", "GeistMono-Variable.woff2")));
  assert.ok(fs.existsSync(path.join(root, "src", "assets", "fonts", "OFL.txt")));
  assert.match(typography, /@font-face \{[\s\S]*?font-family: "Geist"/);
  assert.match(typography, /Geist-Variable\.woff2/);
  assert.match(typography, /@font-face \{[\s\S]*?font-family: "Geist Mono"/);
  assert.match(typography, /GeistMono-Variable\.woff2/);
  assert.match(typography, /html\[data-interface-font="geist"\] \{[\s\S]*?--font-ui: "Geist"/);
  assert.match(typography, /html\[data-mono-font="geist-mono"\] \{[\s\S]*?--font-mono: "Geist Mono"/);
  assert.match(i18n, /return window\.localStorage\.getItem\(INTERFACE_FONT_STORAGE_KEY\) === "system" \? "system" : "geist"/);
  assert.match(i18n, /return window\.localStorage\.getItem\(MONO_FONT_STORAGE_KEY\) === "system" \? "system" : "geist-mono"/);
  assert.match(i18n, /document\.documentElement\.dataset\.interfaceFont = interfaceFont/);
  assert.match(settings, /t\("Interface font"\)/);
  assert.match(settings, /t\("Code font"\)/);
  assert.match(settings, /setInterfaceFont/);
  assert.match(settings, /setMonoFont/);
  assert.match(index, /dataset\.interfaceFont =/);
  assert.match(app, /fontFamily: "var\(--font-mono\)"/);
  assert.match(library, /fontFamily: "var\(--font-mono\)"/);
  assert.match(editor, /fontFamily: "var\(--font-mono\)"/);
});
