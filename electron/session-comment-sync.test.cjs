const assert = require("node:assert/strict");
const test = require("node:test");
const { createThreadSync } = require("./thread-sync.cjs");

test("session sync pushes position anchors, pulls peer anchors, and updates resolution", async () => {
  const anchor = { type: "session-position", version: 1, y: 680, messageId: "message-a", offset: 20 };
  const local = { id: "local", author_id: "owner", resource_type: "thread", resource_id: "session", body: "Local note", anchor_json: JSON.stringify(anchor), updated_at: "2026-11-12T10:00:00Z", resolved_at: null };
  const remote = [{ id: "peer", resource_type: "thread", resource_id: "session", author_id: "peer-user", anchor_json: anchor }];
  const imported = [];
  const session = { id: "session", owner_id: "owner", updated_at: "2026-11-12T09:00:00Z" };
  const store = {
    getResearchProject: () => ({ id: "project", cloud_project_id: "cloud" }),
    listProjectThreadsForSync: () => [session],
    getResearchThread: () => ({ turns: [] }),
    listResearchThreadEvents: () => [],
    listProjectComments: () => [local],
    applyCloudComment: (_project, comment) => imported.push(comment),
  };
  const api = {
    saveThread: async () => session,
    getThread: async () => ({ turns: [], events: [] }),
    listThreads: async () => [session],
    listComments: async () => remote,
    saveComment: async (_project, comment) => remote.push({ ...comment, updated_at: "2026-11-12T10:00:00Z" }),
    updateComment: async (id, patch) => Object.assign(remote.find((comment) => comment.id === id), patch),
  };
  const sync = createThreadSync({ store, api });
  assert.deepEqual((await sync.syncProjectThreads("project", { localUserId: "owner" })).warnings, []);
  assert.deepEqual(remote.find((comment) => comment.id === "local").anchor, anchor);
  assert.deepEqual(imported.find((comment) => comment.id === "peer").anchor_json, anchor);
  local.resolved_at = "2026-11-12T11:00:00Z";
  local.updated_at = local.resolved_at;
  assert.deepEqual((await sync.syncProjectThreads("project", { localUserId: "owner" })).warnings, []);
  assert.equal(remote.find((comment) => comment.id === "local").resolved_at, local.resolved_at);
});
