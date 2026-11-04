const fs = require("node:fs");
const path = require("node:path");

const SETTINGS_FILE = "sidebar-settings.json";
const PREFERENCES_VERSION = 2;
const LAYOUTS = new Set(["flat", "tabs", "sections"]);

// Must match the ids in src/sidebar-registry.tsx coreSidebarEntries.
const CORE_MODULE_IDS = [
  "library",
  "daily",
  "news",
  "benchmark-radar",
  "extensions",
  "reproduce",
  "writing",
  "image-creation",
];
const CORE_ID_SET = new Set(CORE_MODULE_IDS);

let settingsPath = "";
let settings = null;

function defaults() {
  return { version: PREFERENCES_VERSION, layout: "flat", disabledCore: [] };
}

function normalize(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const disabledCore = [];
  for (const value of Array.isArray(source.disabledCore) ? source.disabledCore : []) {
    if (typeof value !== "string" || !CORE_ID_SET.has(value) || disabledCore.includes(value)) continue;
    disabledCore.push(value);
  }
  return {
    version: PREFERENCES_VERSION,
    layout: LAYOUTS.has(source.layout) ? source.layout : "flat",
    disabledCore,
  };
}

function initialize(userDataPath) {
  settingsPath = path.join(userDataPath, SETTINGS_FILE);
  try {
    settings = normalize(JSON.parse(fs.readFileSync(settingsPath, "utf8")));
  } catch {
    settings = defaults();
  }
  return structuredClone(settings);
}

function persist() {
  if (!settingsPath) return;
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

function getSettings() {
  if (!settings) settings = defaults();
  return structuredClone(settings);
}

function setCoreEnabled(id, enabled) {
  if (!CORE_ID_SET.has(id)) throw new Error(`Unknown core module: ${id}`);
  if (!settings) settings = defaults();
  const disabled = new Set(settings.disabledCore);
  if (enabled) disabled.delete(id);
  else disabled.add(id);
  settings = {
    version: PREFERENCES_VERSION,
    layout: settings.layout,
    disabledCore: CORE_MODULE_IDS.filter((value) => disabled.has(value)),
  };
  persist();
  return getSettings();
}

function setLayout(layout) {
  if (!LAYOUTS.has(layout)) throw new Error(`Unknown sidebar layout: ${layout}`);
  if (!settings) settings = defaults();
  settings = { ...settings, layout };
  persist();
  return getSettings();
}

module.exports = { initialize, getSettings, setCoreEnabled, setLayout, CORE_MODULE_IDS, LAYOUTS };
