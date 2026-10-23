const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const css = fs.readFileSync(path.resolve(__dirname, "..", "src", "styles.css"), "utf8");

function luminance(hex) {
  const value = hex.replace("#", "");
  const channels = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(left, right) {
  const values = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("paper secondary text and workspace switcher use accessible colors", () => {
  assert.match(css, /\.theme-paper \.workspace-copy strong \{ color: #2f2b26; \}/);
  assert.match(css, /\.theme-paper \.workspace-copy small[^}]*\{ color: #6f6a63; \}/);
  assert.match(css, /\.theme-paper \.library-card-copy small[\s\S]*?\.theme-paper \.gallery-header p \{ color: #6f6a63; \}/);
  assert.ok(contrast("#6f6a63", "#fbfaf8") >= 4.5);
  assert.ok(contrast("#2f2b26", "#f6f4f1") >= 4.5);
});

test("paper modal scrim preserves light-theme context", () => {
  assert.match(
    css,
    /html\[data-theme="paper"\] \.modal-backdrop,[\s\S]*?background: rgba\(44, 39, 33, \.34\);/,
  );
  assert.doesNotMatch(css, /html\[data-theme="paper"\] \.modal-backdrop[^}]*rgba\(0, 0, 0, \.88\)/);
});
