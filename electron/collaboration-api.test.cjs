const assert = require("node:assert/strict");
const test = require("node:test");
const { createCollaborationApi } = require("./collaboration-api.cjs");

function fakeApi(handler) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const result = handler(url, options);
    return { ok: result.status >= 200 && result.status < 300, status: result.status, json: async () => result.body };
  };
  return { calls, fetchImpl };
}

test("collaboration API sends the user token and maps project/member routes", async () => {
  const fake = fakeApi((url, options) => {
    if (url.endsWith("/v1/me")) return { status: 200, body: { user: { id: "user-1", email: "a@example.com" } } };
    if (url.endsWith("/v1/projects") && options.method === "GET") return { status: 200, body: { projects: [{ id: "p1" }] } };
    if (url.endsWith("/v1/projects") && options.method === "POST") return { status: 201, body: { project: { id: "p2" } } };
    if (url.endsWith("/members") && options.method === "POST") return { status: 201, body: { members: [{ user_id: "u2" }] } };
    if (url.endsWith("/members/u2") && options.method === "PATCH") return { status: 200, body: { members: [{ user_id: "u2", role: "editor" }] } };
    if (url.endsWith("/members/u2") && options.method === "DELETE") return { status: 200, body: { members: [] } };
    return { status: 404, body: { error: "missing" } };
  });
  const api = createCollaborationApi({ baseUrl: "http://127.0.0.1:9", getToken: async () => "jwt-token", fetchImpl: fake.fetchImpl });

  assert.equal((await api.status()).signedIn, true);
  assert.deepEqual(await api.listProjects(), [{ id: "p1" }]);
  assert.deepEqual(await api.createProject({ name: "Shared" }), { id: "p2" });
  assert.deepEqual(await api.addMember("p1", { email: "b@example.com", role: "editor" }), [{ user_id: "u2" }]);
  assert.deepEqual(await api.updateMember("p1", "u2", "editor"), [{ user_id: "u2", role: "editor" }]);
  assert.deepEqual(await api.removeMember("p1", "u2"), []);

  assert.equal(fake.calls[0].options.headers.authorization, "Bearer jwt-token");
  assert.equal(fake.calls[2].options.body, JSON.stringify({ name: "Shared", description: "" }));
  assert.match(fake.calls[3].url, /\/v1\/projects\/p1\/members$/);
  assert.match(fake.calls[4].url, /\/v1\/projects\/p1\/members\/u2$/);
});

test("collaboration API maps library and paper routes", async () => {
  const fake = fakeApi((url, options) => {
    if (url.endsWith("/libraries") && options.method === "POST") return { status: 201, body: { library: { id: "lib1" } } };
    if (url.endsWith("/libraries")) return { status: 200, body: { libraries: [{ id: "lib1" }] } };
    if (url.endsWith("/libraries/lib1")) return { status: 200, body: { library: { id: "lib1", name: "Renamed" } } };
    if (url.endsWith("/libraries/lib1/papers") && options.method === "POST") return { status: 201, body: { paper: { id: "paper1" } } };
    if (url.endsWith("/libraries/lib1/papers")) return { status: 200, body: { papers: [{ id: "paper1" }] } };
    if (url.endsWith("/libraries/lib1/papers/paper1")) return { status: 200, body: { removed: true } };
    if (url.endsWith("/papers/paper1")) return { status: 200, body: { state: { reading_status: "read" } } };
    return { status: 404, body: { error: "missing" } };
  });
  const api = createCollaborationApi({ baseUrl: "http://127.0.0.1:9", getToken: async () => "jwt", fetchImpl: fake.fetchImpl });

  assert.deepEqual(await api.listLibraries("p1"), [{ id: "lib1" }]);
  assert.deepEqual(await api.createLibrary("p1", { name: "Shared" }), { id: "lib1" });
  assert.deepEqual(await api.addPaper("lib1", { canonical_key: "k", title: "Paper" }), { id: "paper1" });
  assert.deepEqual(await api.listPapers("lib1"), [{ id: "paper1" }]);
  assert.deepEqual(await api.updatePaperState("paper1", { reading_status: "read" }), { reading_status: "read" });
  assert.deepEqual(await api.removePaper("lib1", "paper1"), { removed: true });
  assert.equal(fake.calls.find((call) => call.url.endsWith("/libraries/lib1/papers") && call.options.method === "POST").options.body, JSON.stringify({ paper: { canonical_key: "k", title: "Paper" } }));
});

test("collaboration API maps highlights, reviews, and presentations", async () => {
  const fake = fakeApi((url, options) => {
    if (url.includes("/highlights") && options.method === "POST") return { status: 201, body: { highlight: { id: "h1" } } };
    if (url.includes("/highlights") && options.method === "DELETE") return { status: 200, body: { deleted: true } };
    if (url.includes("/highlights")) return { status: 200, body: { highlights: [{ id: "h1" }] } };
    if (url.endsWith("/review") && options.method === "PUT") return { status: 200, body: { review: { id: "r1" } } };
    if (url.endsWith("/review")) return { status: 200, body: { review: { id: "r1" } } };
    if (url.endsWith("/presentation") && options.method === "PUT") return { status: 200, body: { presentation: { id: "p1" } } };
    if (url.endsWith("/presentation")) return { status: 200, body: { presentation: { id: "p1" } } };
    return { status: 404, body: { error: "missing" } };
  });
  const api = createCollaborationApi({ baseUrl: "http://127.0.0.1:9", getToken: async () => "jwt", fetchImpl: fake.fetchImpl });

  assert.deepEqual(await api.listHighlights("p1"), [{ id: "h1" }]);
  assert.deepEqual(await api.addHighlight("p1", { paper_id: "paper", page_number: 1, quote: "q" }), { id: "h1" });
  assert.deepEqual(await api.deleteHighlight("h1"), { deleted: true });
  assert.deepEqual(await api.getReview("p1", "paper"), { id: "r1" });
  assert.deepEqual(await api.saveReview("p1", "paper", { summary: {} }, "project"), { id: "r1" });
  assert.deepEqual(await api.getPresentation("p1", "paper"), { id: "p1" });
  assert.deepEqual(await api.savePresentation("p1", "paper", { title: "Deck" }, { visibility: "project" }), { id: "p1" });
});

test("collaboration API requires sign-in and surfaces API errors", async () => {
  const api = createCollaborationApi({ baseUrl: "http://127.0.0.1:9", getToken: async () => null, fetchImpl: async () => { throw new Error("should not fetch"); } });
  await assert.rejects(() => api.listProjects(), /Sign in/i);

  const fake = fakeApi(() => ({ status: 403, body: { error: "You do not have permission to add project members." } }));
  const forbidden = createCollaborationApi({ baseUrl: "http://127.0.0.1:9", getToken: async () => "jwt", fetchImpl: fake.fetchImpl });
  await assert.rejects(() => forbidden.addMember("p1", { email: "x@example.com" }), /permission/i);
});
