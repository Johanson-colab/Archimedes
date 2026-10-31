const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const server = read("server/supabase-server.cjs");
const api = read("electron/collaboration-api.cjs");
const sql = read("server/sql/0005_library_api.sql");
const integrity = read("server/sql/0006_library_api_integrity.sql");
const docs = read("docs/collaboration-api.md");
const main = read("electron/main.cjs");
const preload = read("electron/preload.cjs");
const libraryView = read("src/LibraryView.tsx");
const bridge = read("src/vite-env.d.ts");

test("library API exposes project libraries, papers, and per-user paper state", () => {
  assert.match(server, /projectLibrariesMatch/);
  assert.match(server, /libraryPapersMatch/);
  assert.match(server, /paperMatch/);
  assert.match(server, /method === "PATCH"/);
  assert.match(server, /upsert_paper_to_library/);
  assert.match(server, /paper_user_state/);
  assert.match(api, /listLibraries/);
  assert.match(api, /addPaper/);
  assert.match(api, /updatePaperState/);
});

test("desktop library view can push and pull shared libraries", () => {
  assert.match(main, /collab:sync-libraries/);
  assert.match(main, /createLibrarySync/);
  assert.match(preload, /syncProjectLibraries/);
  assert.match(bridge, /interface CloudLibrarySyncResult/);
  assert.match(libraryView, /Sync cloud/);
  assert.match(libraryView, /syncProjectLibraries/);
});

test("canonical papers are shared without cross-project metadata overwrites", () => {
  assert.match(sql, /security definer/);
  assert.match(sql, /project_role\(v_project, v_user\)/);
  assert.match(integrity, /on conflict \(canonical_key\) do nothing/);
  assert.doesNotMatch(integrity, /do update/);
  assert.match(integrity, /revoke execute .* from anon/);
  assert.match(docs, /Libraries/);
});
