const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const main = read("electron/main.cjs");
const preload = read("electron/preload.cjs");
const auth = read("electron/supabase-auth.cjs");
const bridge = read("src/vite-env.d.ts");
const app = read("src/App.tsx");
const account = read("src/AccountSettingsPanel.tsx");
const settings = read("src/SettingsModal.tsx");
const config = JSON.parse(read("shared/supabase-config.json"));
const pkg = JSON.parse(read("package.json"));

test("Supabase auth is configured with public client credentials", () => {
  assert.match(config.url, /^https:\/\/[a-z0-9]+\.supabase\.co$/);
  assert.match(config.publishableKey, /^sb_publishable_/);
  assert.ok(pkg.dependencies["@supabase/supabase-js"]);
  assert.match(main, /createSupabaseAuth/);
  assert.match(main, /auth:get-state/);
  assert.match(main, /auth:sign-in/);
  assert.match(main, /auth:sign-up/);
  assert.match(main, /auth:sign-out/);
  assert.match(preload, /getAuthState/);
  assert.match(bridge, /interface AuthState/);
});

test("auth sessions are encrypted, restorable, and explicit about confirmation", () => {
  assert.match(auth, /safeStorage\.encryptString/);
  assert.match(auth, /SESSION_FILE/);
  assert.match(auth, /needsConfirmation/);
  assert.match(auth, /signInWithPassword/);
  assert.match(auth, /signUp/);
  assert.match(auth, /refreshSession/);
});

test("Account settings exposes cloud sign-in without replacing local identity", () => {
  assert.match(account, /Cloud account/);
  assert.match(account, /Sign in to collaborate/);
  assert.match(account, /Create account/);
  assert.match(account, /Sign out/);
  assert.match(account, /authState/);
  assert.match(settings, /authState/);
  assert.match(app, /getAuthState/);
  assert.match(app, /onSignIn=\{signIn\}/);
});
