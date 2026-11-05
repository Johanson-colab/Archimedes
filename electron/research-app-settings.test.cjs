const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test, before, after } = require("node:test");
const { JSDOM } = require("jsdom");

let dom, React, createRoot, Panel, registry, metadata;
before(async () => {
  dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
  global.window = dom.window;
  global.document = dom.window.document;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  React = require("react");
  ({ createRoot } = require("react-dom/client"));
  const { transformWithOxc } = await import("vite");
  const scope = {
    React, ...React, ...require("lucide-react"),
    metadata: require("../shared/research-apps.json"),
    useUISettings: () => ({ t: translate }),
  };
  async function load(file, names) {
    const source = fs.readFileSync(path.join(__dirname, "../src", file), "utf8")
      .replace(/^import[\s\S]*?from\s+"[^"]+";\r?\n/gm, "")
      .replace(/export default function/g, "function").replace(/export (const|function)/g, "$1");
    const { code } = await transformWithOxc(source, file, { jsx: { runtime: "classic" } });
    const values = new Function(...Object.keys(scope), `${code.replace(/^export \{\};?$/gm, "")}\nreturn {${names.join(",")}};`)(...Object.values(scope));
    Object.assign(scope, values);
    return values;
  }
  metadata = await load("research-apps.ts", ["researchAppCategories", "researchAppCategory", "researchAppMetadata", "defaultDisabledResearchApps"]);
  registry = await load("sidebar-registry.tsx", ["coreSidebarEntries", "sidebarEntries", "registerPluginEntries"]);
  await load("SettingsPrimitives.tsx", ["SettingsSection", "SettingsGroup", "SettingsRow", "SettingsSwitch"]);
  ({ PluginsSettingsPanel: Panel } = await load("PluginsSettingsPanel.tsx", ["PluginsSettingsPanel"]));
});
after(() => {
  dom.window.close();
  delete global.window;
  delete global.document;
  delete global.IS_REACT_ACT_ENVIRONMENT;
});
function translate(key, values) {
  return key.replace(/\{(\w+)\}/g, (_, name) => values?.[name] ?? `{${name}}`);
}
async function mount(overrides = {}, onCoreModuleEnabled) {
  const bridge = {
    listSidebarPlugins: async () => [], listExtensions: async () => ({ items: [] }),
    ...overrides,
  };
  const root = createRoot(document.getElementById("root"));
  function Fixture() {
    const [hidden, setHidden] = React.useState(metadata.defaultDisabledResearchApps);
    return React.createElement(Panel, { bridge, workspace: "/fixture", disabledCoreModules: hidden, onCoreModuleEnabled: onCoreModuleEnabled || ((id, enabled) => setHidden((previous) => enabled ? previous.filter((value) => value !== id) : [...previous, id])) });
  }
  await React.act(async () => root.render(React.createElement(Fixture)));
  return () => React.act(async () => root.unmount());
}
const headings = () => [...document.querySelectorAll("h3")].map((node) => node.textContent);
const row = (name) => [...document.querySelectorAll(".settings-row")].find((node) => node.querySelector(".settings-row-title")?.textContent === name);

test("all ten built-ins appear once in the five issue categories with six enabled", async () => {
  const unmount = await mount();
  try {
    assert.deepEqual(headings(), ["Discovery & tracking", "Resources & evidence", "Experiments & evaluation", "Analysis & visualization", "Writing & delivery"]);
    const expected = { "Daily papers": 0, News: 0, "Benchmark Radar": 0, Library: 1, Extensions: 1, Reproduce: 2, "Image creation": 3, "Data charts": 3, "Paper writing": 4, "Paper review": 4 };
    for (const [name, index] of Object.entries(expected)) {
      assert.equal(row(name)?.closest("section").querySelector("h3").textContent, headings()[index]);
    }
    assert.equal(document.querySelectorAll('[role="switch"]').length, 10);
    assert.equal(document.querySelectorAll('[role="switch"][aria-checked="true"]').length, 6);
    assert.ok(!document.body.textContent.includes("Sidebar layout"));
    assert.ok(!document.body.textContent.includes("Micro app"));
    await React.act(async () => row("News").querySelector("button").click());
    assert.equal(row("News").querySelector("button").getAttribute("aria-checked"), "true");
  } finally { await unmount(); }
});

test("failed core visibility saves keep the switch unchanged and report an error", async () => {
  const unmount = await mount({}, async () => { throw new Error("Disk unavailable"); });
  try {
    await React.act(async () => row("Library").querySelector("button").click());
    assert.equal(row("Library").querySelector("button").getAttribute("aria-checked"), "true");
    assert.equal(document.querySelector('[role="status"]').textContent, "Disk unavailable");
    assert.equal(row("Library").querySelector("button").disabled, false);
  } finally { await unmount(); }
});

test("legacy and categorized plugins share the catalog without duplicate install rows", async () => {
  let installed = [{ id: "focus-timer", name: "Focus Timer", section: "create", enabled: true, version: "1.0.0" }];
  let installs = 0;
  const item = { id: "official/csv-analysis", name: "CSV Analysis", researchCategory: "analysis", type: "ui-plugin", version: "1.0.0", description: "Analyze a dataset" };
  const unmount = await mount({
    listSidebarPlugins: async () => installed,
    listExtensions: async () => ({ items: [{ ...item, id: "official/focus-timer", name: "Focus Timer", researchCategory: "writing" }, item] }),
    installExtension: async () => { installs++; installed = [...installed, { id: "csv-analysis", name: "CSV Analysis", researchCategory: "analysis", enabled: true, version: "1.0.0" }]; },
    removeSidebarPlugin: async (id) => { installed = installed.filter((record) => record.id !== id); return installed; },
    setSidebarPluginEnabled: async (id, enabled) => { installed = installed.map((record) => record.id === id ? { ...record, enabled } : record); return installed; },
  });
  try {
    assert.equal(row("Focus Timer").closest("section").querySelector("h3").textContent, "Writing & delivery");
    assert.equal([...document.querySelectorAll(".settings-row-title")].filter((node) => node.textContent === "Focus Timer").length, 1);
    assert.equal(row("CSV Analysis").closest("section").querySelector("h3").textContent, "Analysis & visualization");
    await React.act(async () => row("CSV Analysis").querySelector("button").click());
    assert.equal(installs, 1);
    assert.equal(row("CSV Analysis").querySelector('[role="switch"]').getAttribute("aria-checked"), "true");
    await React.act(async () => row("Focus Timer").querySelector('[role="switch"]').click());
    assert.equal(row("Focus Timer").querySelector('[role="switch"]').getAttribute("aria-checked"), "false");
    await React.act(async () => row("CSV Analysis").querySelector('[aria-label="Remove CSV Analysis"]').click());
    assert.ok(Boolean(row("CSV Analysis").querySelector('[aria-label="Install CSV Analysis"]')));
  } finally { await unmount(); }
});

test("sidebar order is independent of category; explicit plugin metadata overrides legacy sections", () => {
  assert.deepEqual(registry.sidebarEntries().filter((entry) => !metadata.defaultDisabledResearchApps.includes(entry.id)).map((entry) => entry.id), ["library", "daily", "reproduce", "image-creation", "data-charts", "writing"]);
  assert.equal(metadata.researchAppCategory({ id: "custom", researchCategory: "experiments", section: "create" }), "experiments");
  assert.equal(metadata.researchAppCategory({ id: "legacy", section: "knowledge" }), "evidence");
  assert.equal(metadata.researchAppCategory({ id: "unknown", researchCategory: "invalid" }), "evidence");
  assert.equal(metadata.researchAppCategory({ id: "constructor", section: "constructor" }), "evidence");
});
