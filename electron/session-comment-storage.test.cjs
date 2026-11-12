const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const store = require("./store.cjs");

test("session comment positions survive reopening, peer access, and cloud anchor aliases", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-session-comments-"));
  const idle = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-session-comments-idle-"));
  try {
    store.setLocalIdentity({ userId: "owner", displayName: "Owner" });
    store.openWorkspace(root);
    const project = store.createResearchProject({ name: "Annotations" });
    const session = store.createResearchThread({ projectId: project.id, prompt: "Read this", mode: "free-chat" });
    const anchor = { type: "session-position", version: 1, y: 1320, messageId: "message-a", offset: 80, fraction: .4 };
    const comment = store.createComment({ projectId: project.id, resourceType: "thread", resourceId: session.id, body: "Verify this claim", anchor });
    store.addProjectMember({ projectId: project.id, userId: "peer", displayName: "Peer", role: "commenter" });
    store.openWorkspace(idle);
    store.openWorkspace(root);
    store.setLocalIdentity({ userId: "peer", displayName: "Peer" });
    assert.deepEqual(store.listComments({ projectId: project.id, resourceType: "thread", resourceId: session.id })[0].anchor, anchor);
    const remote = { ...comment, id: "remote-annotation", anchor_json: undefined, anchor, author_id: "remote-owner" };
    store.applyCloudComment(project.id, remote);
    assert.deepEqual(store.listComments({ projectId: project.id, resourceType: "thread", resourceId: session.id }).find((entry) => entry.id === remote.id).anchor, anchor);
    store.applyCloudComment(project.id, { ...remote, body: "Stale remote content", updated_at: "2000-01-01T00:00:00.000Z" });
    assert.equal(store.listComments({ projectId: project.id, resourceType: "thread", resourceId: session.id }).find((entry) => entry.id === remote.id).body, "Verify this claim");
  } finally {
    store.openWorkspace(idle);
    fs.rmSync(root, { recursive: true, force: true });
    // The process owns the idle database until exit; don't remove an open DB on Windows.
  }
});
