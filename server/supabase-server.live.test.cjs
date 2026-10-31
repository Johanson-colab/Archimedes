const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const Y = require("yjs");
const { createSupabaseServer } = require("./supabase-server.cjs");

const config = require("../shared/supabase-config.json");
const email = process.env.SUPABASE_TEST_EMAIL;
const password = process.env.SUPABASE_TEST_PASSWORD;
const email2 = process.env.SUPABASE_TEST_EMAIL_2;
const password2 = process.env.SUPABASE_TEST_PASSWORD_2;
const enabled = Boolean(email && password && email2 && password2 && process.env.SUPABASE_LIVE_TESTS === "1");

function encodeUpdate(doc) {
  return Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64");
}

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

    const library = await call(first, `/v1/projects/${projectId}/libraries`, "POST", { name: "Shared sources" });
    assert.equal(library.status, 201, JSON.stringify(library.body));
    const canonicalKey = `smoke:${Date.now()}`;
    const addedPaper = await call(first, `/v1/libraries/${library.body.library.id}/papers`, "POST", {
      paper: { canonical_key: canonicalKey, title: "Smoke test paper", authors: ["Ada Lovelace"], year: 2026 },
    });
    assert.equal(addedPaper.status, 201, JSON.stringify(addedPaper.body));
    const refreshedLibraries = await call(first, `/v1/projects/${projectId}/libraries`);
    assert.equal(refreshedLibraries.body.libraries.find((candidate) => candidate.id === library.body.library.id).paper_count, 1);
    const secondLibraries = await call(second, `/v1/projects/${projectId}/libraries`);
    assert.equal(secondLibraries.status, 200);
    assert.ok(secondLibraries.body.libraries.some((candidate) => candidate.id === library.body.library.id));
    const secondPapers = await call(second, `/v1/libraries/${library.body.library.id}/papers`);
    assert.equal(secondPapers.status, 200);
    assert.equal(secondPapers.body.papers[0].title, "Smoke test paper");
    const state = await call(second, `/v1/papers/${addedPaper.body.paper.id}`, "PATCH", { reading_status: "read", starred: true, tags: ["smoke"] });
    assert.equal(state.status, 200, JSON.stringify(state.body));
    assert.equal(state.body.state.reading_status, "read");

    const highlight = await call(first, `/v1/projects/${projectId}/highlights`, "POST", {
      paper_id: addedPaper.body.paper.id, page_number: 1, quote: "A shared quote", color: "yellow", visibility: "project",
    });
    assert.equal(highlight.status, 201, JSON.stringify(highlight.body));
    const highlightsForSecond = await call(second, `/v1/projects/${projectId}/highlights?paperId=${addedPaper.body.paper.id}`);
    assert.equal(highlightsForSecond.status, 200);
    assert.equal(highlightsForSecond.body.highlights[0].quote, "A shared quote");

    const review = await call(second, `/v1/projects/${projectId}/papers/${addedPaper.body.paper.id}/review`, "PUT", {
      review: { specialists: [{ id: "related", status: "complete", response: "ok" }], supervisor: { reason: "ok" }, summary: { response: "Summary" } },
      visibility: "project",
    });
    assert.equal(review.status, 200, JSON.stringify(review.body));
    const reviewForFirst = await call(first, `/v1/projects/${projectId}/papers/${addedPaper.body.paper.id}/review`);
    assert.equal(reviewForFirst.status, 200);
    assert.equal(reviewForFirst.body.review.review_json.summary.response, "Summary");

    const presentation = await call(second, `/v1/projects/${projectId}/papers/${addedPaper.body.paper.id}/presentation`, "PUT", {
      presentation: { title: "Shared deck", slides: [] },
      visibility: "project",
      source_review_updated_at: "2026-01-01T00:00:00.000Z",
    });
    assert.equal(presentation.status, 200, JSON.stringify(presentation.body));
    const presentationForFirst = await call(first, `/v1/projects/${projectId}/papers/${addedPaper.body.paper.id}/presentation`);
    assert.equal(presentationForFirst.status, 200);
    assert.equal(presentationForFirst.body.presentation.presentation_json.title, "Shared deck");

    const thread = await call(first, `/v1/projects/${projectId}/threads`, "POST", { title: "Shared thread", mode: "free-chat", visibility: "project" });
    assert.equal(thread.status, 201, JSON.stringify(thread.body));
    const turn = await call(first, `/v1/threads/${thread.body.thread.id}/turns`, "POST", { mode: "free-chat", user_message: "Hello", assistant_message: "Hi", status: "completed" });
    assert.equal(turn.status, 201, JSON.stringify(turn.body));
    const event = await call(first, `/v1/threads/${thread.body.thread.id}/events`, "POST", { turn_id: turn.body.turn.id, sequence: 1, type: "assistant_delta", payload: { text: "Hi" } });
    assert.equal(event.status, 201, JSON.stringify(event.body));
    const threadForSecond = await call(second, `/v1/threads/${thread.body.thread.id}`);
    assert.equal(threadForSecond.status, 200);
    assert.equal(threadForSecond.body.turns[0].user_message, "Hello");
    assert.equal(threadForSecond.body.events[0].type, "assistant_delta");
    const renamed = await call(second, `/v1/threads/${thread.body.thread.id}`, "PATCH", { title: "Shared thread edited" });
    assert.equal(renamed.status, 200);
    const comment = await call(second, `/v1/projects/${projectId}/comments`, "POST", { resource_type: "thread", resource_id: thread.body.thread.id, body: "Looks good" });
    assert.equal(comment.status, 201, JSON.stringify(comment.body));
    const commentsForFirst = await call(first, `/v1/projects/${projectId}/comments?resourceType=thread&resourceId=${thread.body.thread.id}`);
    assert.equal(commentsForFirst.status, 200);
    assert.equal(commentsForFirst.body.comments[0].body, "Looks good");
    const resolved = await call(second, `/v1/comments/${comment.body.comment.id}`, "PATCH", { resolved_at: new Date().toISOString() });
    assert.equal(resolved.status, 200);

    const emptyDocument = await call(first, `/v1/projects/${projectId}/documents/project-notes`);
    assert.equal(emptyDocument.status, 200);
    assert.equal(emptyDocument.body.document, null);
    const firstDoc = new Y.Doc();
    firstDoc.getText("text").insert(0, "Hello");
    const firstUpdate = await call(first, `/v1/projects/${projectId}/documents/project-notes`, "POST", { update: encodeUpdate(firstDoc) });
    assert.equal(firstUpdate.status, 200, JSON.stringify(firstUpdate.body));
    const current = firstUpdate.body.document;
    const docA = new Y.Doc();
    Y.applyUpdate(docA, Buffer.from(current.state, "base64"));
    docA.getText("text").insert(5, " A");
    const docB = new Y.Doc();
    Y.applyUpdate(docB, Buffer.from(current.state, "base64"));
    docB.getText("text").insert(5, " B");
    const updateA = await call(first, `/v1/projects/${projectId}/documents/project-notes`, "POST", { update: encodeUpdate(docA) });
    assert.equal(updateA.status, 200, JSON.stringify(updateA.body));
    const updateB = await call(second, `/v1/projects/${projectId}/documents/project-notes`, "POST", { update: encodeUpdate(docB) });
    assert.equal(updateB.status, 200, JSON.stringify(updateB.body));
    const merged = await call(second, `/v1/projects/${projectId}/documents/project-notes`);
    const mergedDoc = new Y.Doc();
    Y.applyUpdate(mergedDoc, Buffer.from(merged.body.document.state, "base64"));
    assert.match(mergedDoc.getText("text").toString(), /A/);
    assert.match(mergedDoc.getText("text").toString(), /B/);

    const run = await call(first, `/v1/projects/${projectId}/runs`, "POST", { thread_id: thread.body.thread.id, context_manifest: { source: "smoke" } });
    assert.equal(run.status, 201, JSON.stringify(run.body));
    const joined = await call(second, `/v1/runs/${run.body.run.id}/join`, "POST", { role: "co_prompt" });
    assert.equal(joined.status, 200, JSON.stringify(joined.body));
    assert.equal(joined.body.run.participants.length, 2);
    const queued = await call(second, `/v1/runs/${run.body.run.id}/prompts`, "POST", { body: "Please check the baseline." });
    assert.equal(queued.status, 201, JSON.stringify(queued.body));
    const claimed = await call(first, `/v1/runs/${run.body.run.id}/prompts/claim`, "POST");
    assert.equal(claimed.status, 200);
    assert.equal(claimed.body.prompt.body, "Please check the baseline.");
    const action = await call(first, `/v1/projects/${projectId}/agent-actions`, "POST", { run_id: run.body.run.id, kind: "write", payload: { path: "notes.md" } });
    assert.equal(action.status, 201, JSON.stringify(action.body));
    const approved = await call(second, `/v1/agent-actions/${action.body.action.id}`, "PATCH", { approved: true });
    assert.equal(approved.status, 200);
    const finished = await call(first, `/v1/runs/${run.body.run.id}`, "PATCH", { status: "completed" });
    assert.equal(finished.status, 200);
    assert.equal(finished.body.run.status, "completed");

    const exported = await call(first, `/v1/projects/${projectId}/export`);
    assert.equal(exported.status, 200, JSON.stringify(exported.body));
    assert.equal(exported.body.export.project.id, projectId);
    assert.equal(exported.body.export.threads.length, 1);
    assert.equal(exported.body.export.turns.length, 1);
    const forbiddenExport = await call(second, `/v1/projects/${projectId}/export`);
    assert.equal(forbiddenExport.status, 403);

    const share = await call(first, `/v1/projects/${projectId}/share-links`, "POST", { resource_type: "thread", resource_id: thread.body.thread.id, role: "viewer", expires_in_days: 7 });
    assert.equal(share.status, 201, JSON.stringify(share.body));
    const guest = await fetch(`${base}/v1/public/shares/${encodeURIComponent(share.body.share.token)}`);
    assert.equal(guest.status, 200);
    const guestBody = await guest.json();
    assert.equal(guestBody.share.thread.title, "Shared thread edited");
    assert.equal(guestBody.share.turns[0].user_message, "Hello");
    const revoked = await call(first, `/v1/share-links/${share.body.share.id}`, "DELETE");
    assert.equal(revoked.status, 200);
    const expiredGuest = await fetch(`${base}/v1/public/shares/${encodeURIComponent(share.body.share.token)}`);
    assert.equal(expiredGuest.status, 404);

    const removeHighlight = await call(first, `/v1/highlights/${highlight.body.highlight.id}`, "DELETE");
    assert.equal(removeHighlight.status, 200);
    const removePaper = await call(first, `/v1/libraries/${library.body.library.id}/papers/${addedPaper.body.paper.id}`, "DELETE");
    assert.equal(removePaper.status, 200);
    const removeLibrary = await call(first, `/v1/libraries/${library.body.library.id}`, "DELETE");
    assert.equal(removeLibrary.status, 200);

    const forbidden = await call(second, `/v1/projects/${projectId}/members`, "POST", { email, role: "viewer" });
    assert.equal(forbidden.status, 403);

    const secondUser = added.body.members.find((member) => member.email === email2);
    assert.ok(secondUser);
    const promoted = await call(first, `/v1/projects/${projectId}/members/${secondUser.user_id}`, "PATCH", { role: "admin" });
    assert.equal(promoted.status, 200, JSON.stringify(promoted.body));
    assert.equal(promoted.body.members.find((member) => member.user_id === secondUser.user_id).role, "admin");

    const removed = await call(first, `/v1/projects/${projectId}/members/${secondUser.user_id}`, "DELETE");
    assert.equal(removed.status, 200, JSON.stringify(removed.body));
    assert.equal(removed.body.members.length, 1);
  } finally {
    await app.close();
  }
});
