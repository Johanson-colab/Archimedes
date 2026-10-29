#!/usr/bin/env node
/**
 * Theme token audit.
 *
 * Reports how much of the interface still uses hardcoded colors, how many
 * tokens exist, and the most repeated values outside tokens.css. The output is
 * guidance for the incremental migration described in docs/theme-tokens.md.
 *
 * Usage:
 *   node scripts/theme-audit.mjs
 *   node scripts/theme-audit.mjs --json
 *   node scripts/theme-audit.mjs --top 20
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const asJson = args.includes("--json");
const topIndex = args.indexOf("--top");
const topLimit = topIndex >= 0 ? Math.max(1, Number(args[topIndex + 1]) || 12) : 12;

const FILES = ["src/tokens.css", "src/styles.css", "src/typography.css"];
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/g;
const HEX_LITERAL = /#[0-9a-fA-F]{3,8}\b/g;
const VAR_USAGE = /var\(--[\w-]+/g;
const TOKEN_DECL = /^\s*(--[\w-]+)\s*:\s*([^;]+);/gm;

const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "");

function read(file) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const clean = stripComments(source);
  return {
    file,
    lines: source.split("\n").length,
    colors: (clean.match(COLOR_LITERAL) || []).length,
    hex: (clean.match(HEX_LITERAL) || []).length,
    vars: (clean.match(VAR_USAGE) || []).length,
    tokens: [...clean.matchAll(TOKEN_DECL)].map((match) => match[1]),
  };
}

function repeatedColors(file) {
  const source = stripComments(fs.readFileSync(path.join(root, file), "utf8"));
  const counts = new Map();
  for (const match of source.matchAll(COLOR_LITERAL)) {
    const value = match[0].replace(/\s+/g, "").toLowerCase();
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, topLimit);
}

const reports = FILES.map(read);
const outside = reports.filter((report) => report.file !== "src/tokens.css");
const hardcodedOutside = outside.reduce((total, report) => total + report.colors, 0);
const repeated = outside
  .flatMap((report) => repeatedColors(report.file).map(([value, count]) => ({ value, count, file: report.file })))
  .sort((a, b) => b.count - a.count);

if (asJson) {
  console.log(JSON.stringify({
    files: reports,
    hardcodedOutsideTokens: hardcodedOutside,
    topColors: repeated,
  }, null, 2));
  process.exit(0);
}

console.log("Theme audit\n");
for (const report of reports) {
  console.log(
    `  ${report.file.padEnd(20)} ${String(report.lines).padStart(5)} lines  ` +
    `${String(report.colors).padStart(5)} colors  ` +
    `${String(report.tokens.length).padStart(4)} token decls  ` +
    `${String(report.vars).padStart(5)} var() uses`,
  );
}
console.log(`\n  Hardcoded colors outside tokens.css: ${hardcodedOutside}`);
console.log(`  Migration target: 0 outside tokens.css (see docs/theme-tokens.md)\n`);

console.log(`Top repeated colors outside tokens.css (top ${topLimit}):`);
for (const entry of repeated.slice(0, topLimit)) {
  console.log(`  ${entry.value.padEnd(28)} ${String(entry.count).padStart(4)}  ${entry.file}`);
}
