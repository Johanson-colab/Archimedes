const assert = require("node:assert/strict");
const test = require("node:test");
const { createCollabServer } = require("./collab-server.cjs");

async function start() {
  const app = createCollabServer({ dbPath: ":memory:", devAuth: true });
  const address = await app.listen(0, "127.0.0.1");
  const base = `http://127.0.0.1:${address.port}`;
  return { app, base };
}

async function request(base, path, { token, method = "GET", body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function session(base, email, displayName) {
  const result = await request(base, "/v1/dev-session", { method: "POST", body: { email, displayName } });
  assert.equal(result.status, 201);
  return result.body;
}

test("server enforces project membership and comment roles", async () => {
  const { app, base } = await start();
  try {
    const alice = await session(base, "alice@example.com", "Alice");
    const bob = await session(base, "bob@example.com", "Bob");
    const project = await request(base, "/v1/projects", { token: alice.token, method: "POST", body: { name: "Retrieval" } });
    assert.equal(project.status, 201);
    const projectId = project.body.project.id;

    const added = await request(base, `/v1/projects/${projectId}/members`, { token: alice.token, method: "POST", body: { email: "bob@example.com", role: "commenter" } });
    assert.equal(added.status, 201);
    assert.equal(added.body.member.role, "commenter");

    const bobProjects = await request(base, "/v1/projects", { token: bob.token });
    assert.equal(bobProjects.status, 200);
    assert.equal(bobProjects.body.projects[0].id, projectId);

    const comment = await request(base, `/v1/projects/${projectId}/comments`, { token: bob.token, method: "POST", body: { resourceType: "thread", resourceId: "thread-1", body: "Please verify the 4k result." } });
    assert.equal(comment.status, 201);
    const resolved = await request(base, `/v1/comments/${comment.body.comment.id}`, { token: bob.token, method: "PATCH", body: { resolved: true } });
    assert.equal(resolved.status, 200);

    const forbidden = await request(base, `/v1/projects/${projectId}/members`, { token: bob.token, method: "POST", body: { email: "carol@example.com", role: "viewer" } });
    assert.equal(forbidden.status, 403);

    const snapshotDenied = await request(base, `/v1/projects/${projectId}/threads/thread-1/snapshots`, { token: bob.token, method: "POST", body: { manifest: { version: 1 } } });
    assert.equal(snapshotDenied.status, 403);

    const snapshot = await request(base, `/v1/projects/${projectId}/threads/thread-1/snapshots`, { token: alice.token, method: "POST", body: { sequence: 3, manifest: { version: 1, turns: [], events: [], references: [] } } });
    assert.equal(snapshot.status, 201);
    assert.equal(snapshot.body.snapshot.sequence, 3);

    const health = await request(base, "/health");
    assert.equal(health.status, 200);
    assert.equal(health.body.ok, true);
  } finally {
    await app.close();
  }
});

test("server rejects unauthenticated access and invalid project roles", async () => {
  const { app, base } = await start();
  try {
    const unauthenticated = await request(base, "/v1/projects");
    assert.equal(unauthenticated.status, 401);
    const alice = await session(base, "owner@example.com", "Owner");
    const project = await request(base, "/v1/projects", { token: alice.token, method: "POST", body: { name: "Project" } });
    const invalid = await request(base, `/v1/projects/${project.body.project.id}/members`, { token: alice.token, method: "POST", body: { email: "x@example.com", role: "owner" } });
    assert.equal(invalid.status, 400);
  } finally {
    await app.close();
  }
});
