const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const main = read("electron/main.cjs");
const preload = read("electron/preload.cjs");
const presence = read("electron/presence.cjs");
const app = read("src/App.tsx");
const bridge = read("src/vite-env.d.ts");
const css = read("src/styles.css");

test("desktop presence uses a Supabase realtime channel per project window", () => {
  assert.match(presence, /channel\(`project:\$\{projectId\}`/);
  assert.match(presence, /presenceState\(\)/);
  assert.match(presence, /channel\.track/);
  assert.match(presence, /unsubscribe/);
  assert.match(main, /presence:join/);
  assert.match(main, /presence:update/);
  assert.match(main, /presence:leave/);
  assert.match(main, /presence:update.*members/s);
  assert.match(preload, /onPresenceUpdate/);
  assert.match(bridge, /interface PresenceMember/);
});

test("the toolbar shows live collaborator avatars", () => {
  assert.match(app, /joinProjectPresence/);
  assert.match(app, /updateProjectPresence/);
  assert.match(app, /leaveProjectPresence/);
  assert.match(app, /presence-stack/);
  assert.match(css, /\.presence-avatar/);
});
