#!/usr/bin/env node
/**
 * M1b codemod: replace theme-scoped hardcoded colors with semantic tokens.
 *
 * A replacement is only made when:
 * - the declaration is a single hex color (no gradients, rgb(), or var())
 * - the rule is scoped to one theme, and the token resolves to the same color
 *   in that theme
 * - the token name matches the property (background → surface, color → text,
 *   border → border) and the component token fits the selector
 *
 * Base rules (applying to both themes) are only migrated when the token has the
 * same value in both themes (state colors), so the codemod can never change the
 * rendered palette.
 *
 * Usage:
 *   node scripts/codemod-theme-colors.mjs           # dry run
 *   node scripts/codemod-theme-colors.mjs --write   # apply
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const write = process.argv.includes("--write");
const stylesPath = path.join(root, "src", "styles.css");
const tokensPath = path.join(root, "src", "tokens.css");

const tokenRoot = postcss.parse(fs.readFileSync(tokensPath, "utf8"));
const blocks = { charcoal: "", paper: "", darkOverrides: "" };
for (const rule of tokenRoot.nodes.filter((node) => node.type === "rule")) {
  const selector = rule.selector.trim();
  if (selector === ":root") blocks.charcoal += rule.toString();
  if (selector === ':root[data-theme="paper"]') blocks.paper += rule.toString();
  if (selector === 'html:not([data-theme="paper"])') blocks.darkOverrides += rule.toString();
}

function declarations(css) {
  const values = {};
  postcss.parse(css).walkDecls((decl) => {
    if (decl.prop.startsWith("--")) values[decl.prop] = decl.value.trim();
  });
  return values;
}

function resolve(values) {
  const resolved = {};
  for (const [name, value] of Object.entries(values)) {
    let current = value;
    for (let depth = 0; depth < 10; depth += 1) {
      const alias = current.match(/^var\((--[\w-]+)\)$/);
      if (!alias || !values[alias[1]]) break;
      current = values[alias[1]];
    }
    resolved[name] = current;
  }
  return resolved;
}

const charcoalValues = { ...declarations(blocks.charcoal), ...declarations(blocks.darkOverrides) };
const paperValues = { ...declarations(blocks.charcoal), ...declarations(blocks.paper) };
const charcoal = resolve(charcoalValues);
const paper = resolve(paperValues);

const normalize = (hex) => {
  let value = hex.slice(1).toLowerCase();
  if (value.length === 3) value = value.split("").map((part) => part + part).join("");
  if (value.length === 8) value = value.slice(0, 6);
  return `#${value}`;
};

const EXCLUDE = /^--(night-|graphite-|paper-|amber-|workbench-ground$|accent-ink$)/;
const groupOf = (token) => {
  if (token.startsWith("--surface-")) return "surface";
  if (token.startsWith("--border-")) return "border";
  if (token.startsWith("--text-")) return "text";
  if (token.startsWith("--accent") || token === "--focus-ring" || token === "--resizer-accent") return "accent";
  if (token.startsWith("--state-")) return "state";
  if (token === "--selected" || token === "--selected-row") return "selected";
  return "component";
};

const PREFERENCE = {
  background: ["surface", "selected", "state", "accent", "component"],
  color: ["text", "state", "accent", "selected", "component"],
  border: ["border", "state", "accent", "component"],
  outline: ["border", "accent", "state", "component"],
  fill: ["text", "accent", "state", "component"],
  stroke: ["text", "accent", "state", "component"],
};

const COMPONENT_SCOPE = {
  "--code-": /(message-code-block|code-preview|codebase-source|artifact-code|latex-|json-token|\btoken\b|cm-|syntax)/i,
  "--rail-": /(trajectory|workspace-tree|files-|file-tree|artifact-browser)/i,
  "--chat-send-": /(conversation-send|composer-send|send-button|chat-send)/i,
  "--file-tone-": /(file|tree)/i,
  "--turn-rail-": /turn-rail/i,
  "--scrollbar-": /scrollbar/i,
};

const COMPONENT_PROPERTY = {
  background: /^--(mono-surface|mono-canvas|mono-sidebar|mono-control|rail-row-hover-bg|rail-row-active-bg|chat-send-bg|chat-send-disabled-bg|code-bg|scrollbar-thumb|selected)/,
  color: /^--(mono-text|rail-row-ink|rail-row-muted|chat-send-ink|chat-send-disabled-ink|code-(fg|comment|keyword|string|number|function|operator|punctuation|line-number)|file-tone)/,
  border: /^--(mono-border|code-border|rail-row)/,
  outline: /^--(mono-border|code-border|rail-row|focus-ring|accent)/,
  fill: /^--(mono-text|rail-row-ink|file-tone|code-)/,
  stroke: /^--(mono-text|rail-row-ink|file-tone|code-)/,
};

const STATE_SCOPE = /(success|error|fail|warn|danger|saved|unsaved|running|status|complete|dot|badge|indicator)/i;

function componentFits(token, selectors, property) {
  if (groupOf(token) !== "component") return true;
  const propertyPattern = COMPONENT_PROPERTY[property];
  if (!propertyPattern || !propertyPattern.test(token)) return false;
  for (const [prefix, pattern] of Object.entries(COMPONENT_SCOPE)) {
    if (token.startsWith(prefix)) return selectors.every((selector) => pattern.test(selector));
  }
  return true;
}

function stateFits(token, selectors) {
  if (!token.startsWith("--state-")) return true;
  return selectors.every((selector) => STATE_SCOPE.test(selector));
}

function buildValueMap(values) {
  const map = {};
  for (const [token, value] of Object.entries(values)) {
    if (EXCLUDE.test(token)) continue;
    if (!/^#[0-9a-f]{6}$/i.test(value)) continue;
    (map[normalize(value)] ??= []).push(token);
  }
  return map;
}

const charcoalMap = buildValueMap(charcoal);
const paperMap = buildValueMap(paper);
const sharedMap = {};
for (const [hex, tokens] of Object.entries(charcoalMap)) {
  const same = (paperMap[hex] || []).filter((token) => tokens.includes(token));
  if (same.length) sharedMap[hex] = same;
}

function pick(map, property, hex, selectors) {
  const order = PREFERENCE[property];
  if (!order) return null;
  const candidates = (map[hex] || []).filter((token) => componentFits(token, selectors, property) && stateFits(token, selectors));
  if (!candidates.length) return null;
  for (const group of order) {
    for (const token of candidates) {
      if (groupOf(token) === group) return token;
    }
  }
  return null;
}

const stylesRoot = postcss.parse(fs.readFileSync(stylesPath, "utf8"));
const changes = [];
const skipped = { base: 0, component: 0, noToken: 0 };

stylesRoot.walkDecls((decl) => {
  if (decl.prop.startsWith("--")) return;
  const value = decl.value.trim();
  if (!/^#[0-9a-fA-F]{3,8}$/.test(value)) return;
  const rule = decl.parent;
  if (rule.type !== "rule") return;
  const selectors = rule.selectors || [rule.selector];
  const isDark = selectors.every((selector) => selector.includes('html:not([data-theme="paper"])'));
  const isPaper = !isDark && selectors.every((selector) => selector.includes(".theme-paper") || /html\[data-theme="paper"\]/.test(selector));
  const context = isPaper ? "paper" : isDark ? "charcoal" : "base";
  if (context === "base") {
    skipped.base += 1;
    return;
  }
  const property = decl.prop.startsWith("border") ? "border" : decl.prop.startsWith("outline") ? "outline" : decl.prop;
  const map = context === "paper" ? paperMap : charcoalMap;
  const token = pick(map, property, normalize(value), selectors);
  if (!token) {
    skipped.noToken += 1;
    return;
  }
  changes.push({ decl, before: decl.value, token, context, selector: rule.selector.replace(/\s+/g, " ").slice(0, 90) });
  decl.value = `var(${token})`;
});

const byToken = {};
for (const change of changes) {
  const key = `${change.token} | ${change.decl.prop}`;
  byToken[key] = (byToken[key] || 0) + 1;
}

console.log(`Theme color codemod (${write ? "write" : "dry run"})`);
console.log(`  replacements: ${changes.length}`);
console.log(`  skipped base rules: ${skipped.base}`);
console.log(`  skipped without token: ${skipped.noToken}\n`);
for (const [key, count] of Object.entries(byToken).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(4)}  ${key}`);
}
if (!write) {
  const listAll = process.argv.includes("--list");
  console.log(listAll ? "\nReplacements:" : "\nSample replacements:");
  for (const change of changes.slice(0, listAll ? changes.length : 20)) {
    console.log(`  ${change.context} ${change.decl.prop}: ${change.before} -> var(${change.token})  [${change.selector}]`);
  }
  console.log("\nRe-run with --write to apply.");
  process.exit(0);
}

fs.writeFileSync(stylesPath, stylesRoot.toString());
console.log(`\nWrote ${changes.length} replacements to src/styles.css`);
