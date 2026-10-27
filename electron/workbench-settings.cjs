const fs = require("node:fs");
const path = require("node:path");

const SETTINGS_FILE = "workbench-settings.json";
const TAB_IDS = ["journey", "trajectory", "files", "changes", "notes", "terminal"];
const DEFAULT_ORDER = [...TAB_IDS];
const TAB_ID_SET = new Set(TAB_IDS);

let settingsPath = "";
let settings = null;

function defaults() {
  return { version: 1, order: [...DEFAULT_ORDER], hidden: [] };
}

function normalize(input = {}) {
  const source = input && typeof input === "object" ? input : {};
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
  if (hidden.length >= order.length) {
    hidden.splice(0, hidden.length, ...order.filter((id) => id !== order[0]));
  }
  return { version: 1, order, hidden };
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
  defaults,
  initialize,
  normalize,
  resetWorkbenchSettings,
  saveWorkbenchSettings,
  workbenchSettings,
};
