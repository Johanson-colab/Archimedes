#!/usr/bin/env node
/**
 * Theme token guard.
 *
 * Fails when the token architecture is bypassed:
 * - tokens.css must be imported before styles.css
 * - both themes must define the core semantic tokens
 * - legacy --night-* names must be aliases, not literal values
 * - theme tokens must not be re-declared outside tokens.css
 * - hardcoded colors must not exceed the recorded baseline
 *
 * The baseline is a ratchet, not a target: lower it when a migration lands.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "");
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/g;

const errors = [];
const notes = [];

function check(condition, message) {
  if (!condition) errors.push(message);
}

function extractBlock(source, selector) {
  const pattern = new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{`);
  const match = pattern.exec(source);
  if (!match) return "";
  const open = source.indexOf("{", match.index);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  return "";
}

const tokens = stripComments(read("src/tokens.css"));
const styles = stripComments(read("src/styles.css"));
const typography = stripComments(read("src/typography.css"));
const app = read("src/main.tsx");

/* 1. Import order ---------------------------------------------------------- */
const tokenImport = app.indexOf('import "./tokens.css";');
const styleImport = app.indexOf('import "./styles.css";');
check(tokenImport >= 0, "main.tsx must import ./tokens.css");
check(styleImport >= 0, "main.tsx must import ./styles.css");
check(tokenImport >= 0 && styleImport >= 0 && tokenImport < styleImport, "tokens.css must be imported before styles.css");

/* 2. Semantic tokens per theme -------------------------------------------- */
const requiredEverywhere = [
  "--surface-ground", "--surface-canvas", "--surface-sidebar", "--surface-panel",
  "--surface-raised", "--surface-soft", "--surface-control",
  "--border-default", "--border-soft", "--border-strong",
  "--text-primary", "--text-secondary", "--text-muted", "--text-faint",
  "--text-on-accent", "--accent", "--accent-hover", "--focus-ring",
  "--state-success", "--state-warning", "--state-danger", "--state-info",
];
const charcoal = extractBlock(tokens, ":root");
const paper = extractBlock(tokens, ':root[data-theme="paper"]');
check(Boolean(charcoal), "tokens.css is missing the :root block");
check(Boolean(paper), 'tokens.css is missing the :root[data-theme="paper"] block');

for (const token of requiredEverywhere) {
  check(new RegExp(`${token}\\s*:`).test(charcoal), `charcoal theme is missing ${token}`);
}
for (const token of ["--surface-ground", "--surface-panel", "--text-primary", "--border-default", "--accent", "--text-on-accent"]) {
  check(new RegExp(`${token}\\s*:`).test(paper), `paper theme is missing ${token}`);
}

/* 3. Legacy aliases resolve to semantic tokens ----------------------------- */
const nightDeclarations = [...tokens.matchAll(/(--night-[\w-]+)\s*:\s*([^;]+);/g)];
check(nightDeclarations.length >= 17, "expected the legacy --night-* aliases in tokens.css");
for (const [, name, value] of nightDeclarations) {
  check(/^var\(--[\w-]+\)$/.test(value.trim()), `${name} must alias a semantic token, found "${value.trim()}"`);
}

/* 4. No theme tokens outside tokens.css ------------------------------------ */
const exact = new Set([
  "--accent", "--accent-ink", "--accent-hover", "--accent-subtle", "--accent-strong",
  "--selected", "--selected-row", "--focus-ring", "--resizer-accent",
  "--font-ui", "--font-mono", "--ui-scale", "--context-usage-color",
]);
const prefixes = [
  "--night-", "--surface-", "--border-", "--mono-", "--rail-", "--chat-send-",
  "--code-", "--scrollbar-", "--turn-rail-", "--text-primary", "--text-secondary",
  "--text-muted", "--text-faint", "--text-on-accent",
  "--presentation-", "--review-", "--welcome-", "--reading-", "--sb-", "--work-",
];
const forbidden = (prop) => exact.has(prop) || prefixes.some((prefix) => prop.startsWith(prefix));

for (const [file, source] of [["src/styles.css", styles], ["src/typography.css", typography]]) {
  for (const match of source.matchAll(/^\s*(--[\w-]+)\s*:/gm)) {
    if (forbidden(match[1])) {
      const line = source.slice(0, match.index).split("\n").length;
      errors.push(`${file}:${line} re-declares theme token ${match[1]} outside tokens.css`);
    }
  }
}

/* 5. Hardcoded color ratchet ---------------------------------------------- */
const baseline = JSON.parse(read("scripts/theme-baseline.json"));
for (const file of ["src/styles.css", "src/typography.css"]) {
  const clean = file === "src/styles.css" ? styles : typography;
  const count = (clean.match(COLOR_LITERAL) || []).length;
  const limit = baseline.files[file];
  check(Number.isFinite(limit), `theme-baseline.json is missing a limit for ${file}`);
  check(count <= limit, `${file} has ${count} hardcoded colors, above the baseline of ${limit}. Use a token in tokens.css.`);
  if (count < limit) notes.push(`${file} is below baseline (${count} < ${limit}); lower scripts/theme-baseline.json.`);
}

/* 6. Report ---------------------------------------------------------------- */
if (errors.length) {
  console.error("Theme token checks failed:\n");
  for (const error of errors) console.error(`  ✖ ${error}`);
  console.error("");
  process.exit(1);
}

console.log("Theme token checks passed");
console.log("  ✓ tokens.css imported before styles.css");
console.log(`  ✓ ${requiredEverywhere.length} semantic tokens in both themes`);
console.log(`  ✓ ${nightDeclarations.length} legacy --night-* aliases resolve to semantic tokens`);
console.log("  ✓ no theme token re-declarations outside tokens.css");
for (const file of ["src/styles.css", "src/typography.css"]) {
  const clean = file === "src/styles.css" ? styles : typography;
  const count = (clean.match(COLOR_LITERAL) || []).length;
  console.log(`  ✓ ${file} hardcoded colors ${count}/${baseline.files[file]}`);
}
for (const note of notes) console.log(`  · ${note}`);
