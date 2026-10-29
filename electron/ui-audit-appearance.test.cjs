const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const app = read("src", "App.tsx");
const settings = read("src", "SettingsModal.tsx");
const appearance = read("src", "appearance.ts");
const i18n = read("src", "i18n.tsx");
const css = read("src", "styles.css");

test("the app owns appearance instead of a single theme key", () => {
  assert.match(app, /import \{ applyAppearance, readAppearance, resolveTheme, writeAppearance/);
  assert.match(app, /useState<AppearanceSettings>\(readAppearance\)/);
  assert.match(app, /const theme = resolveTheme\(appearance\.preset, systemAppearance\)/);
  assert.match(app, /applyAppearance\(document\.documentElement, appearance, theme\)/);
  assert.match(app, /writeAppearance\(appearance\)/);
  assert.doesNotMatch(app, /readThemePreference/);
  assert.doesNotMatch(app, /localStorage\.setItem\("archimedes-theme"/);
});

test("the appearance model persists v2 and migrates the legacy key", () => {
  assert.match(appearance, /archimedes-appearance-v2/);
  assert.match(appearance, /archimedes-theme/);
  assert.match(appearance, /normalizeAppearance/);
  assert.match(appearance, /accentTokens/);
  assert.match(appearance, /radiusTokens/);
  assert.match(appearance, /APPEARANCE_VARIABLES/);
  assert.match(appearance, /color-mix\(in oklab/);
});

test("Settings > Appearance exposes accent, surface, density, radius, and reset controls", () => {
  assert.match(settings, /type="color"/);
  assert.match(settings, /value=\{accentValue\}/);
  assert.match(settings, /value=\{surfaceValue\}/);
  assert.match(settings, /type="range"/);
  assert.match(settings, /min=\{CONTROL_RADIUS_MIN\}/);
  assert.match(settings, /min=\{SURFACE_DEPTH_MIN\}/);
  assert.match(settings, /updateOverride\(\{ accent: event\.target\.value \}\)/);
  assert.match(settings, /updateOverride\(\{ surface: event\.target\.value \}\)/);
  assert.match(settings, /updateOverride\(\{ density: id \}\)/);
  assert.match(settings, /updateOverride\(\{ controlRadius: Number\(event\.target\.value\) \}\)/);
  assert.match(settings, /Reset custom theme/);
  assert.match(settings, /onAppearanceChange/);
});

test("the appearance editor includes a live preview that uses the same tokens", () => {
  assert.match(settings, /appearance-preview/);
  assert.match(settings, /className="appearance-preview-rail"/);
  assert.match(settings, /className="appearance-preview-button primary"/);
  assert.match(css, /\.appearance-preview \{[^}]*background: var\(--surface-ground\)/);
  assert.match(css, /\.appearance-preview-section \{[^}]*position: sticky/);
  assert.match(css, /\.appearance-preview-button\.primary \{[^}]*background: var\(--accent\)/);
});

test("the new appearance copy is translated", () => {
  for (const key of [
    "Customize",
    "Accent color",
    "Used for primary actions, focus rings, and highlights.",
    "Surface color",
    "Derives the ground, panel, borders, and readable text for the whole shell.",
    "Surface depth",
    "How far panels and borders step away from the base surface.",
    "Density",
    "Spacing for controls, settings rows, and navigation.",
    "Compact",
    "Comfortable",
    "Spacious",
    "Control radius",
    "Corner radius for buttons, inputs, and controls.",
    "Custom theme",
    "Accent, surface, density, and radius apply to both Charcoal and Paper.",
    "Reset custom theme",
    "Reset",
    "Live preview",
    "Ready",
    "A quieter research surface",
    "Accent, surface, density, and radius update here immediately.",
    "Open library",
    "Uses the current accent, surface, density, and radius. Changes apply live.",
  ]) {
    assert.match(i18n, new RegExp(`"${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}":`));
  }
});

test("custom appearance controls use tokens", () => {
  assert.match(css, /\.settings-color-input \{[^}]*border: 1px solid var\(--border-default\)/);
  assert.match(css, /\.settings-range-input \{[^}]*accent-color: var\(--accent\)/);
  assert.match(css, /\.settings-value \{[^}]*color: var\(--text-muted\)/);
});
