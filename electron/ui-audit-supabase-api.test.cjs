const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const server = read("server/supabase-server.cjs");
const index = read("server/index-supabase.cjs");
const pkg = JSON.parse(read("package.json"));
const docs = read("docs/collaboration-api.md");
const sql3 = read("server/sql/0003_project_members_api.sql");

test("Supabase API uses user JWT and publishable key only", () => {
  assert.match(server, /createClient\(supabaseUrl, publishableKey/);
  assert.match(server, /global: \{ headers: \{ Authorization: `Bearer \$\{token\}` \} \}/);
  assert.match(server, /auth\.getUser\(token\)/);
  assert.match(server, /create_project/);
  assert.match(server, /add_project_member_by_email/);
  assert.match(server, /list_project_members/);
  assert.match(index, /SUPABASE_PUBLISHABLE_KEY/);
  assert.equal(pkg.scripts["server:supabase"], "node server/index-supabase.cjs");
});

test("project/member SQL revokes anon and checks roles", () => {
  assert.match(sql3, /revoke execute on function public\.create_project/);
  assert.match(sql3, /revoke execute on function public\.add_project_member_by_email/);
  assert.match(sql3, /revoke execute on function public\.list_project_members/);
  assert.match(sql3, /project_role\(p_project, v_user\)/);
  assert.match(docs, /SUPABASE_LIVE_TESTS=1/);
  assert.match(docs, /two test users/);
});
