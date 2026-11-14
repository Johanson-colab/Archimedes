const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("About logo preserves the seven Paper blocks without an opaque background", () => {
  const svg = read("src/assets/archimedes-logo-mark.svg");
  assert.match(svg, /viewBox="28 33 208 168" fill="currentColor"/);
  const rectangles = [...svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" rx="3"/g)];
  assert.deepEqual(rectangles.map((match) => match.slice(1).map(Number)), [
    [156, 121, 80, 80], [28, 141, 60, 60], [28, 77, 60, 60],
    [92, 121, 60, 40], [136, 77, 60, 40], [176, 33, 60, 40], [37, 33, 115, 40],
  ]);
  assert.doesNotMatch(svg, /filter|<image|<script|#[0-9a-f]{3,8}/i);
});

test("About logo is decorative next to the existing accessible product name", () => {
  assert.match(read("src/settings/GeneralSettingsPanel.tsx"), /<ArchimedesMark className="settings-about-logo" size=\{88\} decorative \/>\s*<strong>Archimedes<\/strong>/);
});

test("About logo uses the active theme foreground rather than an opaque themed tile", () => {
  const css = read("src/styles.css");
  const rules = [...css.matchAll(/\.settings-about-logo \{([^}]+)\}/g)].map((match) => match[1]);
  assert.ok(rules.length);
  assert.ok(rules.some((rule) => /color: var\(--night-ink\)/.test(rule)), "the logo keeps the theme foreground");
  for (const rule of rules) assert.doesNotMatch(rule, /background|mask/);
  assert.match(read("src/brand/ArchimedesMark.tsx"), /fill="currentColor"/);
  assert.match(read("src/brand/ArchimedesMark.tsx"), /<feDropShadow/);
  assert.match(read("src/tokens.css"), /--night-ink: var\(--text-primary\)/);
});
