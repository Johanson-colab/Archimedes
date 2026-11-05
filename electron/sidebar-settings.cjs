const fs = require("node:fs");
const path = require("node:path");

const SETTINGS_FILE = "sidebar-settings.json";
const PREFERENCES_VERSION = 4;
const researchApps = require("../shared/research-apps.json");
const DEFAULT_DISABLED_CORE = Object.entries(researchApps.apps).filter(([, app]) => !app.defaultEnabled).map(([id]) => id);
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
  "data-charts",
  "paper-review",
];
const CORE_ID_SET = new Set(CORE_MODULE_IDS);

let settingsPath = "";
let settings = null;

function defaults() {
  return { version: PREFERENCES_VERSION, layout: "flat", disabledCore: [...DEFAULT_DISABLED_CORE] };
}

function normalize(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const disabledCore = [];
  for (const value of Array.isArray(source.disabledCore) ? source.disabledCore : []) {
    if (typeof value !== "string" || !CORE_ID_SET.has(value) || disabledCore.includes(value)) continue;
    disabledCore.push(value);
  }
  // Charts used to belong to Image creation; preserve that visibility on upgrade.
  if ((Number(source.version) || 0) < 4 && disabledCore.includes("image-creation") && !disabledCore.includes("data-charts")) disabledCore.push("data-charts");
  return {
    version: PREFERENCES_VERSION,
    // Old layout preferences are accepted on disk, but no longer drive navigation.
    layout: "flat",
    disabledCore: (Number(source.version) || 0) < 3 && disabledCore.length === 0
      ? [...DEFAULT_DISABLED_CORE]
      : Array.isArray(source.disabledCore) ? disabledCore : [...DEFAULT_DISABLED_CORE],
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
  // Compatibility for older renderers; Research Apps has one unified list.
  settings = { ...settings, layout: "flat" };
  persist();
  return getSettings();
}

module.exports = { initialize, getSettings, setCoreEnabled, setLayout, CORE_MODULE_IDS, LAYOUTS };
