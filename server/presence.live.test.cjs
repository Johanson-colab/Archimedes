const assert = require("node:assert/strict");
const test = require("node:test");
const { createClient } = require("@supabase/supabase-js");
const { createPresence } = require("../electron/presence.cjs");
const config = require("../shared/supabase-config.json");

const email = process.env.SUPABASE_TEST_EMAIL;
const password = process.env.SUPABASE_TEST_PASSWORD;
const email2 = process.env.SUPABASE_TEST_EMAIL_2;
const password2 = process.env.SUPABASE_TEST_PASSWORD_2;
const enabled = Boolean(email && password && email2 && password2 && process.env.SUPABASE_LIVE_TESTS === "1");

async function signIn(address, pass) {
  const response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: config.publishableKey, "content-type": "application/json" },
    body: JSON.stringify({ email: address, password: pass }),
  });
  const body = await response.json();
  assert.equal(response.status, 200, body.msg || body.error_description || "sign-in failed");
  return body;
}

function waitFor(predicate, timeoutMs = 12_000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (predicate()) { clearInterval(timer); resolve(); }
      else if (Date.now() - started > timeoutMs) { clearInterval(timer); reject(new Error("Timed out waiting for presence.")); }
    }, 200);
  });
}

test("two signed-in users see each other on a Realtime project channel", { skip: !enabled }, async () => {
  const first = await signIn(email, password);
  const second = await signIn(email2, password2);
  const projectId = `smoke-presence-${Date.now()}`;
  const a = createPresence({ createClient, supabaseUrl: config.url, publishableKey: config.publishableKey, getToken: async () => first.access_token });
  const b = createPresence({ createClient, supabaseUrl: config.url, publishableKey: config.publishableKey, getToken: async () => second.access_token });
  let aMembers = [];
  let bMembers = [];
  try {
    await a.join("a", projectId, { userId: first.user.id, displayName: "Test One", email }, (members) => { aMembers = members; });
    await b.join("b", projectId, { userId: second.user.id, displayName: "Test Two", email: email2 }, (members) => { bMembers = members; });
    await waitFor(() => aMembers.length >= 2 && bMembers.length >= 2);
    assert.ok(aMembers.some((member) => member.userId === first.user.id));
    assert.ok(aMembers.some((member) => member.userId === second.user.id));
    await a.update("a", { thread_id: "thread-smoke" });
    await waitFor(() => bMembers.some((member) => member.userId === first.user.id && member.threadId === "thread-smoke"));
  } finally {
    await a.closeAll();
    await b.closeAll();
  }
});
