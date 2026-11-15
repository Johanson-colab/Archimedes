const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const flag = read("src/cloud-features.ts");
const app = read("src/App.tsx");
const registry = read("src/settings/registry.tsx");
const settings = read("src/SettingsModal.tsx");
const sessionSwitcher = read("src/SessionSwitcher.tsx");
const library = read("src/LibraryWorkspace.tsx");
const writing = read("src/PaperWritingView.tsx");
const canvas = read("src/PaperCanvas.tsx");
const share = read("src/ThreadShareModal.tsx");

test("v0.1.0 ships with cloud features off", () => {
  assert.match(flag, /export const CLOUD_FEATURES_ENABLED = false;/);
});

test("account and auth entry points are hidden", () => {
  assert.match(app, /\{CLOUD_FEATURES_ENABLED && <AccountChip/);
  assert.match(app, /\{CLOUD_FEATURES_ENABLED && <AuthModal/);
  assert.match(app, /if \(!CLOUD_FEATURES_ENABLED\) return;\s*setAuthModalMode/);
  assert.match(registry, /\.\.\.\(CLOUD_FEATURES_ENABLED \? \[\{\s*id: "account"/);
  assert.match(settings, /\{CLOUD_FEATURES_ENABLED && location\.section === "account"/);
});

test("presence and member surfaces are hidden", () => {
  assert.match(app, /\{CLOUD_FEATURES_ENABLED && presenceMembers\.length > 0/);
  assert.match(app, /if \(!CLOUD_FEATURES_ENABLED \|\| !activeProjectId \|\| !authState\?\.user/);
  assert.match(registry, /\.\.\.\(CLOUD_FEATURES_ENABLED \? \[\{ id: "members", label: "Members" \}\] : \[\]\)/);
});

test("cloud actions in local modules are unreachable", () => {
  assert.match(sessionSwitcher, /CLOUD_FEATURES_ENABLED \? \["all", "mine", "shared", "archived"\] : \["all", "mine", "archived"\]/);
  assert.match(library, /\{CLOUD_FEATURES_ENABLED && <button className="icon-button" disabled=\{!projectId \|\| cloudBusy\}/);
  assert.match(writing, /\{CLOUD_FEATURES_ENABLED && <button className=\{coedit \? "paper-pane-action active"/);
  assert.match(canvas, /const canShareProject = CLOUD_FEATURES_ENABLED &&/);
  assert.match(canvas, /\{CLOUD_FEATURES_ENABLED && <MenuItem className="menu-item-rich" checked=\{visibility === "project"\}/);
  assert.match(share, /const linkSharingEnabled = CLOUD_FEATURES_ENABLED && signedIn;/);
  assert.match(share, /\{linkSharingEnabled && <section className="snapshot-guest-link"/);
});
