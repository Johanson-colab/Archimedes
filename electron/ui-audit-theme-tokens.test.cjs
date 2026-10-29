const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const tokens = read("src", "tokens.css");
const styles = read("src", "styles.css");
const typography = read("src", "typography.css");
const main = read("src", "main.tsx");
const baseline = JSON.parse(read("scripts", "theme-baseline.json"));

test("tokens.css is the first stylesheet imported", () => {
  const tokenImport = main.indexOf('import "./tokens.css";');
  const styleImport = main.indexOf('import "./styles.css";');
  const typographyImport = main.indexOf('import "./typography.css";');
  assert.ok(tokenImport >= 0);
  assert.ok(tokenImport < styleImport);
  assert.ok(styleImport < typographyImport);
});

test("both themes define the semantic surface layer", () => {
  for (const token of ["--surface-ground", "--surface-panel", "--text-primary", "--border-default", "--accent", "--text-on-accent"]) {
    assert.match(tokens, new RegExp(`${token}\\s*:`));
  }
  assert.match(tokens, /:root\[data-theme="paper"\] \{/);
  assert.match(tokens, /--graphite-950: #141110;/);
  assert.match(tokens, /--paper-50: #faf7f2;/);
});

test("legacy --night-* names are aliases to semantic tokens", () => {
  const aliases = [...tokens.matchAll(/(--night-[\w-]+)\s*:\s*([^;]+);/g)];
  assert.ok(aliases.length >= 17);
  for (const [, name, value] of aliases) {
    assert.match(value.trim(), /^var\(--[\w-]+\)$/, `${name} should alias a semantic token`);
  }
  assert.match(tokens, /--night-ground: var\(--surface-ground\);/);
  assert.match(tokens, /--night-ink: var\(--text-primary\);/);
  assert.match(tokens, /--accent-ink: var\(--text-on-accent\);/);
});

test("theme tokens are not re-declared outside tokens.css", () => {
  for (const [file, source] of [["styles.css", styles], ["typography.css", typography]]) {
    assert.doesNotMatch(source, /(^|\n)\s*--night-[\w-]+\s*:/, `${file} still declares --night-* values`);
    assert.doesNotMatch(source, /(^|\n)\s*--surface-[\w-]+\s*:/, `${file} still declares --surface-* values`);
    assert.doesNotMatch(source, /(^|\n)\s*--mono-[\w-]+\s*:/, `${file} still declares --mono-* values`);
    assert.doesNotMatch(source, /(^|\n)\s*--ui-scale\s*:/, `${file} still declares --ui-scale`);
  }
  assert.doesNotMatch(styles, /:root[^{]*\{[^}]*--[\w-]+\s*:/);
  assert.doesNotMatch(typography, /:root[^{]*\{[^}]*--[\w-]+\s*:/);
});

test("font tokens live in tokens.css", () => {
  assert.match(tokens, /--font-ui: -apple-system/);
  assert.match(tokens, /--font-mono: "SFMono-Regular"/);
  assert.match(tokens, /html\[data-interface-font="geist"\]/);
  assert.match(tokens, /html\[data-mono-font="geist-mono"\]/);
  assert.doesNotMatch(typography, /--font-ui\s*:/);
  assert.doesNotMatch(typography, /--font-mono\s*:/);
});

test("the hardcoded-color baseline is a ratchet", () => {
  assert.equal(baseline.version, 1);
  assert.equal(typeof baseline.files["src/styles.css"], "number");
  assert.equal(typeof baseline.files["src/typography.css"], "number");
});

test("the theme guard passes", () => {
  const result = execFileSync(process.execPath, [path.join(root, "scripts", "check-theme-tokens.mjs")], {
    cwd: root,
    encoding: "utf8",
  });
  assert.match(result, /Theme token checks passed/);
});
