const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const store = require("./store.cjs");

function workspace(identity = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-members-"));
  store.setLocalIdentity({
    userId: identity.userId || "usr_local_test",
    displayName: identity.displayName || "Local Tester",
    deviceId: "dev_local_test",
    deviceName: "Test device",
  });
  const snapshot = store.openWorkspace(root);
  return { root, snapshot };
}

test("opening a workspace creates a local owner and migrates existing projects", () => {
  const { root, snapshot } = workspace();
  try {
    assert.ok(snapshot.projects.length >= 1);
    const project = snapshot.projects[0];
    assert.equal(project.owner_id, "usr_local_test");
    const members = store.listProjectMembers(project.id);
    assert.equal(members.length, 1);
    assert.equal(members[0].user_id, "usr_local_test");
    assert.equal(members[0].role, "owner");
    assert.equal(store.projectRoleForUser(project.id), "owner");
    assert.equal(store.canAccessProject(project.id, "editor"), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("new projects record an owner and support explicit members and roles", () => {
  const { root } = workspace();
  try {
    const project = store.createResearchProject({ name: "Shared project", description: "Team work" });
    assert.equal(project.owner_id, "usr_local_test");
    const viewer = store.addProjectMember({ projectId: project.id, userId: "usr_viewer", role: "viewer", displayName: "Viewer" });
    assert.equal(viewer.role, "viewer");
    assert.equal(store.projectRoleForUser(project.id, "usr_viewer"), "viewer");
    assert.equal(store.canAccessProject(project.id, "commenter", "usr_viewer"), false);
    store.addProjectMember({ projectId: project.id, userId: "usr_viewer", role: "commenter" });
    assert.equal(store.canAccessProject(project.id, "commenter", "usr_viewer"), true);
    const members = store.listProjectMembers(project.id);
    assert.deepEqual(members.map((member) => member.role), ["owner", "commenter"]);
    store.updateProjectMemberRole(project.id, "usr_viewer", "editor");
    assert.equal(store.projectRoleForUser(project.id, "usr_viewer"), "editor");
    assert.ok(store.listAuditEvents({ projectId: project.id }).some((event) => event.action === "project.member_role_changed"));
    assert.equal(store.removeProjectMember(project.id, "usr_viewer").removed, true);
    assert.equal(store.projectRoleForUser(project.id, "usr_viewer"), null);
    assert.throws(() => store.removeProjectMember(project.id, "usr_local_test"), /owner/i);
    assert.ok(store.listResearchProjects().some((candidate) => candidate.id === project.id));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("threads are filtered and guarded by project membership", () => {
  const { root } = workspace();
  try {
    const project = store.createResearchProject({ name: "Private project" });
    const thread = store.createResearchThread({ prompt: "thread", mode: "free-chat", projectId: project.id });
    assert.equal(store.getResearchThread(thread.id).id, thread.id);
    assert.ok(store.listResearchThreads().some((candidate) => candidate.id === thread.id));

    store.setLocalIdentity({ userId: "usr_outsider", displayName: "Outsider" });
    assert.equal(store.listResearchProjects().length, 0);
    assert.equal(store.listResearchThreads().length, 0);
    assert.throws(() => store.getResearchThread(thread.id), /access/i);
    assert.throws(() => store.createResearchThread({ prompt: "nope", mode: "free-chat", projectId: project.id }), /access/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
