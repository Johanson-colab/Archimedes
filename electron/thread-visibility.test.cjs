const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const store = require("./store.cjs");

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-thread-visibility-"));
  store.setLocalIdentity({ userId: "usr_thread_owner", displayName: "Thread Owner", deviceId: "dev", deviceName: "test" });
  const snapshot = store.openWorkspace(root);
  const project = snapshot.projects[0];
  return { root, project };
}

test("threads default to project visibility and can become private drafts", () => {
  const { root, project } = setup();
  try {
    const thread = store.createResearchThread({ prompt: "visible", mode: "free-chat", projectId: project.id });
    assert.equal(thread.visibility, "project");
    assert.equal(thread.owner_id, "usr_thread_owner");
    const privateThread = store.createResearchThread({ prompt: "private", mode: "free-chat", projectId: project.id, visibility: "private" });
    assert.equal(privateThread.visibility, "private");
    assert.equal(store.setResearchThreadVisibility(thread.id, "private").visibility, "private");
    assert.equal(store.getResearchThread(thread.id).visibility, "private");
    store.addProjectMember({ projectId: project.id, userId: "usr_thread_peer", role: "viewer", displayName: "Peer" });
    store.setLocalIdentity({ userId: "usr_thread_peer", displayName: "Peer" });
    assert.equal(store.listResearchThreads().some((candidate) => candidate.id === thread.id), false);
    assert.throws(() => store.getResearchThread(thread.id), /private/i);
    store.setLocalIdentity({ userId: "usr_thread_owner", displayName: "Thread Owner" });
    assert.equal(store.setResearchThreadVisibility(thread.id, "project").visibility, "project");
    const audit = store.listAuditEvents({ projectId: project.id });
    assert.ok(audit.some((event) => event.action === "thread.visibility_changed"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("thread snapshots capture a frozen manifest and are project-scoped", () => {
  const { root, project } = setup();
  try {
    const thread = store.createResearchThread({ prompt: "snapshot me", mode: "free-chat", projectId: project.id });
    const snapshot = store.createThreadSnapshot(thread.id);
    assert.equal(snapshot.thread_id, thread.id);
    assert.equal(snapshot.project_id, project.id);
    assert.equal(snapshot.manifest.thread.title, "snapshot me");
    assert.equal(snapshot.manifest.version, 1);
    assert.ok(Array.isArray(snapshot.manifest.turns));
    assert.ok(Array.isArray(snapshot.manifest.events));
    assert.equal(store.listThreadSnapshots(thread.id).length, 1);
    assert.equal(store.getThreadSnapshot(snapshot.id).id, snapshot.id);
    assert.ok(store.listAuditEvents({ projectId: project.id }).some((event) => event.action === "thread.snapshot_created"));

    store.setLocalIdentity({ userId: "usr_thread_outsider", displayName: "Outsider" });
    assert.throws(() => store.setResearchThreadVisibility(thread.id, "private"), /permission|access/i);
    assert.throws(() => store.createThreadSnapshot(thread.id), /access/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
