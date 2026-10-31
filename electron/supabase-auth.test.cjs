const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createSupabaseAuth } = require("./supabase-auth.cjs");

function fakeClient({ signUpSession = false } = {}) {
  let session = null;
  return {
    auth: {
      async setSession(next) {
        session = { ...next, user: { id: "user-1", email: "alice@example.com", user_metadata: { full_name: "Alice" } }, expires_at: Math.floor(Date.now() / 1000) + 3600 };
        return { data: { session }, error: null };
      },
      async signInWithPassword() {
        session = { access_token: "access", refresh_token: "refresh", user: { id: "user-1", email: "alice@example.com", user_metadata: { full_name: "Alice" } }, expires_at: Math.floor(Date.now() / 1000) + 3600 };
        return { data: { session }, error: null };
      },
      async signUp() {
        if (!signUpSession) return { data: { user: { id: "user-1", email: "alice@example.com" }, session: null }, error: null };
        session = { access_token: "access", refresh_token: "refresh", user: { id: "user-1", email: "alice@example.com", user_metadata: { full_name: "Alice" } }, expires_at: Math.floor(Date.now() / 1000) + 3600 };
        return { data: { user: session.user, session }, error: null };
      },
      async getSession() { return { data: { session }, error: null }; },
      async refreshSession() { return { data: { session }, error: null }; },
      async signOut() { session = null; return { error: null }; },
    },
  };
}

const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`enc:${value}`),
  decryptString: (value) => Buffer.from(value).toString().replace(/^enc:/, ""),
};

test("sign-in persists an encrypted session and restores it on launch", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-auth-"));
  try {
    const client = fakeClient();
    const auth = createSupabaseAuth({ client, storagePath: directory, safeStorage, configured: true });
    await auth.initialize();
    const state = await auth.signIn("alice@example.com", "password");
    assert.equal(state.user.email, "alice@example.com");
    assert.equal(state.user.displayName, "Alice");
    assert.equal(await auth.accessToken(), "access");
    assert.ok(fs.existsSync(path.join(directory, "supabase-session.json")));
    const restored = createSupabaseAuth({ client: fakeClient(), storagePath: directory, safeStorage, configured: true });
    const restoredState = await restored.initialize();
    assert.equal(restoredState.user.email, "alice@example.com");
    assert.equal((await restored.signOut()).user, null);
    assert.equal(fs.existsSync(path.join(directory, "supabase-session.json")), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("sign-up without a session reports that confirmation is required", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-auth-confirm-"));
  try {
    const auth = createSupabaseAuth({ client: fakeClient({ signUpSession: false }), storagePath: directory, safeStorage, configured: true });
    await auth.initialize();
    const result = await auth.signUp("alice@example.com", "password", "Alice");
    assert.equal(result.needsConfirmation, true);
    assert.equal(result.user, null);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("unconfigured auth reports a useful state", async () => {
  const auth = createSupabaseAuth({ client: fakeClient(), storagePath: fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-auth-off-")), safeStorage, configured: false });
  const state = await auth.initialize();
  assert.equal(state.configured, false);
  assert.equal(state.user, null);
  await assert.rejects(auth.signIn("a@b.com", "x"), /not configured/i);
});
