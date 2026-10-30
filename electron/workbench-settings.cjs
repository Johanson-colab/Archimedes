const fs = require("node:fs");
const path = require("node:path");

const SETTINGS_FILE = "workbench-settings.json";
const PREFERENCES_VERSION = 2;
const TAB_IDS = ["journey", "trajectory", "files", "changes", "notes", "terminal", "browser"];
const OPTIONAL_TAB_IDS = ["browser"];
const DEFAULT_ORDER = [...TAB_IDS];
const TAB_ID_SET = new Set(TAB_IDS);

let settingsPath = "";
let settings = null;

function defaults() {
  return { version: PREFERENCES_VERSION, order: [...DEFAULT_ORDER], hidden: [...OPTIONAL_TAB_IDS] };
}

function normalize(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const version = typeof source.version === "number" ? source.version : 1;
  const order = [];
  const seen = new Set();
  for (const value of Array.isArray(source.order) ? source.order : []) {
    if (typeof value !== "string" || !TAB_ID_SET.has(value) || seen.has(value)) continue;
    seen.add(value);
    order.push(value);
  }
  for (const id of DEFAULT_ORDER) {
    if (seen.has(id)) continue;
    seen.add(id);
    order.push(id);
  }
  const hidden = [];
  for (const value of Array.isArray(source.hidden) ? source.hidden : []) {
    if (typeof value !== "string" || !TAB_ID_SET.has(value) || !order.includes(value) || hidden.includes(value)) continue;
    hidden.push(value);
  }
  if (version < PREFERENCES_VERSION) {
    for (const id of OPTIONAL_TAB_IDS) {
      if (order.includes(id) && !hidden.includes(id)) hidden.push(id);
    }
  }
  if (hidden.length >= order.length) {
    hidden.splice(0, hidden.length, ...order.filter((id) => id !== order[0]));
  }
  return { version: PREFERENCES_VERSION, order, hidden: order.filter((id) => hidden.includes(id)) };
}

function initialize(userDataPath) {
  settingsPath = path.join(userDataPath, SETTINGS_FILE);
  try {
    settings = normalize(JSON.parse(fs.readFileSync(settingsPath, "utf8")));
  } catch {
    settings = defaults();
  }
  return settings;
}

function persist() {
  if (!settingsPath) return;
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

function workbenchSettings() {
  if (!settings) settings = defaults();
  return structuredClone(settings);
}

function saveWorkbenchSettings(input = {}) {
  settings = normalize(input);
  persist();
  return workbenchSettings();
}

function resetWorkbenchSettings() {
  settings = defaults();
  persist();
  return workbenchSettings();
}

module.exports = {
  PREFERENCES_VERSION,
  defaults,
  initialize,
  normalize,
  resetWorkbenchSettings,
  saveWorkbenchSettings,
  workbenchSettings,
};
