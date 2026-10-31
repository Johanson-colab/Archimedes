const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { createSupabaseServer } = require("./supabase-server.cjs");

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
  return body.access_token;
}

test("two Supabase users can share a project through the API", { skip: !enabled }, async () => {
  const app = createSupabaseServer({ supabaseUrl: config.url, publishableKey: config.publishableKey });
  const address = await app.listen(0, "127.0.0.1");
  const base = `http://127.0.0.1:${address.port}`;
  const first = await signIn(email, password);
  const second = await signIn(email2, password2);
  const call = async (token, route, method = "GET", body) => {
    const response = await fetch(`${base}${route}`, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  try {
    const created = await call(first, "/v1/projects", "POST", { name: `Collaboration test ${Date.now()}`, description: "Live API verification" });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const projectId = created.body.project.id;
    assert.equal(created.body.project.role, "owner");

    const added = await call(first, `/v1/projects/${projectId}/members`, "POST", { email: email2, role: "editor" });
    assert.equal(added.status, 201, JSON.stringify(added.body));
    assert.equal(added.body.members.length, 2);

    const projects = await call(second, "/v1/projects");
    assert.equal(projects.status, 200);
    assert.ok(projects.body.projects.some((project) => project.id === projectId));

    const members = await call(second, `/v1/projects/${projectId}/members`);
    assert.equal(members.status, 200);
    assert.equal(members.body.members.length, 2);

    const forbidden = await call(second, `/v1/projects/${projectId}/members`, "POST", { email, role: "viewer" });
    assert.equal(forbidden.status, 403);
  } finally {
    await app.close();
  }
});
