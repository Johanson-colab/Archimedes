const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const terminal = read("src", "TerminalPanel.tsx");
const css = read("src", "styles.css");

test("charcoal terminal uses the workbench surface colour", () => {
  assert.match(terminal, /const CHARCOAL_TERMINAL_THEME: ITheme = \{[\s\S]*?background: "#181513"/);
  assert.match(terminal, /cursorAccent: "#181513"/);
  assert.doesNotMatch(terminal, /background: "#0b0d13"/);
  assert.match(css, /html:not\(\[data-theme="paper"\]\) \.smart-terminal,\s*html:not\(\[data-theme="paper"\]\) \.terminal-surfaces \{[\s\S]*?background: #181513;/);
  assert.match(css, /html:not\(\[data-theme="paper"\]\) \.smart-terminal-tabs \{[\s\S]*?background: var\(--surface-ground\);/);
});

test("paper terminal theme is left intact", () => {
  assert.match(terminal, /background: "#f8f8f6"/);
  assert.doesNotMatch(css, /\.theme-paper \.smart-terminal[^}]*#181513/);
});
