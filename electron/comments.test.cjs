const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const store = require("./store.cjs");

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-comments-"));
  store.setLocalIdentity({ userId: "usr_commenter", displayName: "Commenter", deviceId: "dev", deviceName: "test" });
  const snapshot = store.openWorkspace(root);
  const project = snapshot.projects[0];
  const thread = store.createResearchThread({ prompt: "comment thread", mode: "free-chat", projectId: project.id });
  return { root, project, thread };
}

test("thread comments can be created, resolved, reopened, and deleted", () => {
  const { root, project, thread } = setup();
  try {
    const comment = store.createComment({ projectId: project.id, resourceType: "thread", resourceId: thread.id, body: "Please verify the 4k result." });
    assert.equal(comment.body, "Please verify the 4k result.");
    assert.equal(comment.author_name, "Commenter");
    assert.equal(store.listComments({ projectId: project.id, resourceType: "thread", resourceId: thread.id }).length, 1);
    assert.ok(store.setCommentResolved(comment.id, true).resolved_at);
    assert.equal(store.listComments({ projectId: project.id, resourceType: "thread", resourceId: thread.id, includeResolved: false }).length, 0);
    assert.equal(store.setCommentResolved(comment.id, false).resolved_at, null);
    assert.ok(store.listAuditEvents({ projectId: project.id }).some((event) => event.action === "comment.created"));
    assert.equal(store.deleteComment(comment.id).deleted, true);
    assert.equal(store.listComments({ projectId: project.id, resourceType: "thread", resourceId: thread.id }).length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("comments require project access and are hidden inside private drafts", () => {
  const { root, project, thread } = setup();
  try {
    store.setResearchThreadVisibility(thread.id, "private");
    store.addProjectMember({ projectId: project.id, userId: "usr_peer", role: "commenter", displayName: "Peer" });
    store.setLocalIdentity({ userId: "usr_peer", displayName: "Peer" });
    assert.throws(() => store.listComments({ projectId: project.id, resourceType: "thread", resourceId: thread.id }), /private/i);
    assert.throws(() => store.createComment({ projectId: project.id, resourceType: "thread", resourceId: thread.id, body: "hidden" }), /private/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
