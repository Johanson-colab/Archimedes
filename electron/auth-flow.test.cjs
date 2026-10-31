const assert = require("node:assert/strict");
const test = require("node:test");
const { createAuthFlow } = require("./auth-flow.cjs");

function fakeClient(session = { access_token: "access", refresh_token: "refresh", user: { id: "u1", email: "a@example.com" } }) {
  return {
    auth: {
      async exchangeCodeForSession(code) {
        assert.equal(code, "callback-code");
        return { data: { session }, error: null };
      },
    },
  };
}

test("auth flow opens the system browser and exchanges the loopback code", async () => {
  let redirectTo = "";
  const flow = createAuthFlow({
    client: fakeClient(),
    port: 0,
    openExternal: async (url) => {
      assert.match(url, /^https:\/\/provider\.example\/authorize/);
      const response = await fetch(`${redirectTo}?code=callback-code`);
      assert.equal(response.status, 200);
    },
  });
  const result = await flow.run({
    mode: "signin",
    trigger: async (url) => { redirectTo = url; return { url: "https://provider.example/authorize" }; },
  });
  assert.equal(result.session.access_token, "access");
  assert.equal(result.flow, "signin");
  assert.match(redirectTo, /^http:\/\/127\.0\.0\.1:\d+\/auth\/callback$/);
});

test("auth flow can return a session immediately when confirmation is disabled", async () => {
  let opened = false;
  const flow = createAuthFlow({ client: fakeClient(), port: 0, openExternal: async () => { opened = true; } });
  const result = await flow.run({
    mode: "signup",
    trigger: async () => ({ session: { access_token: "direct", refresh_token: "refresh" } }),
  });
  assert.equal(result.session.access_token, "direct");
  assert.equal(opened, false);
});

test("auth flow reports browser errors and closes the loopback server", async () => {
  let redirectTo = "";
  const flow = createAuthFlow({
    client: fakeClient(),
    port: 0,
    openExternal: async () => { await fetch(`${redirectTo}?error=access_denied&error_description=Denied`); },
  });
  await assert.rejects(() => flow.run({
    mode: "recovery",
    trigger: async (url) => { redirectTo = url; return { url: "https://provider.example/authorize" }; },
  }), /Denied/);
  assert.match(redirectTo, /\/auth\/recovery$/);
});
