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

test("collaboration API maps thread, turn, event, and comment routes", async () => {
  const fake = fakeApi((url, options) => {
    if (url.endsWith("/threads") && options.method === "POST") return { status: 201, body: { thread: { id: "t1" } } };
    if (url.endsWith("/threads")) return { status: 200, body: { threads: [{ id: "t1" }] } };
    if (url.endsWith("/threads/t1") && options.method === "PATCH") return { status: 200, body: { thread: { id: "t1", title: "Renamed" } } };
    if (url.endsWith("/threads/t1")) return { status: 200, body: { thread: { id: "t1" }, turns: [], events: [] } };
    if (url.endsWith("/turns")) return { status: 201, body: { turn: { id: "turn1" } } };
    if (url.endsWith("/events")) return { status: 201, body: { events: [{ id: "e1" }] } };
    if (url.endsWith("/comments") && options.method === "POST") return { status: 201, body: { comment: { id: "c1" } } };
    if (url.includes("/comments?")) return { status: 200, body: { comments: [{ id: "c1" }] } };
    if (url.endsWith("/comments/c1")) return { status: 200, body: { comment: { id: "c1" } } };
    return { status: 404, body: { error: "missing" } };
  });
  const api = createCollaborationApi({ baseUrl: "http://127.0.0.1:9", getToken: async () => "jwt", fetchImpl: fake.fetchImpl });

  assert.deepEqual(await api.listThreads("p1"), [{ id: "t1" }]);
  assert.deepEqual(await api.saveThread("p1", { title: "Thread" }), { id: "t1" });
  assert.equal((await api.getThread("t1")).thread.id, "t1");
  assert.deepEqual(await api.updateThread("t1", { title: "Renamed" }), { id: "t1", title: "Renamed" });
  assert.deepEqual(await api.saveTurn("t1", { user_message: "Hi" }), { id: "turn1" });
  assert.deepEqual(await api.saveEvents("t1", [{ id: "e1" }]), [{ id: "e1" }]);
  assert.deepEqual(await api.listComments("p1", { resourceType: "thread", resourceId: "t1" }), [{ id: "c1" }]);
  assert.deepEqual(await api.saveComment("p1", { body: "Hi" }), { id: "c1" });
  assert.deepEqual(await api.updateComment("c1", { resolved_at: "now" }), { id: "c1" });
});

test("collaboration API creates, redeems, and revokes guest share links", async () => {
  const fake = fakeApi((url, options) => {
    if (url.endsWith("/share-links") && options.method === "POST") return { status: 201, body: { share: { id: "s1", token: "tok", url: "archimedes://share/tok" } } };
    if (url.includes("/v1/public/shares/tok")) return { status: 200, body: { share: { id: "s1", thread: { title: "Shared" } } } };
    if (url.endsWith("/share-links/s1") && options.method === "DELETE") return { status: 200, body: { revoked: true } };
    return { status: 404, body: { error: "missing" } };
  });
  const api = createCollaborationApi({ baseUrl: "http://127.0.0.1:9", getToken: async () => "jwt", fetchImpl: fake.fetchImpl });
  assert.equal((await api.createShareLink("p1", { resourceType: "thread", resourceId: "t1" })).id, "s1");
  assert.equal((await api.redeemShareLink("tok")).thread.title, "Shared");
  assert.deepEqual(await api.revokeShareLink("s1"), { revoked: true });
  assert.equal(fake.calls.find((call) => call.url.includes("/v1/public/shares/tok")).options, undefined);
});

test("collaboration API maps CRDT shared document reads and updates", async () => {
  const fake = fakeApi((url, options) => {
    if (url.includes("/documents/project-notes") && options.method === "POST") return { status: 200, body: { document: { key: "project-notes", state: "c3RhdGU=", version: 2 } } };
    if (url.includes("/documents/project-notes")) return { status: 200, body: { document: { key: "project-notes", state: "c3RhdGU=", version: 1 } } };
    return { status: 404, body: { error: "missing" } };
  });
  const api = createCollaborationApi({ baseUrl: "http://127.0.0.1:9", getToken: async () => "jwt", fetchImpl: fake.fetchImpl });
  assert.equal((await api.getSharedDocument("p1", "project-notes")).version, 1);
  assert.equal((await api.applySharedDocumentUpdate("p1", "project-notes", "dXBkYXRl")).version, 2);
});

test("collaboration API maps shared agent-run controls", async () => {
  const fake = fakeApi((url, options) => {
    if (url.endsWith("/runs") && options.method === "POST") return { status: 201, body: { run: { id: "run1" } } };
    if (url.endsWith("/runs")) return { status: 200, body: { runs: [{ id: "run1" }] } };
    if (url.endsWith("/join")) return { status: 200, body: { run: { id: "run1" } } };
    if (url.endsWith("/prompts") && options.method === "POST") return { status: 201, body: { run: { id: "run1" } } };
    if (url.endsWith("/prompts/claim")) return { status: 200, body: { prompt: { id: "q1", body: "Check" } } };
    if (url.endsWith("/runs/run1") && options.method === "PATCH") return { status: 200, body: { run: { id: "run1", status: "completed" } } };
    if (url.endsWith("/agent-actions") && options.method === "POST") return { status: 201, body: { action: { id: "a1" } } };
    if (url.endsWith("/agent-actions/a1")) return { status: 200, body: { resolved: true } };
    return { status: 404, body: { error: "missing" } };
  });
  const api = createCollaborationApi({ baseUrl: "http://127.0.0.1:9", getToken: async () => "jwt", fetchImpl: fake.fetchImpl });
  assert.deepEqual(await api.listAgentRuns("p1"), [{ id: "run1" }]);
  assert.deepEqual(await api.startAgentRun("p1", "t1"), { id: "run1" });
  assert.deepEqual(await api.joinAgentRun("run1", "co_prompt"), { id: "run1" });
  assert.deepEqual(await api.enqueueAgentPrompt("run1", "Check"), { id: "run1" });
  assert.deepEqual(await api.claimAgentPrompt("run1"), { id: "q1", body: "Check" });
  assert.deepEqual(await api.finishAgentRun("run1", "completed"), { id: "run1", status: "completed" });
  assert.deepEqual(await api.requestAgentAction("p1", { kind: "write" }), { id: "a1" });
  assert.deepEqual(await api.resolveAgentAction("a1", true), { resolved: true });
});

test("collaboration API requires sign-in and surfaces API errors", async () => {
  const api = createCollaborationApi({ baseUrl: "http://127.0.0.1:9", getToken: async () => null, fetchImpl: async () => { throw new Error("should not fetch"); } });
  await assert.rejects(() => api.listProjects(), /Sign in/i);

  const fake = fakeApi(() => ({ status: 403, body: { error: "You do not have permission to add project members." } }));
  const forbidden = createCollaborationApi({ baseUrl: "http://127.0.0.1:9", getToken: async () => "jwt", fetchImpl: fake.fetchImpl });
  await assert.rejects(() => forbidden.addMember("p1", { email: "x@example.com" }), /permission/i);
});
