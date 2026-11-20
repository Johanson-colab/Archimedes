const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const store = require("./store.cjs");
const { createLibrarySync } = require("./library-sync.cjs");
const { createAnnotationSync } = require("./annotation-sync.cjs");

function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-library-sync-"));
  store.setLocalIdentity({ userId: "usr_local_owner", displayName: "Local Owner", deviceId: "dev", deviceName: "Test" });
  store.openWorkspace(root);
  return root;
}

function fakeApi() {
  let nextLibrary = 1;
  let nextPaper = 1;
  const libraries = [];
  const papers = new Map();
  const states = new Map();
  return {
    libraries,
    async listLibraries() { return libraries.map((library) => ({ ...library, paper_count: (papers.get(library.id) || []).length })); },
    async createLibrary(_projectId, { name, description = "", color = "#3973c8" }) {
      const library = { id: `cloud-lib-${nextLibrary++}`, name, description, color, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      libraries.push(library);
      papers.set(library.id, []);
      return library;
    },
    async updateLibrary(libraryId, patch) {
      const library = libraries.find((candidate) => candidate.id === libraryId);
      Object.assign(library, patch);
      return library;
    },
    async addPaper(libraryId, paper) {
      const id = `cloud-paper-${nextPaper++}`;
      const row = { ...paper, id, added_at: new Date().toISOString() };
      papers.get(libraryId).push(row);
      return row;
    },
    async listPapers(libraryId) {
      return (papers.get(libraryId) || []).map((paper) => ({ ...paper, ...(states.get(paper.id) || {}) }));
    },
    async updatePaperState(paperId, patch) {
      states.set(paperId, { ...patch, state_updated_at: new Date().toISOString() });
      return states.get(paperId);
    },
    seedRemoteLibrary(name, paper) {
      const library = { id: `cloud-lib-${nextLibrary++}`, name, description: "", color: "#123456", created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      libraries.push(library);
      papers.set(library.id, []);
      if (paper) papers.get(library.id).push({ ...paper, id: `cloud-paper-${nextPaper++}`, added_at: new Date().toISOString() });
      return library;
    },
  };
}

test("library sync pushes local libraries and pulls shared books and paper state", async () => {
  const root = workspace();
  try {
    const project = store.createResearchProject({ name: "Sync project" });
    store.linkResearchProjectToCloud(project.id, "cloud-project");
    const localLibrary = store.createLibrary({ projectId: project.id, name: "Local sources", description: "Mine" });
    const localPaper = store.addPaper(localLibrary.id, { canonical_key: "doi:10.1/local", title: "Local paper", authors: ["Local"] });
    const remoteLibrary = fakeApi();
    remoteLibrary.seedRemoteLibrary("Shared sources", {
      canonical_key: "doi:10.1/remote",
      title: "Remote paper",
      authors: ["Remote"],
      reading_status: "read",
      starred: true,
      notes: "Remote state",
      tags: ["remote"],
      state_updated_at: "2026-05-01T00:00:00.000Z",
    });

    const sync = createLibrarySync({ store, api: remoteLibrary });
    const result = await sync.syncProjectLibraries(project.id);
    assert.deepEqual(result.warnings, []);
    const linkedLocal = store.listLibraries(project.id).find((library) => library.id === localLibrary.id);
    assert.ok(linkedLocal.cloud_library_id);
    assert.equal(store.listPapers(localLibrary.id).find((paper) => paper.id === localPaper.id).cloud_paper_id?.startsWith("cloud-paper-"), true);

    const importedLibrary = store.listLibraries(project.id).find((library) => library.name === "Shared sources");
    assert.ok(importedLibrary?.cloud_library_id);
    const importedPaper = store.listPapers(importedLibrary.id)[0];
    assert.equal(importedPaper.title, "Remote paper");
    assert.equal(importedPaper.reading_status, "read");
    assert.equal(importedPaper.starred, true);
    assert.deepEqual(importedPaper.tags, ["remote"]);

    const second = await sync.syncProjectLibraries(project.id);
    assert.deepEqual(second.warnings, []);
    assert.equal(store.listLibraries(project.id).length, result.libraries.length);
    assert.equal(store.listPapers(importedLibrary.id).length, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a DOI or arXiv match without personal state initializes from the cloud", async () => {
  const root = workspace();
  try {
    const seed = store.getPaper("seed-toolformer");
    assert.equal(seed.state_updated_at, null);
    const project = store.createResearchProject({ name: "Fresh workspace" });
    store.linkResearchProjectToCloud(project.id, "cloud-fresh");
    const api = fakeApi();
    const remoteState = {
      notes: "Saved on another device", reading_status: "read", starred: true,
      tags: ["reviewed"], state_updated_at: "2025-01-01T00:00:00.000Z",
    };
    const remote = api.seedRemoteLibrary("Shared references", {
      canonical_key: "cloud:toolformer", arxiv_id: seed.arxiv_id, title: seed.title, ...remoteState,
    });

    const result = await createLibrarySync({ store, api }).syncProjectLibraries(project.id);
    assert.deepEqual(result.warnings, []);
    const library = result.libraries.find(item => item.cloud_library_id === remote.id);
    const imported = store.listPapers(library.id)[0];
    assert.equal(imported.id, seed.id);
    for (const [field, value] of Object.entries(remoteState)) assert.deepEqual(imported[field], value, field);
    assert.equal((await api.listPapers(remote.id))[0].notes, remoteState.notes);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("syncing an older cloud duplicate twice cannot overwrite a newer note on the original cloud paper", async () => {
  const root = workspace();
  try {
    const doi = "10.5555/shared";
    const title = "A shared paper";
    const originalProject = store.createResearchProject({ name: "Original project" });
    store.linkResearchProjectToCloud(originalProject.id, "cloud-original");
    const originalLibrary = store.listLibraries(originalProject.id)[0];
    const local = store.addPaper(originalLibrary.id, { canonical_key: "original:key", doi, title });
    store.applyCloudPaperState(local.id, {
      notes: "Local saved note", reading_status: "read", starred: true,
      tags: ["local"], state_updated_at: "2026-06-01T00:00:00.000Z",
    });
    const project = store.createResearchProject({ name: "Current project" });
    store.linkResearchProjectToCloud(project.id, "cloud-current");
    const api = fakeApi();
    const original = api.seedRemoteLibrary("Original references", {
      canonical_key: "original:key", doi, title, notes: "Newer note in original cloud record",
      reading_status: "reading", starred: true, tags: ["original"], state_updated_at: "2026-07-01T00:00:00.000Z",
    });
    const duplicate = api.seedRemoteLibrary("Shared references", {
      canonical_key: "duplicate:key", doi, title, notes: "Older note in shared record",
      reading_status: "unread", starred: false, tags: [], state_updated_at: "2025-01-01T00:00:00.000Z",
    });
    const first = (await api.listPapers(original.id))[0];
    store.linkPaperToCloud(local.id, first.id);
    store.linkLibraryToCloud(originalLibrary.id, original.id);
    const list = api.listLibraries;
    api.listLibraries = async cloudProjectId => (await list()).filter(library =>
      library.id === (cloudProjectId === "cloud-original" ? original.id : duplicate.id));

    const sync = createLibrarySync({ store, api });
    const result = await sync.syncProjectLibraries(project.id);
    assert.deepEqual(result.warnings, []);
    assert.deepEqual((await sync.syncProjectLibraries(project.id)).warnings, []);
    assert.deepEqual((await sync.syncProjectLibraries(originalProject.id)).warnings, []);
    assert.deepEqual((await api.listPapers(original.id))[0], first);
    assert.equal(store.getPaper(local.id).notes, first.notes);
    const target = result.libraries.find(item => item.cloud_library_id === duplicate.id);
    const synced = store.listPapers(target.id)[0];
    const duplicateRemote = (await api.listPapers(duplicate.id))[0];
    assert.notEqual(synced.id, local.id);
    assert.equal(synced.cloud_paper_id, duplicateRemote.id);
    assert.equal(synced.notes, "Older note in shared record");
    assert.equal(duplicateRemote.state_updated_at, "2025-01-01T00:00:00.000Z");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("annotation sync reads the cloud record attached to the destination collection", async () => {
  const root = workspace();
  try {
    const source = store.createResearchProject({ name: "Original project" });
    const sourceLibrary = store.listLibraries(source.id)[0];
    const doi = "10.5555/annotations";
    const local = store.addPaper(sourceLibrary.id, { canonical_key: "original:annotation-paper", doi, title: "Shared paper" });
    store.linkPaperToCloud(local.id, "paper-a");
    const target = store.createResearchProject({ name: "Shared annotations" });
    store.linkResearchProjectToCloud(target.id, "cloud-shared");
    const library = store.listLibraries(target.id)[0];
    const imported = store.syncPaperFromCloud(library.id, {
      id: "paper-b", canonical_key: "shared:annotation-paper", doi, title: "Shared paper",
    });
    const requests = [];
    const api = {
      async listHighlights(_projectId, paperId) {
        requests.push(paperId);
        return paperId === "paper-b" ? [{
          id: "shared-highlight", paper_id: paperId, author_id: "remote-author", visibility: "project",
          page_number: 1, quote: "A shared observation", note: "", color: "blue",
          created_at: "2025-01-01T00:00:00.000Z", updated_at: "2025-01-01T00:00:00.000Z",
        }] : [];
      },
      async getReview() { return null; },
      async getPresentation() { return null; },
    };
    const result = await createAnnotationSync({ store, api }).syncProjectAnnotations(target.id);
    assert.deepEqual(result.warnings, []);
    assert.deepEqual(requests, ["paper-b"]);
    assert.deepEqual(store.listPaperHighlights(target.id, imported.id).map(item => item.id), ["shared-highlight"]);
    assert.equal(store.getPaper(local.id).cloud_paper_id, "paper-a");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("library sync requires a shared project", async () => {
  const root = workspace();
  try {
    const project = store.createResearchProject({ name: "Offline project" });
    const sync = createLibrarySync({ store, api: fakeApi() });
    await assert.rejects(() => sync.syncProjectLibraries(project.id), /Share this project/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
