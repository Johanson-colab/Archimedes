const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const store = read("electron/store.cjs");
const main = read("electron/main.cjs");
const preload = read("electron/preload.cjs");
const bridge = read("src/vite-env.d.ts");
const settings = read("src/SettingsModal.tsx");
const panel = read("src/ProjectMembersPanel.tsx");
const app = read("src/App.tsx");
const css = read("src/styles.css");

test("project members expose role management and audit activity", () => {
  assert.match(store, /function updateProjectMemberRole/);
  assert.match(store, /function removeProjectMember/);
  assert.match(store, /Project ownership cannot be changed here/);
  assert.match(store, /The project owner cannot be removed/);
  assert.match(main, /ipcMain\.handle\("project:list-members"/);
  assert.match(main, /ipcMain\.handle\("project:update-member"/);
  assert.match(main, /ipcMain\.handle\("audit:list"/);
  assert.match(preload, /listProjectMembers/);
  assert.match(bridge, /interface ProjectMember/);
  assert.match(settings, /ProjectMembersPanel/);
  assert.match(panel, /Project members/);
  assert.match(panel, /Add a local member/);
  assert.match(panel, /Project activity/);
  assert.match(css, /\.project-member-row/);
  assert.match(app, /activeProject=\{activeProject\}/);
});
