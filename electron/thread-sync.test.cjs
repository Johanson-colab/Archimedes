const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const store = require("./store.cjs");
const { createThreadSync } = require("./thread-sync.cjs");

function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-thread-sync-"));
  store.setLocalIdentity({ userId: "usr_local_owner", displayName: "Local Owner", deviceId: "dev", deviceName: "Test" });
  store.openWorkspace(root);
  const project = store.createResearchProject({ name: "Thread project" });
  store.linkResearchProjectToCloud(project.id, "cloud-project");
  return { root, project };
}

function fakeApi() {
  const threads = new Map();
  const comments = [];
  return {
    threads,
    comments,
    async listThreads() { return [...threads.values()].map((entry) => entry.thread); },
    async saveThread(_projectId, thread) {
      const existing = threads.get(thread.id);
      const row = { ...thread, owner_id: "cloud-user", created_at: thread.created_at || new Date().toISOString(), updated_at: new Date().toISOString() };
      threads.set(thread.id, { thread: row, turns: existing?.turns || [], events: existing?.events || [] });
      return row;
    },
    async getThread(threadId) {
      const entry = threads.get(threadId);
      if (!entry) throw new Error("Thread not found.");
      return { thread: entry.thread, turns: entry.turns, events: entry.events };
    },
    async saveTurn(threadId, turn) {
      const entry = threads.get(threadId);
      entry.turns.push({ ...turn, thread_id: threadId, author_id: "cloud-user" });
      return turn;
    },
    async saveEvents(threadId, events) {
      const entry = threads.get(threadId);
      entry.events.push(...events.map((event) => ({ ...event, thread_id: threadId, actor_id: "cloud-user" })));
      return events;
    },
    async listComments() { return comments.map((comment) => ({ ...comment })); },
    async saveComment(_projectId, comment) {
      const row = { ...comment, author_id: "cloud-user", created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      comments.push(row);
      return row;
    },
    seedRemoteThread(threadId, title) {
      const now = new Date().toISOString();
      threads.set(threadId, {
        thread: { id: threadId, project_id: "cloud-project", owner_id: "other-user", visibility: "project", title, mode: "free-chat", status: "idle", context_summary: "", created_at: now, updated_at: now, archived_at: null },
        turns: [{ id: "remote-turn", thread_id: threadId, author_id: "other-user", mode: "free-chat", user_message: "Remote question", assistant_message: "Remote answer", status: "completed", created_at: now, completed_at: now }],
        events: [{ id: "remote-event", thread_id: threadId, turn_id: "remote-turn", sequence: 1, type: "assistant_message", payload: { text: "Remote answer" }, created_at: now }],
      });
      comments.push({ id: "remote-comment", project_id: "cloud-project", resource_type: "thread", resource_id: threadId, body: "Remote comment", author_id: "other-user", anchor_json: {}, created_at: now, updated_at: now, resolved_at: null });
    },
  };
}

test("thread sync pushes local threads, turns, events, comments and pulls shared ones", async () => {
  const { root, project } = workspace();
  try {
    const thread = store.createResearchThread({ prompt: "Local question", mode: "free-chat", projectId: project.id });
    const turn = store.startResearchTurn({ threadId: thread.id, taskId: null, prompt: "Local question", mode: "free-chat" });
    store.appendResearchEvent({ threadId: thread.id, turnId: turn.id, type: "tool_result", payload: { name: "test" } });
    store.finishResearchTurn(turn.id, { response: "Local answer" });
    store.createComment({ projectId: project.id, resourceType: "thread", resourceId: thread.id, body: "Local comment" });

    const api = fakeApi();
    api.seedRemoteThread("remote-thread", "Remote shared thread");
    const sync = createThreadSync({ store, api });
    const result = await sync.syncProjectThreads(project.id, { currentCloudUserId: "cloud-user", localUserId: "usr_local_owner" });
    assert.deepEqual(result.warnings, []);
    assert.ok(api.threads.get(thread.id));
    assert.equal(api.threads.get(thread.id).turns.length, 1);
    assert.equal(api.threads.get(thread.id).events.length, 3);
    assert.ok(api.comments.some((comment) => comment.id && comment.body === "Local comment"));

    const imported = store.getResearchThread("remote-thread");
    assert.equal(imported.title, "Remote shared thread");
    assert.equal(imported.turns[0].user_message, "Remote question");
    assert.equal(imported.events[0].type, "assistant_message");
    assert.ok(store.listProjectComments(project.id, { resourceType: "thread", resourceId: "remote-thread" }).some((comment) => comment.id === "remote-comment"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("thread sync requires a shared project", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-thread-guard-"));
  try {
    store.setLocalIdentity({ userId: "usr_local_owner", displayName: "Local Owner", deviceId: "dev", deviceName: "Test" });
    store.openWorkspace(root);
    const project = store.createResearchProject({ name: "Private" });
    const sync = createThreadSync({ store, api: fakeApi() });
    await assert.rejects(() => sync.syncProjectThreads(project.id, { localUserId: "usr_local_owner" }), /Share this project/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
