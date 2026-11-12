const assert = require("node:assert/strict");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");

const names = require("./workspace-names.cjs");
const library = require("../shared/workspace-names.json");

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE project_workspaces (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT ''
    ) STRICT;
  `);
  return db;
}

test("the workspace name library has around one hundred unique entries", () => {
  assert.ok(library.length >= 100, `expected at least 100 names, found ${library.length}`);
  const keys = new Set(library.map((entry) => entry.name.toLowerCase()));
  assert.equal(keys.size, library.length, "workspace names must be unique");
  for (const entry of library) {
    assert.ok(entry.id && entry.name && entry.localName && entry.person, entry.id);
  }
  assert.ok(library.some((entry) => entry.id === "einstein-house-bern"));
  assert.ok(library.some((entry) => entry.localName === "饮冰室"));
  assert.ok(library.some((entry) => entry.localName === "老虎尾巴"));
});

test("suggestions walk the library and skip names already in use", () => {
  const db = database();
  const first = names.suggestWorkspaceName(db);
  assert.equal(first, library[0].name);
  db.prepare("INSERT INTO project_workspaces (id, project_id, name) VALUES (?, ?, ?)").run("a", "project-1", first);
  const second = names.suggestWorkspaceName(db);
  assert.equal(second, library[1].name);
  assert.notEqual(second, first);
});

test("random suggestions use an unused library name", () => {
  const db = database();
  const used = library[0].name;
  db.prepare("INSERT INTO project_workspaces (id, project_id, name) VALUES (?, ?, ?)").run("used", "project-1", used);
  const suggestion = names.suggestRandomWorkspaceName(db);
  assert.ok(library.some((entry) => entry.name === suggestion));
  assert.notEqual(suggestion.toLowerCase(), used.toLowerCase());
});

test("once the library is exhausted, fallback names are still unique building names", () => {
  const db = database();
  const insert = db.prepare("INSERT INTO project_workspaces (id, project_id, name) VALUES (?, ?, ?)");
  library.forEach((entry, index) => insert.run(`id-${index}`, "project-1", entry.name));
  const fallback = names.suggestWorkspaceName(db);
  assert.ok(!library.some((entry) => entry.name.toLowerCase() === fallback.toLowerCase()));
  assert.match(fallback, /^[A-Z][A-Za-z]+ [A-Z][A-Za-z]+/);
  insert.run("fallback", "project-1", fallback);
  const next = names.suggestWorkspaceName(db);
  assert.notEqual(next, fallback);
});

test("workspace names are trimmed and checked per project", () => {
  const db = database();
  assert.equal(names.normalizeWorkspaceName("  Quiet   Room  "), "Quiet Room");
  db.prepare("INSERT INTO project_workspaces (id, project_id, name) VALUES (?, ?, ?)").run("a", "project-1", "Quiet Room");
  assert.equal(names.workspaceNameAvailable(db, "project-1", "quiet room"), false);
  assert.equal(names.workspaceNameAvailable(db, "project-2", "quiet room"), true);
  assert.equal(names.workspaceNameAvailable(db, "project-1", "quiet room", "a"), true);
});
