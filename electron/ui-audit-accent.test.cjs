const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const css = fs.readFileSync(path.resolve(__dirname, "..", "src", "styles.css"), "utf8");

function palette(selector) {
  const match = css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `missing ${selector}`);
  return Object.fromEntries([...match[1].matchAll(/--([\w-]+):\s*([^;]+);/g)].map((item) => [item[1], item[2].trim()]));
}

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

test("paper and charcoal have one readable primary accent", () => {
  const charcoal = palette(":root");
  const paper = palette(':root[data-theme="paper"]');
  assert.equal(paper.accent, "#8a5a24");
  assert.equal(paper["accent-ink"], "#ffffff");
  assert.equal(charcoal.accent, "#c9a227");
  assert.equal(charcoal["accent-ink"], "#111111");
  assert.ok(contrast(paper["accent-ink"], paper.accent) >= 4.5);
  assert.ok(contrast(charcoal["accent-ink"], charcoal.accent) >= 4.5);
});

test("primary actions share accent, control height and focus tokens", () => {
  assert.match(css, /\.primary-button \{[^}]*min-height: var\(--control-height\)/);
  assert.match(css, /\.primary-button \{[^}]*background: var\(--accent\)/);
  assert.match(css, /button:focus-visible[^{]*\{ outline: 2px solid var\(--focus-ring\)/);
  assert.match(css, /\.primary-button:disabled[\s\S]*?opacity: \.45/);
  assert.match(css, /\.daily-topic-filter button \{[^}]*border-radius: var\(--radius-control\)/);
});
