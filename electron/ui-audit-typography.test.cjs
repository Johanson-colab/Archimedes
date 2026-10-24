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

test("reading and settings surfaces use a clearer hierarchy", () => {
  assert.match(typography, /\.paper-inspector-title h2 \{ font-size: 24px/);
  assert.match(typography, /\.paper-abstract \{ font-size: 14px; line-height: 1\.65/);
  assert.match(typography, /\.library-card-copy strong \{ font-size: 16px/);
  assert.match(typography, /\.settings-header h2 \{ font-size: 24px/);
  assert.match(typography, /\.settings-nav-item \{ height: 34px; font-size: 12px/);
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
