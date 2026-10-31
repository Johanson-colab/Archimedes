const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const main = read("electron/main.cjs");
const preload = read("electron/preload.cjs");
const panel = read("src/ProjectMembersPanel.tsx");
const bridge = read("src/vite-env.d.ts");
const app = read("src/App.tsx");
const settings = read("src/SettingsModal.tsx");
const api = read("electron/collaboration-api.cjs");
const server = read("server/supabase-server.cjs");
const sql = read("server/sql/0004_member_management.sql");
const share = read("src/ThreadShareModal.tsx");
const shareSql = read("server/sql/0009_share_link_scope.sql");
const css = read("src/styles.css");

test("desktop hosts the collaboration API and exposes cloud share actions", () => {
  assert.match(main, /createSupabaseServer/);
  assert.match(main, /collaborationServer\.listen\(0, "127\.0\.0\.1"\)/);
  assert.match(main, /collab:publish-project/);
  assert.match(main, /collab:sync-project/);
  assert.match(main, /collab:import-project/);
  assert.match(main, /collab:update-member/);
  assert.match(main, /collab:remove-member/);
  assert.match(main, /collab:sync-threads/);
  assert.match(main, /createThreadSync/);
  assert.match(preload, /publishProject/);
  assert.match(preload, /syncCloudProject/);
  assert.match(bridge, /interface CloudProjectSyncResult/);
  assert.match(api, /updateMember/);
  assert.match(api, /removeMember/);
});

test("member panel exposes cloud sharing, invites, import, and local fallback", () => {
  assert.match(panel, /Cloud sharing/);
  assert.match(panel, /Share this project/);
  assert.match(panel, /Sync members/);
  assert.match(panel, /Collaborator email/);
  assert.match(panel, /Import/);
  assert.match(panel, /Add a local member/);
  assert.match(panel, /Sync threads/);
  assert.match(settings, /onProjectsChanged/);
  assert.match(app, /refreshWorkspaceProjects/);
  assert.match(css, /project-cloud-list/);
});

test("thread sharing creates a scoped read-only guest link", () => {
  assert.match(main, /collab:create-share-link/);
  assert.match(main, /collab:redeem-share-link/);
  assert.match(share, /Create read-only guest link/);
  assert.match(share, /createShareLink/);
  assert.match(bridge, /interface CloudShareLink/);
  assert.match(shareSql, /does not belong to this project/);
  assert.match(shareSql, /p_resource_type = 'thread'/);
});

test("API and SQL expose member role updates and removal with role checks", () => {
  assert.match(server, /update_project_member_role/);
  assert.match(server, /remove_project_member/);
  assert.match(server, /membersMatch/);
  assert.match(sql, /update_project_member_role/);
  assert.match(sql, /remove_project_member/);
  assert.match(sql, /project_role\(p_project, v_user\)/);
  assert.match(sql, /revoke execute .* from anon/);
});
