const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const store = require("./store.cjs");

function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-library-cloud-"));
  store.setLocalIdentity({ userId: "usr_local_owner", displayName: "Local Owner", deviceId: "dev", deviceName: "Test" });
  store.openWorkspace(root);
  return root;
}

test("local libraries and papers link to cloud ids and import shared libraries", () => {
  const root = workspace();
  try {
    const project = store.createResearchProject({ name: "Cloud library project" });
    store.linkResearchProjectToCloud(project.id, "cloud-project");
    const library = store.createLibrary({ projectId: project.id, name: "Sources" });
    const linked = store.linkLibraryToCloud(library.id, "cloud-library");
    assert.equal(linked.cloud_library_id, "cloud-library");
    assert.equal(store.importCloudLibrary(project.id, { cloudLibraryId: "cloud-library", name: "Duplicate" }).id, library.id);

    const imported = store.importCloudLibrary(project.id, { cloudLibraryId: "cloud-library-2", name: "Shared sources", color: "#123456" });
    assert.equal(imported.cloud_library_id, "cloud-library-2");
    assert.equal(store.listLibraries(project.id).length, 3);

    const paper = store.addPaper(library.id, { canonical_key: "doi:10.1234/example", title: "Local paper", authors: ["A"] });
    assert.equal(store.linkPaperToCloud(paper.id, "cloud-paper").cloud_paper_id, "cloud-paper");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("cloud paper import keeps canonical identity and applies remote user state", () => {
  const root = workspace();
  try {
    const project = store.createResearchProject({ name: "Paper sync" });
    store.linkResearchProjectToCloud(project.id, "cloud-project");
    const library = store.createLibrary({ projectId: project.id, name: "Sources" });
    store.linkLibraryToCloud(library.id, "cloud-library");

    const imported = store.syncPaperFromCloud(library.id, {
      id: "cloud-paper",
      canonical_key: "doi:10.5555/shared",
      title: "Shared paper",
      authors: ["Ada", "Grace"],
      year: 2026,
      venue: "TestConf",
      reading_status: "read",
      starred: true,
      notes: "Remote note",
      tags: ["shared"],
      state_updated_at: "2026-05-01T00:00:00.000Z",
    });
    assert.equal(imported.cloud_paper_id, "cloud-paper");
    assert.equal(imported.canonical_key, "doi:10.5555/shared");
    assert.equal(imported.reading_status, "read");
    assert.equal(imported.starred, true);
    assert.deepEqual(imported.tags, ["shared"]);
    assert.equal(store.listPapers(library.id).length, 1);

    const again = store.syncPaperFromCloud(library.id, {
      id: "cloud-paper-2",
      canonical_key: "doi:10.5555/shared",
      title: "Shared paper duplicate",
      authors: ["Ada"],
      reading_status: "unread",
      state_updated_at: "2026-01-01T00:00:00.000Z",
    });
    assert.equal(again.id, imported.id);
    assert.equal(store.listPapers(library.id).length, 1);

    const updated = store.applyCloudPaperState(imported.id, { reading_status: "reading", starred: false, notes: "Pulled", tags_json: ["one"], state_updated_at: "2026-06-01T00:00:00.000Z" });
    assert.equal(updated.reading_status, "reading");
    assert.equal(updated.starred, false);
    assert.deepEqual(updated.tags, ["one"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("paper sync requires editor access to the library project", () => {
  const root = workspace();
  try {
    const project = store.createResearchProject({ name: "Guard" });
    const library = store.createLibrary({ projectId: project.id, name: "Sources" });
    store.setLocalIdentity({ userId: "usr_outsider", displayName: "Outsider", deviceId: "dev2", deviceName: "Other" });
    assert.throws(() => store.syncPaperFromCloud(library.id, { id: "p", canonical_key: "k", title: "T" }), /permission|access/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
