const fs = require("node:fs");
const path = require("node:path");

const SESSION_FILE = "supabase-session.json";

function createSupabaseAuth({ client, storagePath, safeStorage = null, configured = true } = {}) {
  if (!client) throw new Error("A Supabase client is required.");
  const file = path.join(storagePath, SESSION_FILE);
  let state = { configured, user: null, expiresAt: 0, error: "" };

  function writeSession(session) {
    fs.mkdirSync(storagePath, { recursive: true });
    const serialized = JSON.stringify(session);
    if (safeStorage?.isEncryptionAvailable?.()) {
      const encrypted = safeStorage.encryptString(serialized).toString("base64");
      fs.writeFileSync(file, JSON.stringify({ version: 1, encrypted: true, data: encrypted }), { mode: 0o600 });
    } else {
      fs.writeFileSync(file, JSON.stringify({ version: 1, encrypted: false, data: serialized }), { mode: 0o600 });
    }
  }

  function readSession() {
    if (!fs.existsSync(file)) return null;
    try {
      const stored = JSON.parse(fs.readFileSync(file, "utf8"));
      const serialized = stored.encrypted ? safeStorage.decryptString(Buffer.from(stored.data, "base64")) : stored.data;
      return JSON.parse(serialized);
    } catch {
      try { fs.renameSync(file, `${file}.corrupt-${Date.now()}`); } catch { /* ignore */ }
      return null;
    }
  }

  function clearSession() {
    try { fs.rmSync(file, { force: true }); } catch { /* ignore */ }
  }

  function publicState() {
    return { ...state, configured };
  }

  async function setSession(session) {
    if (!session?.access_token || !session?.refresh_token) {
      state = { configured, user: null, expiresAt: 0, error: "" };
      return publicState();
    }
    await client.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
    writeSession({ access_token: session.access_token, refresh_token: session.refresh_token, expires_at: session.expires_at || 0 });
    state = {
      configured,
      user: session.user ? { id: session.user.id, email: session.user.email || "", displayName: session.user.user_metadata?.full_name || "" } : state.user,
      expiresAt: Number(session.expires_at) || 0,
      error: "",
    };
    return publicState();
  }

  async function initialize() {
    if (!configured) {
      state = { configured: false, user: null, expiresAt: 0, error: "Supabase auth is not configured." };
      return publicState();
    }
    const session = readSession();
    if (!session?.access_token || !session?.refresh_token) return publicState();
    try {
      const { data, error } = await client.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
      if (error) throw error;
      const next = data?.session || session;
      writeSession({ access_token: next.access_token, refresh_token: next.refresh_token, expires_at: next.expires_at || 0 });
      state = {
        configured: true,
        user: next.user ? { id: next.user.id, email: next.user.email || "", displayName: next.user.user_metadata?.full_name || "" } : null,
        expiresAt: Number(next.expires_at) || 0,
        error: "",
      };
    } catch (error) {
      clearSession();
      state = { configured: true, user: null, expiresAt: 0, error: error instanceof Error ? error.message : String(error) };
    }
    return publicState();
  }

  async function signIn(email, password) {
    if (!configured) throw new Error("Supabase auth is not configured.");
    const { data, error } = await client.auth.signInWithPassword({ email: String(email || "").trim(), password: String(password || "") });
    if (error) throw new Error(error.message || "Sign-in failed.");
    return setSession(data.session);
  }

  async function signUp(email, password, displayName = "") {
    if (!configured) throw new Error("Supabase auth is not configured.");
    const { data, error } = await client.auth.signUp({
      email: String(email || "").trim(),
      password: String(password || ""),
      options: { data: { full_name: String(displayName || "").trim() } },
    });
    if (error) throw new Error(error.message || "Sign-up failed.");
    if (data.session) return { ...(await setSession(data.session)), needsConfirmation: false };
    state = { configured: true, user: null, expiresAt: 0, error: "" };
    return { ...publicState(), needsConfirmation: true };
  }

  async function signOut() {
    try { await client.auth.signOut(); } catch { /* local sign-out still clears the session */ }
    clearSession();
    state = { configured, user: null, expiresAt: 0, error: "" };
    return publicState();
  }

  async function accessToken() {
    if (!configured) return null;
    try {
      const { data } = await client.auth.getSession();
      let session = data?.session;
      if (session?.expires_at && session.expires_at * 1000 < Date.now() + 60_000) {
        const refreshed = await client.auth.refreshSession();
        session = refreshed.data?.session || session;
      }
      if (!session?.access_token) return null;
      return session.access_token;
    } catch {
      return null;
    }
  }

  return { initialize, signIn, signUp, signOut, state: publicState, accessToken };
}

module.exports = { createSupabaseAuth, SESSION_FILE };
