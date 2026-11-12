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
  assert.match(read("src/SettingsModal.tsx"), /section === "about"[\s\S]*?<span className="settings-about-logo" aria-hidden="true" \/>\s*<strong>Archimedes<\/strong>/);
});

test("About logo uses the active theme foreground rather than an opaque themed tile", () => {
  const css = read("src/styles.css");
  const rule = css.match(/\.settings-about-logo \{([^}]+)\}/)?.[1];
  assert.ok(rule);
  assert.match(rule, /color: var\(--night-ink\)/);
  assert.match(rule, /background-color: currentColor/);
  assert.match(rule, /mask: url\("\.\/assets\/archimedes-logo-mark.svg"\) center \/ contain no-repeat/);
  assert.match(read("src/tokens.css"), /--night-ink: var\(--text-primary\)/);
});
