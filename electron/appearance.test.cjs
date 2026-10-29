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
      reader: { accent: "#AABBCC", surface: "#112233", surfaceDepth: 99, density: "compact", controlRadius: 2 },
      writing: {},
      bogus: { accent: "#fff000" },
    },
  });
  assert.deepEqual(normalized.surfaces, {
    reader: { accent: "#aabbcc", surface: "#112233", surfaceDepth: 80 },
  });
});

test("surface CSS targets only the configured surface wrappers", async () => {
  const { surfaceCss } = await appearanceModule;
  const css = surfaceCss({
    version: 1,
    preset: "charcoal",
    overrides: {},
    surfaces: {
      reader: { accent: "#336699", surface: "#1b2028", surfaceDepth: 60 },
      agent: { accent: "#c9a227" },
    },
  }, "charcoal");
  assert.match(css, /\[data-surface="reader"\] \{/);
  assert.match(css, /--accent: #336699;/);
  assert.match(css, /--surface-ground: #1b2028;/);
  assert.match(css, /\[data-surface="agent"\] \{/);
  assert.match(css, /--accent: #c9a227;/);
  assert.doesNotMatch(css, /data-surface="writing"/);
  assert.equal(surfaceCss({ version: 1, preset: "charcoal", overrides: {} }, "charcoal"), "");
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
  }, "charcoal");
  assert.equal(root.dataset.theme, "charcoal");
  assert.equal(root.dataset.density, "compact");
  assert.equal(properties["--accent"], "#336699");
  assert.equal(properties["--radius-control"], "10px");
  assert.equal(properties["--text-on-accent"], "#ffffff");
  assert.equal(properties["--surface-ground"], "#1b2028");
  assert.match(properties["--surface-panel"], /color-mix/);
  assert.equal(properties["--control-height"], "28px");
  assert.equal(applied["--accent"], "#336699");

  applyAppearance(root, { version: 1, preset: "charcoal", overrides: {} }, "charcoal");
  assert.equal(root.dataset.density, "comfortable");
  assert.equal(properties["--accent"], undefined);
  assert.equal(properties["--radius-control"], undefined);
  assert.equal(properties["--surface-ground"], undefined);
  assert.equal(properties["--text-primary"], undefined);
  assert.equal(properties["--control-height"], undefined);
  assert.equal(root.dataset.theme, "charcoal");
});
