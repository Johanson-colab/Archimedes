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
const modal = read("src/AuthModal.tsx");
const chip = read("src/AccountChip.tsx");
const flow = read("electron/auth-flow.cjs");
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


test("the account chip, auth modal, and composer gate keep local work available", () => {
  assert.match(chip, /Cloud agents & sync/);
  assert.match(chip, /Sign out/);
  assert.match(chip, /account-menu/);
  assert.match(modal, /Your research stays local by default/);
  assert.match(modal, /Continue without an account/);
  assert.match(modal, /Continue with Google/);
  assert.match(modal, /Email me a sign-in link/);
  assert.match(modal, /Create account/);
  assert.match(modal, /Terms/);
  assert.match(flow, /exchangeCodeForSession/);
  assert.match(main, /auth:magic-link/);
  assert.match(main, /auth:oauth/);
  assert.match(main, /auth:reset-password/);
  assert.match(main, /flowType: "pkce"/);
  assert.match(app, /Cloud runs need an account/);
  assert.match(app, /cloudSignedIn/);
});
