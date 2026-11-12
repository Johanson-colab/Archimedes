const { randomInt, randomUUID } = require("node:crypto");
const library = require("../shared/workspace-names.json");

const MAX_NAME_LENGTH = 80;
const ADJECTIVES = [
  "Alder", "Amber", "Arc", "Atlas", "Birch", "Cedar", "Cobalt", "Copper",
  "Cypress", "Elm", "Ember", "Fern", "Flint", "Granite", "Harbor", "Hazel",
  "Indigo", "Ivory", "Juniper", "Lark", "Laurel", "Linden", "Maple", "Marble",
  "Meadow", "Moss", "Oak", "Onyx", "Orchard", "Pine", "Quarry", "Quill",
  "Reed", "River", "Rowan", "Sage", "Slate", "Spruce", "Stone", "Timber",
  "Vale", "Velvet", "Willow", "Wren",
];
const NOUNS = [
  "Atelier", "Cabin", "Chamber", "Cottage", "Gallery", "Hall", "House",
  "Lab", "Loft", "Lodge", "Pavilion", "Studio", "Study", "Workshop",
];

function normalizeWorkspaceName(value) {
  if (typeof value !== "string") return "";
  const normalized = value.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);
  return normalized;
}

function workspaceNamesInUse(db) {
  return new Set(
    db.prepare("SELECT name FROM project_workspaces WHERE name <> ''").all()
      .map((row) => String(row.name).toLowerCase()),
  );
}

function randomBuildingName(used) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const base = `${ADJECTIVES[randomInt(ADJECTIVES.length)]} ${NOUNS[randomInt(NOUNS.length)]}`;
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate.toLowerCase())) {
      candidate = `${base} ${suffix}`;
      suffix += 1;
    }
    return candidate;
  }
  return `Workspace ${randomUUID().slice(0, 8)}`;
}

/**
 * Picks the first unused name from the curated studio/residence library. Once
 * every entry is taken, falls back to a random English building name.
 */
function suggestWorkspaceName(db) {
  const used = workspaceNamesInUse(db);
  for (const entry of library) {
    if (!used.has(entry.name.toLowerCase())) return entry.name;
  }
  return randomBuildingName(used);
}

function suggestRandomWorkspaceName(db) {
  const used = workspaceNamesInUse(db);
  const available = library.filter((entry) => !used.has(entry.name.toLowerCase()));
  if (available.length) return available[randomInt(available.length)].name;
  return randomBuildingName(used);
}

function workspaceNameAvailable(db, projectId, name, ignoreId = null) {
  const row = db.prepare(`
    SELECT id FROM project_workspaces
    WHERE project_id = ? AND lower(name) = lower(?) AND (? IS NULL OR id <> ?)
    LIMIT 1
  `).get(projectId, name, ignoreId, ignoreId);
  return !row;
}

module.exports = {
  MAX_NAME_LENGTH,
  WORKSPACE_NAME_LIBRARY: library,
  normalizeWorkspaceName,
  suggestWorkspaceName,
  suggestRandomWorkspaceName,
  workspaceNameAvailable,
};
