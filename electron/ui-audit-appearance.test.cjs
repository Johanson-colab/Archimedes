const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const app = read("src", "App.tsx");
const settings = read("src", "SettingsModal.tsx");
const appearance = read("src", "appearance.ts");
const library = read("src", "LibraryView.tsx");
const writing = read("src", "PaperWritingView.tsx");
const agent = read("src", "AgentLayer.tsx");
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
  assert.match(settings, /updateGlobalOverride\(\{ density: id \}\)/);
  assert.match(settings, /updateGlobalOverride\(\{ controlRadius: Number\(event\.target\.value\) \}\)/);
  assert.match(settings, /Reset custom theme/);
  assert.match(settings, /onAppearanceChange/);
});

test("accent and surface can be scoped to reader, writing, and agent", () => {
  assert.match(library, /data-surface="reader"/);
  assert.match(writing, /data-surface="writing"/);
  assert.match(agent, /data-surface="agent"/);
  assert.match(settings, /t\("Apply to"\)/);
  assert.match(settings, /setScope\(id\)/);
  assert.match(settings, /accentResetDisabled/);
  assert.match(settings, /clearScope/);
  assert.match(appearance, /surfaceCss/);
  assert.match(appearance, /\[data-surface="\$\{scope\}"\]/);
});

test("the appearance editor has no live preview section", () => {
  assert.doesNotMatch(settings, /appearance-preview/);
  assert.doesNotMatch(settings, /Live preview/);
  assert.doesNotMatch(css, /\.appearance-preview/);
  assert.doesNotMatch(i18n, /"Live preview"/);
});

test("the Style section maps button, dialog, shape, and shadow presets", () => {
  assert.match(settings, /t\("Button style"\)/);
  assert.match(settings, /t\("Dialog style"\)/);
  assert.match(settings, /t\("Shape"\)/);
  assert.match(settings, /t\("Shadow"\)/);
  assert.match(settings, /updateStyles\(\{ button: id \}\)/);
  assert.match(settings, /updateStyles\(\{ dialog: id \}\)/);
  assert.match(settings, /updateStyles\(\{ shape: id \}\)/);
  assert.match(settings, /updateStyles\(\{ shadow: id \}\)/);
  assert.match(appearance, /export function styleTokens/);
  assert.match(appearance, /export type AppearanceStyles/);
});

test("appearance can be exported, imported, and checked for contrast", () => {
  assert.match(settings, /toThemePack\(appearance/);
  assert.match(settings, /parseThemePack\(JSON\.parse/);
  assert.match(settings, /type="file"/);
  assert.match(settings, /\.archtheme\.json/);
  assert.match(settings, /Apply pack/);
  assert.match(settings, /contrastIssues\(appearance, theme\)/);
  assert.match(settings, /settings-contrast-warning/);
  assert.match(appearance, /export type ThemePack/);
  assert.match(appearance, /export function parseThemePack/);
  assert.match(appearance, /export function contrastIssues/);
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
    "Apply to",
    "Global",
    "Agent",
    "Accent and surface can be scoped; density and radius stay global.",
    "Reset this surface",
    "Contrast warning",
    "Style",
    "Button style",
    "Fill, border, and hover treatment for primary and secondary buttons.",
    "Dialog style",
    "Elevation and surface treatment for dialogs and menus.",
    "Shape",
    "Corner radius across buttons and dialogs.",
    "Shadow",
    "Depth for buttons and dialogs.",
    "Solid",
    "Soft",
    "Outline style",
    "Ghost",
    "Elevated",
    "Flat",
    "Outlined",
    "Glass",
    "Sharp",
    "Rounded",
    "None",
    "Subtle",
    "Deep",
    "Dialog",
    "Apply",
    "Theme pack",
    "Share this appearance",
    "Export the current appearance or import a shared .archtheme.json file.",
    "Export",
    "Import",
    "Import theme pack",
    "Apply pack",
    "No contrast issues found.",
    "{count} contrast pair(s) below WCAG AA.",
  ]) {
    assert.match(i18n, new RegExp(`"${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}":`));
  }
});

test("custom appearance controls use tokens", () => {
  assert.match(css, /\.settings-color-input \{[^}]*border: 1px solid var\(--border-default\)/);
  assert.match(css, /\.settings-range-input \{[^}]*accent-color: var\(--accent\)/);
  assert.match(css, /\.settings-value \{[^}]*color: var\(--text-muted\)/);
});
