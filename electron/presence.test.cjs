const assert = require("node:assert/strict");
const test = require("node:test");
const { createPresence } = require("./presence.cjs");

function fakeClient() {
  const channels = [];
  const client = {
    channels,
    channel(name, options) {
      const handlers = {};
      const channel = {
        name,
        options,
        subscribed: false,
        tracked: [],
        presenceState() {
          return { a: [{ user_id: "u1", display_name: "Ada", presence_ref: "ref-1", email: "ada@example.com", thread_id: "t1" }] };
        },
        on(type, filter, handler) { handlers[type] = handler; return channel; },
        subscribe(callback) { channel.subscribed = true; callback("SUBSCRIBED"); return channel; },
        async track(data) { channel.tracked.push(data); },
        async unsubscribe() { channel.subscribed = false; },
        emitSync() { handlers.presence?.(); },
      };
      channels.push(channel);
      return channel;
    },
    removeChannel() {},
  };
  return client;
}

test("presence joins a project channel, tracks collaborators, and leaves", async () => {
  const client = fakeClient();
  const updates = [];
  const presence = createPresence({
    createClient: () => client,
    supabaseUrl: "https://example.supabase.co",
    publishableKey: "key",
    getToken: async () => "jwt",
  });
  await presence.join("window-1", "project-1", { userId: "u1", displayName: "Ada", email: "ada@example.com", threadId: "thread-1" }, (members) => updates.push(members));
  const channel = client.channels[0];
  assert.equal(channel.name, "project:project-1");
  assert.equal(channel.subscribed, true);
  assert.equal(channel.tracked[0].user_id, "u1");
  assert.equal(channel.tracked[0].thread_id, "thread-1");
  channel.emitSync();
  assert.deepEqual(updates[0], [{ key: "ref-1", userId: "u1", displayName: "Ada", email: "ada@example.com", threadId: "t1", onlineAt: "" }]);
  await presence.update("window-1", { thread_id: "thread-2" });
  assert.equal(channel.tracked[1].thread_id, "thread-2");
  await presence.leave("window-1");
  assert.equal(channel.subscribed, false);
});

test("presence requires a signed-in token", async () => {
  const client = fakeClient();
  const presence = createPresence({ createClient: () => client, supabaseUrl: "https://example.supabase.co", publishableKey: "key", getToken: async () => null });
  await assert.rejects(() => presence.join("w", "p", { userId: "u" }), /Sign in/);
});
