const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const store = require("./store.cjs");

function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-cloud-project-"));
  store.setLocalIdentity({ userId: "usr_local_owner", displayName: "Local Owner", deviceId: "dev", deviceName: "Test" });
  store.openWorkspace(root);
  return root;
}

test("local projects link to cloud projects and import without duplicating", () => {
  const root = workspace();
  try {
    const project = store.createResearchProject({ name: "Shared research", description: "Cloud project" });
    const linked = store.linkResearchProjectToCloud(project.id, "cloud-project-1");
    assert.equal(linked.cloud_project_id, "cloud-project-1");
    assert.equal(store.getResearchProject(project.id).cloud_project_id, "cloud-project-1");
    assert.equal(store.importCloudProject({ cloudProjectId: "cloud-project-1", name: "Duplicate" }).id, project.id);

    const imported = store.importCloudProject({ cloudProjectId: "cloud-project-2", name: "Imported", description: "From another owner" });
    assert.notEqual(imported.id, project.id);
    assert.equal(imported.cloud_project_id, "cloud-project-2");
    assert.equal(store.listResearchProjects().length, 3);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("cloud member sync preserves the local owner and tracks remote removals", () => {
  const root = workspace();
  try {
    const project = store.createResearchProject({ name: "Team project" });
    store.linkResearchProjectToCloud(project.id, "cloud-project-team");
    const members = store.syncProjectMembersFromCloud(project.id, [
      { user_id: "cloud-owner", role: "owner", display_name: "Remote Owner", email: "owner@example.com", joined_at: "2026-01-01T00:00:00.000Z" },
      { user_id: "cloud-editor", role: "editor", display_name: "Remote Editor", email: "editor@example.com", joined_at: "2026-01-02T00:00:00.000Z" },
    ], { currentEmail: "owner@example.com" });

    assert.deepEqual(members.map((member) => [member.user_id, member.role, member.source]), [
      ["usr_local_owner", "owner", "local"],
      ["cloud-editor", "editor", "cloud"],
    ]);
    assert.equal(store.projectRoleForUser(project.id, "cloud-editor"), "editor");

    const updated = store.syncProjectMembersFromCloud(project.id, [
      { user_id: "cloud-editor", role: "viewer", display_name: "Remote Editor", email: "editor@example.com" },
    ], { currentEmail: "owner@example.com" });
    assert.equal(updated.find((member) => member.user_id === "cloud-editor").role, "viewer");

    const removed = store.syncProjectMembersFromCloud(project.id, [], { currentEmail: "owner@example.com" });
    assert.deepEqual(removed.map((member) => member.user_id), ["usr_local_owner"]);
    assert.equal(store.projectRoleForUser(project.id, "cloud-editor"), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("cloud members cannot be synced into a project the local user cannot access", () => {
  const root = workspace();
  try {
    const project = store.createResearchProject({ name: "Private" });
    store.setLocalIdentity({ userId: "usr_outsider", displayName: "Outsider", deviceId: "dev2", deviceName: "Other" });
    assert.throws(() => store.syncProjectMembersFromCloud(project.id, [{ user_id: "u", role: "viewer" }]), /access/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
