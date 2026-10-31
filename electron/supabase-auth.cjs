const fs = require("node:fs");
const path = require("node:path");

const SESSION_FILE = "supabase-session.json";

function createSupabaseAuth({ client, storagePath, safeStorage = null, configured = true } = {}) {
  if (!client) throw new Error("A Supabase client is required.");
  const file = path.join(storagePath, SESSION_FILE);
  let providers = { email: true, google: false, magicLink: false };
  let state = { configured, user: null, expiresAt: 0, error: "", providers };

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
    return { ...state, configured, providers };
  }

  async function setSession(session) {
    if (!session?.access_token || !session?.refresh_token) {
      state = { configured, user: null, expiresAt: 0, error: "", providers };
      return publicState();
    }
    await client.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
    writeSession({ access_token: session.access_token, refresh_token: session.refresh_token, expires_at: session.expires_at || 0 });
    state = {
      configured,
      user: session.user ? { id: session.user.id, email: session.user.email || "", displayName: session.user.user_metadata?.full_name || "" } : state.user,
      expiresAt: Number(session.expires_at) || 0,
      error: "",
      providers,
    };
    return publicState();
  }

  async function initialize() {
    if (!configured) {
      state = { configured: false, user: null, expiresAt: 0, error: "Supabase auth is not configured.", providers };
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
        providers,
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

  async function signUp(email, password, displayName = "", { emailRedirectTo = "" } = {}) {
    if (!configured) throw new Error("Supabase auth is not configured.");
    const { data, error } = await client.auth.signUp({
      email: String(email || "").trim(),
      password: String(password || ""),
      options: { data: { full_name: String(displayName || "").trim() }, ...(emailRedirectTo ? { emailRedirectTo } : {}) },
    });
    if (error) throw new Error(error.message || "Sign-up failed.");
    if (data.session) return { ...(await setSession(data.session)), needsConfirmation: false };
    state = { configured: true, user: null, expiresAt: 0, error: "", providers };
    return { ...publicState(), needsConfirmation: true };
  }

  async function signOut() {
    try { await client.auth.signOut(); } catch { /* local sign-out still clears the session */ }
    clearSession();
    state = { configured, user: null, expiresAt: 0, error: "", providers };
    return publicState();
  }

  async function sendMagicLink(email, emailRedirectTo) {
    if (!configured) throw new Error("Supabase auth is not configured.");
    const { error } = await client.auth.signInWithOtp({
      email: String(email || "").trim(),
      options: { shouldCreateUser: true, emailRedirectTo },
    });
    if (error) throw new Error(error.message || "Could not send the email link.");
    return { sent: true };
  }

  async function sendPasswordReset(email, redirectTo) {
    if (!configured) throw new Error("Supabase auth is not configured.");
    const { error } = await client.auth.resetPasswordForEmail(String(email || "").trim(), { redirectTo });
    if (error) throw new Error(error.message || "Could not send the password reset email.");
    return { sent: true };
  }

  async function resendConfirmation(email, redirectTo) {
    if (!configured) throw new Error("Supabase auth is not configured.");
    const { error } = await client.auth.resend({ type: "signup", email: String(email || "").trim(), options: { emailRedirectTo: redirectTo } });
    if (error) throw new Error(error.message || "Could not resend the confirmation email.");
    return { sent: true };
  }

  async function startOAuth(provider, redirectTo) {
    if (!configured) throw new Error("Supabase auth is not configured.");
    const { data, error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect: true } });
    if (error) throw new Error(error.message || "Could not start the provider sign-in.");
    if (!data?.url) throw new Error("The provider did not return a sign-in URL.");
    return data.url;
  }

  async function updatePassword(password) {
    if (!configured) throw new Error("Supabase auth is not configured.");
    const { data, error } = await client.auth.updateUser({ password: String(password || "") });
    if (error) throw new Error(error.message || "Could not update the password.");
    if (data?.user) {
      state = { ...state, user: { id: data.user.id, email: data.user.email || "", displayName: data.user.user_metadata?.full_name || "" } };
    }
    return publicState();
  }

  async function updateProfile(displayName) {
    if (!configured) throw new Error("Supabase auth is not configured.");
    const name = String(displayName || "").trim().slice(0, 80);
    if (!name) throw new Error("A display name is required.");
    const { data, error } = await client.auth.updateUser({ data: { full_name: name } });
    if (error) throw new Error(error.message || "Could not update the profile.");
    if (data?.user) state = { ...state, user: { ...state.user, displayName: name } };
    return publicState();
  }

  function setProviders(next = {}) {
    providers = { email: next.email !== false, google: Boolean(next.google), magicLink: Boolean(next.magicLink) };
    state = { ...state, providers };
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

  return { initialize, signIn, signUp, signOut, state: publicState, accessToken, setSession, setProviders, sendMagicLink, sendPasswordReset, resendConfirmation, startOAuth, updatePassword, updateProfile };
}

module.exports = { createSupabaseAuth, SESSION_FILE };
