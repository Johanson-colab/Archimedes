const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const app = read("src/App.tsx");
const account = read("src/AccountSettingsPanel.tsx");
const settings = read("src/SettingsModal.tsx");
const store = read("electron/store.cjs");
const identity = read("electron/local-identity.cjs");
const roles = read("electron/collaboration/roles.cjs");
const main = read("electron/main.cjs");
const preload = read("electron/preload.cjs");
const bridge = read("src/vite-env.d.ts");
const css = read("src/styles.css");

test("local identity is persisted and exposed without gating local features", () => {
  assert.match(identity, /IDENTITY_FILE = "identity\.json"/);
  assert.match(identity, /usr_\$\{randomUUID\(\)\}/);
  assert.match(identity, /dev_\$\{randomUUID\(\)\}/);
  assert.match(identity, /\.corrupt-/);
  assert.match(main, /localIdentity\.initialize\(app\.getPath\("userData"\)\)/);
  assert.match(main, /store\.setLocalIdentity\(localIdentity\.localIdentity\(\)\)/);
  assert.match(main, /ipcMain\.handle\("identity:get"/);
  assert.match(main, /ipcMain\.handle\("identity:update"/);
  assert.match(preload, /getLocalIdentity/);
  assert.match(preload, /updateLocalIdentity/);
  assert.match(bridge, /getLocalIdentity: \(\) => Promise<LocalIdentity>/);
  assert.match(app, /getLocalIdentity\(\)/);
  assert.doesNotMatch(app, /localIdentity\s*===?\s*null\s*\)\s*return/);
});

test("Account settings shows the local profile and device without a login wall", () => {
  assert.match(settings, /"account"/);
  assert.match(settings, /AccountSettingsPanel/);
  assert.match(account, /Cloud sign-in/);
  assert.match(settings, /Account/);
  assert.match(account, /Local profile/);
  assert.match(account, /Display name/);
  assert.match(account, /This device/);
  assert.match(account, /Local user ID/);
  assert.match(account, /Not available yet/);
  assert.match(css, /\.account-device-id code/);
});

test("project ownership and membership are persisted and access checked", () => {
  assert.match(store, /CREATE TABLE IF NOT EXISTS users/);
  assert.match(store, /CREATE TABLE IF NOT EXISTS project_members/);
  assert.match(store, /ensureColumn\(db, "research_projects", "owner_id"/);
  assert.match(store, /function ensureProjectOwnership/);
  assert.match(store, /function listProjectMembers/);
  assert.match(store, /function projectRoleForUser/);
  assert.match(store, /function canAccessProject/);
  assert.match(store, /project_members\.user_id = \?/);
  assert.match(store, /You do not have access to this research thread/);
  assert.match(roles, /ROLES = \["viewer", "commenter", "editor", "admin", "owner"\]/);
  assert.match(roles, /canApproveAgentAction/);
});
