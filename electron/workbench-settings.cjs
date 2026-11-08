const fs = require("node:fs");
const path = require("node:path");

const SETTINGS_FILE = "workbench-settings.json";
const PREFERENCES_VERSION = 4;
const MAX_PANES = 2;
const MIN_PANE_PERCENT = 25;
const DEFAULT_ACTIVE_TAB = "trajectory";
const TAB_IDS = ["journey", "trajectory", "files", "changes", "artifacts", "notes", "terminal", "browser"];
const OPTIONAL_TAB_IDS = ["artifacts", "browser"];
const DEFAULT_ORDER = [...TAB_IDS];
const TAB_ID_SET = new Set(TAB_IDS);

let settingsPath = "";
let settings = null;

function sortTabs(tabs, order) {
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...tabs].sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
}

function defaultActiveTab(tabs) {
  return tabs.includes(DEFAULT_ACTIVE_TAB) ? DEFAULT_ACTIVE_TAB : tabs[0];
}

function normalizePaneSizes(panes) {
  if (panes.length <= 1) return panes.map((pane) => ({ ...pane, size: 100 }));
  if (panes.length === 2) {
    const raw = Number.isFinite(panes[0].size) ? panes[0].size : 50;
    const first = Math.min(100 - MIN_PANE_PERCENT, Math.max(MIN_PANE_PERCENT, raw));
    return [{ ...panes[0], size: first }, { ...panes[1], size: 100 - first }];
  }
  const weights = panes.map((pane) => (Number.isFinite(pane.size) && pane.size > 0 ? pane.size : 1));
  const total = weights.reduce((sum, weight) => sum + weight, 0) || panes.length;
  return panes.map((pane, index) => ({ ...pane, size: (weights[index] / total) * 100 }));
}

function defaultLayout(order, hidden) {
  const tabs = order.filter((id) => !hidden.includes(id));
  return { orientation: "row", focused: "pane-1", panes: [{ id: "pane-1", tabs, active: defaultActiveTab(tabs), size: 100 }] };
}

function normalizeLayout(input, order, hidden) {
  const visible = order.filter((id) => !hidden.includes(id));
  const source = input && typeof input === "object" ? input : {};
  const orientation = source.orientation === "column" ? "column" : "row";
  const rawPanes = Array.isArray(source.panes) ? source.panes : [];
  const seen = new Set();
  const panes = [];
  for (const candidate of rawPanes) {
    if (panes.length >= MAX_PANES) break;
    if (!candidate || typeof candidate !== "object") continue;
    const tabs = [];
    for (const value of Array.isArray(candidate.tabs) ? candidate.tabs : []) {
      if (typeof value !== "string" || !TAB_ID_SET.has(value) || seen.has(value) || !visible.includes(value)) continue;
      seen.add(value);
      tabs.push(value);
    }
    if (!tabs.length) continue;
    const active = typeof candidate.active === "string" && tabs.includes(candidate.active) ? candidate.active : defaultActiveTab(tabs);
    const size = Number.isFinite(candidate.size) ? candidate.size : 100 / (panes.length + 1);
    panes.push({ id: typeof candidate.id === "string" && candidate.id ? candidate.id : `pane-${panes.length + 1}`, tabs, active, size });
  }
  if (!panes.length && visible.length) {
    panes.push({ id: "pane-1", tabs: [...visible], active: defaultActiveTab(visible), size: 100 });
    for (const id of visible) seen.add(id);
  }
  const remaining = visible.filter((id) => !seen.has(id));
  if (remaining.length && panes.length) {
    panes[0] = { ...panes[0], tabs: sortTabs([...panes[0].tabs, ...remaining], order) };
    if (!panes[0].tabs.includes(panes[0].active)) panes[0] = { ...panes[0], active: defaultActiveTab(panes[0].tabs) };
  }
  const used = new Set();
  for (const pane of panes) {
    if (!pane.id || used.has(pane.id)) {
      let index = 1;
      while (used.has(`pane-${index}`)) index += 1;
      pane.id = `pane-${index}`;
    }
    used.add(pane.id);
  }
  const focused = typeof source.focused === "string" && panes.some((pane) => pane.id === source.focused)
    ? source.focused
    : (panes[0] ? panes[0].id : "pane-1");
  return { orientation, focused, panes: normalizePaneSizes(panes) };
}

function defaults() {
  return {
    version: PREFERENCES_VERSION,
    order: [...DEFAULT_ORDER],
    hidden: [...OPTIONAL_TAB_IDS],
    layout: defaultLayout(DEFAULT_ORDER, OPTIONAL_TAB_IDS),
  };
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
    // v2 added Browser; v3 added Artifacts; v4 only adds the split layout.
    // Migration should hide only newly introduced tabs, never re-hide a tab
    // the user explicitly enabled.
    const newlyHidden = version < 2 ? OPTIONAL_TAB_IDS : version < 3 ? ["artifacts"] : [];
    for (const id of newlyHidden) {
      if (order.includes(id) && !hidden.includes(id)) hidden.push(id);
    }
  }
  if (hidden.length >= order.length) {
    hidden.splice(0, hidden.length, ...order.filter((id) => id !== order[0]));
  }
  const hiddenOrder = order.filter((id) => hidden.includes(id));
  return {
    version: PREFERENCES_VERSION,
    order,
    hidden: hiddenOrder,
    layout: normalizeLayout(source.layout, order, hiddenOrder),
  };
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
  MAX_PANES,
  PREFERENCES_VERSION,
  defaultLayout,
  defaults,
  initialize,
  normalize,
  normalizeLayout,
  resetWorkbenchSettings,
  saveWorkbenchSettings,
  workbenchSettings,
};
