const assert = require("node:assert/strict");
const test = require("node:test");

const appearanceModule = import("../src/appearance.ts");

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    values,
  };
}

test("defaults to system with no overrides", async () => {
  const { defaultAppearance } = await appearanceModule;
  assert.deepEqual(defaultAppearance(), { version: 1, preset: "system", overrides: {} });
});

test("normalizes invalid presets, accents, and radii", async () => {
  const { normalizeAppearance } = await appearanceModule;
  const normalized = normalizeAppearance({
    version: 99,
    preset: "neon",
    overrides: { accent: "blue", controlRadius: 99 },
  });
  assert.equal(normalized.version, 1);
  assert.equal(normalized.preset, "system");
  assert.deepEqual(normalized.overrides, { controlRadius: 14 });

  const clamped = normalizeAppearance({ preset: "paper", overrides: { accent: "#AABBCC", controlRadius: -3 } });
  assert.equal(clamped.preset, "paper");
  assert.deepEqual(clamped.overrides, { accent: "#aabbcc", controlRadius: 0 });
});

test("normalizes surface, depth, and density", async () => {
  const { normalizeAppearance } = await appearanceModule;
  const normalized = normalizeAppearance({
    preset: "paper",
    overrides: { surface: "#AABBCC", surfaceDepth: 99, density: "spacious" },
  });
  assert.deepEqual(normalized.overrides, { surface: "#aabbcc", surfaceDepth: 80, density: "spacious" });

  const invalid = normalizeAppearance({ preset: "paper", overrides: { surface: "beige", surfaceDepth: 1, density: "cozy" } });
  assert.deepEqual(invalid.overrides, { surfaceDepth: 20 });
});

test("migrates the legacy theme key into appearance v2", async () => {
  const { readAppearance } = await appearanceModule;
  const legacy = memoryStorage({ "archimedes-theme": "paper" });
  assert.deepEqual(readAppearance(legacy), { version: 1, preset: "paper", overrides: {} });

  const current = memoryStorage({
    "archimedes-appearance-v2": JSON.stringify({ version: 1, preset: "charcoal", overrides: { accent: "#336699" } }),
    "archimedes-theme": "paper",
  });
  assert.deepEqual(readAppearance(current), { version: 1, preset: "charcoal", overrides: { accent: "#336699" } });
});

test("normalizes per-surface overrides", async () => {
  const { normalizeAppearance } = await appearanceModule;
  const normalized = normalizeAppearance({
    preset: "charcoal",
    overrides: {},
    surfaces: {
      reader: {
        accent: "#AABBCC",
        surface: "#112233",
        surfaceDepth: 99,
        density: "compact",
        controlRadius: 2,
        styles: { button: "ghost", shape: "rounded", motion: "none" },
      },
      writing: {},
      bogus: { accent: "#fff000" },
    },
  });
  assert.deepEqual(normalized.surfaces, {
    reader: {
      accent: "#aabbcc",
      surface: "#112233",
      surfaceDepth: 80,
      styles: { button: "ghost", shape: "rounded" },
    },
  });
});

test("surface CSS targets only the configured surface wrappers", async () => {
  const { surfaceCss } = await appearanceModule;
  const css = surfaceCss({
    version: 1,
    preset: "charcoal",
    overrides: {},
    surfaces: {
      reader: { accent: "#336699", surface: "#1b2028", surfaceDepth: 60, styles: { button: "ghost", shape: "rounded" } },
      agent: { accent: "#c9a227" },
    },
  }, "charcoal");
  assert.match(css, /\[data-surface="reader"\] \{/);
  assert.match(css, /--accent: #336699;/);
  assert.match(css, /--surface-ground: #1b2028;/);
  assert.match(css, /--button-primary-bg: transparent;/);
  assert.match(css, /--radius-control: 12px;/);
  assert.match(css, /\[data-surface="agent"\] \{/);
  assert.match(css, /--accent: #c9a227;/);
  assert.doesNotMatch(css, /data-surface="writing"/);
  assert.equal(surfaceCss({ version: 1, preset: "charcoal", overrides: {} }, "charcoal"), "");
});

test("round-trips a theme pack through export and import", async () => {
  const { toThemePack, parseThemePack, themePackSettings } = await appearanceModule;
  const settings = {
    version: 1,
    preset: "paper",
    overrides: { accent: "#3F7BD9", surface: "#F0E8DC", density: "compact", controlRadius: 10 },
    surfaces: { reader: { accent: "#2F8F6B", surface: "#122018", surfaceDepth: 60, styles: { button: "ghost", shape: "sharp" } } },
    styles: { button: "soft", dialog: "glass", shape: "rounded", shadow: "deep", motion: "reduced" },
  };
  const pack = toThemePack(settings, "Lab Notebook");
  assert.equal(pack.schemaVersion, 2);
  assert.equal(pack.id, "lab-notebook");
  assert.equal(pack.name, "Lab Notebook");
  assert.equal(pack.preset, "paper");
  assert.deepEqual(pack.overrides, { accent: "#3f7bd9", surface: "#f0e8dc", density: "compact", controlRadius: 10 });
  assert.deepEqual(pack.surfaces, { reader: { accent: "#2f8f6b", surface: "#122018", surfaceDepth: 60, styles: { button: "ghost", shape: "sharp" } } });
  assert.deepEqual(pack.styles, { button: "soft", dialog: "glass", shape: "rounded", shadow: "deep", motion: "reduced" });

  const parsed = parseThemePack(JSON.parse(JSON.stringify(pack)));
  assert.deepEqual(parsed, pack);
  assert.deepEqual(themePackSettings(parsed), {
    version: 1,
    preset: "paper",
    overrides: pack.overrides,
    surfaces: pack.surfaces,
    styles: pack.styles,
  });
});

test("migrates a schema v1 pack to v2", async () => {
  const { parseThemePack } = await appearanceModule;
  const pack = parseThemePack({
    schemaVersion: 1,
    id: "legacy",
    name: "Legacy",
    preset: "paper",
    overrides: { accent: "#3f7bd9" },
  });
  assert.equal(pack.schemaVersion, 2);
  assert.equal(pack.styles, undefined);
  assert.deepEqual(pack.overrides, { accent: "#3f7bd9" });
});

test("rejects malformed theme packs", async () => {
  const { parseThemePack } = await appearanceModule;
  assert.throws(() => parseThemePack(null), /JSON object/);
  assert.throws(() => parseThemePack({ schemaVersion: 3, name: "Old", preset: "paper" }), /version/);
  assert.throws(() => parseThemePack({ schemaVersion: 1, name: " ", preset: "paper" }), /name/);
  assert.throws(() => parseThemePack({ schemaVersion: 1, name: "Neon", preset: "neon" }), /preset/);
});

test("flags accent and surface pairs below WCAG AA", async () => {
  const { contrastIssues } = await appearanceModule;
  const issues = contrastIssues({
    version: 1,
    preset: "charcoal",
    overrides: { accent: "#868686", surface: "#808080" },
    styles: { button: "soft" },
  }, "charcoal");
  assert.ok(issues.some((issue) => issue.pair === "--accent on --surface-panel"));
  assert.ok(issues.some((issue) => issue.pair === "--accent on button"));
  assert.ok(issues.every((issue) => issue.scope === "global"));
  assert.equal(contrastIssues({ version: 1, preset: "charcoal", overrides: {} }, "charcoal").length, 0);
});

test("resolves OKLab color-mix values for contrast checks", async () => {
  const { resolveColor, contrastRatio } = await appearanceModule;
  const mixed = resolveColor("color-mix(in oklab, #000000 50%, #ffffff 50%)");
  assert.ok(Array.isArray(mixed));
  assert.ok(mixed[0] > 80 && mixed[0] < 180);
  const ratio = contrastRatio("color-mix(in oklab, #000000 50%, #ffffff 50%)", "#808080");
  assert.ok(ratio > 1.2 && ratio < 2.2, String(ratio));
});

test("writes v2 and keeps the legacy key in sync", async () => {
  const { writeAppearance } = await appearanceModule;
  const storage = memoryStorage();
  writeAppearance({ version: 1, preset: "charcoal", overrides: { accent: "#336699", controlRadius: 9 } }, storage);
  assert.deepEqual(JSON.parse(storage.values.get("archimedes-appearance-v2")), {
    version: 1,
    preset: "charcoal",
    overrides: { accent: "#336699", controlRadius: 9 },
  });
  assert.equal(storage.values.get("archimedes-theme"), "charcoal");
});

test("resolves system and explicit presets", async () => {
  const { resolveTheme } = await appearanceModule;
  assert.equal(resolveTheme("system", "paper"), "paper");
  assert.equal(resolveTheme("system", "charcoal"), "charcoal");
  assert.equal(resolveTheme("paper", "charcoal"), "paper");
  assert.equal(resolveTheme("charcoal", "paper"), "charcoal");
});

test("derives readable accent tokens", async () => {
  const { accentTokens, contrastRatio } = await appearanceModule;
  const dark = accentTokens("#C9A227", "charcoal");
  assert.equal(dark["--accent"], "#c9a227");
  assert.equal(dark["--text-on-accent"], "#111111");
  assert.equal(dark["--accent-ink"], "#111111");
  assert.match(dark["--accent-hover"], /^color-mix\(in oklab, #c9a227 86%, #ffffff\)$/);
  assert.ok(contrastRatio(dark["--text-on-accent"], dark["--accent"]) >= 4.5);

  const light = accentTokens("#336699", "paper");
  assert.equal(light["--text-on-accent"], "#ffffff");
  assert.match(light["--accent-hover"], /#000000/);
  assert.ok(contrastRatio(light["--text-on-accent"], light["--accent"]) >= 4.5);
});

test("radius tokens clamp to the supported range", async () => {
  const { radiusTokens } = await appearanceModule;
  assert.deepEqual(radiusTokens(9), { "--radius-control": "9px" });
  assert.deepEqual(radiusTokens(99), { "--radius-control": "14px" });
  assert.deepEqual(radiusTokens(-1), { "--radius-control": "0px" });
  assert.deepEqual(radiusTokens(undefined), {});
});

test("surface tokens derive a coherent ladder from one color", async () => {
  const { surfaceTokens } = await appearanceModule;
  const light = surfaceTokens("#faf7f2", 50, "paper");
  assert.equal(light["--surface-ground"], "#faf7f2");
  assert.match(light["--surface-panel"], /#ffffff/);
  assert.match(light["--surface-canvas"], /#000000/);
  assert.match(light["--text-primary"], /color-mix\(in oklab/);
  assert.equal(light["--mono-surface"], light["--surface-panel"]);

  const dark = surfaceTokens("#141110", 80, "charcoal");
  assert.match(dark["--surface-panel"], /#ffffff/);
  assert.match(dark["--surface-canvas"], /#ffffff/);
  assert.equal(dark["--mono-text"], dark["--text-primary"]);
  assert.notEqual(dark["--surface-canvas"], light["--surface-canvas"]);
});

test("density tokens cover compact, comfortable, and spacious", async () => {
  const { densityTokens } = await appearanceModule;
  assert.deepEqual(densityTokens("comfortable"), {});
  assert.deepEqual(densityTokens(undefined), {});
  assert.equal(densityTokens("compact")["--control-height"], "28px");
  assert.equal(densityTokens("compact")["--density-row-pad"], "11px");
  assert.equal(densityTokens("spacious")["--control-height"], "38px");
  assert.equal(densityTokens("spacious")["--density-settings-nav-height"], "38px");
});

test("maps style presets to component tokens", async () => {
  const { styleTokens } = await appearanceModule;
  assert.deepEqual(styleTokens(undefined, "charcoal"), {});
  assert.equal(styleTokens({ shape: "sharp" }, "charcoal")["--radius-control"], "2px");
  assert.equal(styleTokens({ shape: "rounded" }, "paper")["--dialog-radius-lg"], "20px");
  assert.equal(styleTokens({ button: "soft" }, "charcoal")["--button-primary-bg"], "color-mix(in oklab, var(--accent) 14%, transparent)");
  assert.equal(styleTokens({ button: "ghost" }, "charcoal")["--button-secondary-border-width"], "0");
  assert.equal(styleTokens({ dialog: "outlined" }, "charcoal")["--dialog-shadow-lg"], "none");
  assert.equal(styleTokens({ dialog: "glass" }, "charcoal")["--dialog-backdrop-filter"], "blur(18px) saturate(1.12)");
  assert.match(styleTokens({ shadow: "subtle" }, "paper")["--dialog-shadow-lg"], /rgba\(59, 53, 46/);
});

test("normalizes motion globally and keeps it out of surface styles", async () => {
  const { normalizeAppearance } = await appearanceModule;
  const normalized = normalizeAppearance({
    version: 1,
    preset: "paper",
    overrides: {},
    styles: { motion: "none", button: "soft" },
    surfaces: { reader: { styles: { motion: "reduced", dialog: "flat" } } },
  });
  assert.deepEqual(normalized.styles, { button: "soft", motion: "none" });
  assert.deepEqual(normalized.surfaces, { reader: { styles: { dialog: "flat" } } });

  const invalid = normalizeAppearance({ version: 1, preset: "paper", overrides: {}, styles: { motion: "slow" } });
  assert.equal(invalid.styles, undefined);
});

test("applies and clears inline appearance variables", async () => {
  const { applyAppearance } = await appearanceModule;
  const properties = {};
  const root = {
    dataset: {},
    style: {
      setProperty: (property, value) => { properties[property] = value; },
      removeProperty: (property) => { delete properties[property]; },
    },
  };

  const applied = applyAppearance(root, {
    version: 1,
    preset: "charcoal",
    overrides: { accent: "#336699", surface: "#1b2028", surfaceDepth: 60, controlRadius: 10, density: "compact" },
    styles: { motion: "reduced" },
  }, "charcoal");
  assert.equal(root.dataset.theme, "charcoal");
  assert.equal(root.dataset.density, "compact");
  assert.equal(root.dataset.motion, "reduced");
  assert.equal(properties["--accent"], "#336699");
  assert.equal(properties["--radius-control"], "10px");
  assert.equal(properties["--text-on-accent"], "#ffffff");
  assert.equal(properties["--surface-ground"], "#1b2028");
  assert.match(properties["--surface-panel"], /color-mix/);
  assert.equal(properties["--control-height"], "28px");
  assert.equal(applied["--accent"], "#336699");

  applyAppearance(root, { version: 1, preset: "charcoal", overrides: {} }, "charcoal");
  assert.equal(root.dataset.density, "comfortable");
  assert.equal(root.dataset.motion, "full");
  assert.equal(properties["--accent"], undefined);
  assert.equal(properties["--radius-control"], undefined);
  assert.equal(properties["--surface-ground"], undefined);
  assert.equal(properties["--text-primary"], undefined);
  assert.equal(properties["--control-height"], undefined);
  assert.equal(root.dataset.theme, "charcoal");
});
