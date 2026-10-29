const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const modal = read("src", "SettingsModal.tsx");
const proactive = read("src", "ProactiveSettingsPanel.tsx");
const web = read("src", "WebSearchSettingsModal.tsx");
const terminal = read("src", "TerminalSettingsModal.tsx");
const css = read("src", "styles.css");

test("settings chrome drops the decorative marks", () => {
  assert.doesNotMatch(modal, /SettingsMark/);
  assert.doesNotMatch(css, /\.settings-mark\b/);
  assert.match(modal, /<div className="settings-brand"><div><strong>Archimedes<\/strong>/);
  assert.match(modal, /className="settings-about"/);
  assert.doesNotMatch(modal, /settings-about[\s\S]{0,120}<svg/);
});

test("proactive, web, and terminal use the shared settings page language", () => {
  assert.match(modal, /const embedded = section === "models" \|\| section === "proactive-model";/);
  for (const panel of [proactive, web, terminal]) assert.match(panel, /className="settings-sections"/);
  assert.match(proactive, /className="settings-section-title"/);
  assert.match(proactive, /className="settings-group"/);
  assert.match(proactive, /className="settings-row/);
  assert.doesNotMatch(proactive, /proactive-settings-hero|proactive-settings-section|proactive-mode-grid/);
  assert.match(web, /className="settings-select"/);
  assert.match(web, /className="settings-form-actions"/);
  assert.match(terminal, /settings-inline-control/);
  assert.match(terminal, /className="settings-form-actions"/);
});

test("shared settings action row is styled once", () => {
  assert.match(css, /\.settings-form-actions \{/);
  assert.match(css, /\.settings-text-input-wide \{ width: 100%; \}/);
  assert.match(css, /\.settings-inline-control \{/);
});
