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

test("canonical papers are shared without cross-project metadata overwrites", () => {
  assert.match(sql, /security definer/);
  assert.match(sql, /project_role\(v_project, v_user\)/);
  assert.match(integrity, /on conflict \(canonical_key\) do nothing/);
  assert.doesNotMatch(integrity, /do update/);
  assert.match(integrity, /revoke execute .* from anon/);
  assert.match(docs, /Libraries/);
});
