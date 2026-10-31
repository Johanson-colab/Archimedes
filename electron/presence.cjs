const { randomUUID } = require("node:crypto");

function createPresence({ createClient, supabaseUrl, publishableKey, getToken } = {}) {
  if (typeof createClient !== "function" || !supabaseUrl || !publishableKey || typeof getToken !== "function") {
    throw new Error("Presence requires a Supabase client factory, URL, key, and token provider.");
  }
  const sessions = new Map();

  function flatten(state) {
    const members = [];
    for (const entries of Object.values(state || {})) {
      for (const entry of Array.isArray(entries) ? entries : []) {
        if (!entry?.user_id) continue;
        members.push({
          key: String(entry.presence_ref || entry.user_id),
          userId: String(entry.user_id),
          displayName: String(entry.display_name || entry.email || "Collaborator"),
          email: String(entry.email || ""),
          threadId: entry.thread_id ? String(entry.thread_id) : null,
          onlineAt: String(entry.online_at || ""),
        });
      }
    }
    return members.sort((left, right) => left.displayName.localeCompare(right.displayName));
  }

  async function leave(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return;
    sessions.delete(sessionId);
    try { await session.channel.unsubscribe(); } catch { /* already gone */ }
    try { session.client.removeChannel(session.channel); } catch { /* already gone */ }
  }

  async function join(sessionId, projectId, { userId, displayName = "", email = "", threadId = null } = {}, onUpdate = () => {}) {
    if (!projectId || !userId) throw new Error("A project and user are required for presence.");
    await leave(sessionId);
    const token = await getToken();
    if (!token) throw new Error("Sign in to see live collaborators.");
    const client = createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      accessToken: async () => token,
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const channel = client.channel(`project:${projectId}`, { config: { presence: { key: `${userId}:${randomUUID()}` } } });
    const session = { client, channel, projectId, payload: { user_id: userId, display_name: displayName, email, thread_id: threadId || null, online_at: new Date().toISOString() } };
    sessions.set(sessionId, session);

    channel.on("presence", { event: "sync" }, () => {
      try { onUpdate(flatten(channel.presenceState())); } catch { /* UI may be gone */ }
    });
    channel.subscribe(async (status) => {
      if (status !== "SUBSCRIBED") return;
      try { await channel.track(session.payload); } catch { /* presence is best effort */ }
    });
    return [];
  }

  async function update(sessionId, patch = {}) {
    const session = sessions.get(sessionId);
    if (!session) return;
    session.payload = { ...session.payload, ...patch, online_at: new Date().toISOString() };
    try { await session.channel.track(session.payload); } catch { /* presence is best effort */ }
  }

  async function closeAll() {
    await Promise.all([...sessions.keys()].map((sessionId) => leave(sessionId)));
  }

  return { join, update, leave, closeAll };
}

module.exports = { createPresence };
