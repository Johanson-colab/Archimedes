const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const store = require("./store.cjs");
const { createLibrarySync } = require("./library-sync.cjs");

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
      // The collaboration RPC keeps the first paper for each canonical key.
      const existing = [...papers.values()].flat().find(item => item.canonical_key === paper.canonical_key);
      const row = existing || { ...paper, id: `cloud-paper-${nextPaper++}`, added_at: new Date().toISOString() };
      const items = papers.get(libraryId);
      if (!items.some(item => item.id === row.id)) items.push(row);
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

test("a new title-only reference joins its legacy cloud record without joining a different publication", async () => {
  const root = workspace();
  try {
    const project = store.createResearchProject({ name: "Shared title references" });
    store.linkResearchProjectToCloud(project.id, "cloud-project");
    const library = store.listLibraries(project.id)[0];
    const api = fakeApi();
    const remote = api.seedRemoteLibrary(library.name, {
      canonical_key: "title:editorial", title: "Editorial", authors: ["Alex Morgan"], year: 2019,
    });
    store.linkLibraryToCloud(library.id, remote.id);
    const [legacy] = await api.listPapers(remote.id);
    const matching = store.addPaper(library.id, { title: "Editorial", authors: ["Alex Morgan"], year: 2019 });
    const distinct = store.addPaper(library.id, { title: "Editorial", authors: ["Jamie Lee"], year: 2023 });
    assert.match(matching.canonical_key, /^title:editorial:[a-f0-9]{64}$/);
    assert.notEqual(matching.canonical_key, distinct.canonical_key);

    const result = await createLibrarySync({ store, api }).syncProjectLibraries(project.id);
    assert.deepEqual(result.warnings, []);
    const cloud = await api.listPapers(remote.id);
    assert.equal(cloud.length, 2);
    assert.equal(store.getPaper(matching.id).cloud_paper_id, legacy.id);
    assert.equal(store.getPaper(matching.id).canonical_key, matching.canonical_key);
    const second = store.getPaper(distinct.id);
    assert.notEqual(second.cloud_paper_id, legacy.id);
    assert.equal(cloud.find(item => item.id === second.cloud_paper_id).canonical_key, distinct.canonical_key);
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
