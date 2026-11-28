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

test("a new title-only reference joins its legacy cloud record without joining a different publication", async () => {
  const root = workspace();
  try {
    const project = store.createResearchProject({ name: "Shared title references" });
    store.linkResearchProjectToCloud(project.id, "cloud-project");
    const library = store.listLibraries(project.id)[0];
    const api = fakeApi();
    const remote = api.seedRemoteLibrary(library.name, {
      canonical_key: "title:editorial", title: "Editorial", authors: ["Alex Morgan"], year: 2019,
      notes: "Existing cloud note", reading_status: "read", starred: true,
      tags: ["checked"], state_updated_at: "2025-01-01T00:00:00.000Z",
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
    const linked = store.getPaper(matching.id);
    assert.equal(linked.cloud_paper_id, legacy.id);
    assert.equal(linked.canonical_key, matching.canonical_key);
    assert.deepEqual(cloud.find(item => item.id === legacy.id), legacy);
    assert.equal(linked.notes, legacy.notes);
    assert.equal(linked.reading_status, "read");
    assert.equal(linked.starred, true);
    assert.deepEqual(linked.tags, ["checked"]);
    const second = store.getPaper(distinct.id);
    assert.notEqual(second.cloud_paper_id, legacy.id);
    assert.equal(cloud.find(item => item.id === second.cloud_paper_id).canonical_key, distinct.canonical_key);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("title-only sync reuses a legacy cloud identity from another accessible project", async () => {
  const root = workspace();
  try {
    const project = store.createResearchProject({ name: "Cross-project references" });
    store.linkResearchProjectToCloud(project.id, "cloud-current");
    const library = store.listLibraries(project.id)[0];
    const api = fakeApi();
    const legacyLibrary = api.seedRemoteLibrary("Other project references", {
      canonical_key: "title:editorial", title: "Editorial", authors: ["Alex Morgan"], year: 2019,
      notes: "Keep the original cloud note", reading_status: "read", starred: true,
      tags: ["checked"], state_updated_at: "2025-01-01T00:00:00.000Z",
    });
    const [legacy] = await api.listPapers(legacyLibrary.id);
    const allLibraries = api.listLibraries;
    api.listProjects = async () => [{ id: "cloud-current" }, { id: "cloud-other" }];
    api.listLibraries = async projectId => (await allLibraries()).filter(item =>
      projectId === "cloud-other" ? item.id === legacyLibrary.id : item.id !== legacyLibrary.id);
    const local = store.addPaper(library.id, { title: "Editorial", authors: ["Alex Morgan"], year: 2019 });

    const result = await createLibrarySync({ store, api }).syncProjectLibraries(project.id);
    assert.deepEqual(result.warnings, []);
    const linked = store.getPaper(local.id);
    assert.equal(linked.cloud_paper_id, legacy.id);
    assert.equal(linked.notes, legacy.notes);
    assert.equal(linked.reading_status, "read");
    assert.equal(store.listLibraries(project.id).length, 1);
    const syncedLibrary = store.listLibraries(project.id)[0];
    assert.ok(syncedLibrary.cloud_library_id);
    assert.notEqual(syncedLibrary.cloud_library_id, legacyLibrary.id);
    assert.equal((await api.listPapers(syncedLibrary.cloud_library_id)).length, 1);
    assert.equal(api.libraries.length, 2);
    assert.equal((await api.listPapers(legacyLibrary.id)).length, 1);
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

test("reusing a cloud title key preserves an explicit local note for reconciliation", async () => {
  const root = workspace();
  try {
    const project = store.createResearchProject({ name: "Title reference with edited notes" });
    store.linkResearchProjectToCloud(project.id, "cloud-project");
    const library = store.listLibraries(project.id)[0];
    const api = fakeApi();
    const reference = { title: "Editorial", authors: ["Alex Morgan"], year: 2019 };
    const remote = api.seedRemoteLibrary(library.name, {
      canonical_key: "title:editorial", ...reference, notes: "Older cloud note", state_updated_at: "2025-01-01T00:00:00.000Z",
    });
    store.linkLibraryToCloud(library.id, remote.id);
    const paper = store.addPaper(library.id, reference);
    store.updatePaper(paper.id, { notes: "Edited locally before sync" });

    const result = await createLibrarySync({ store, api }).syncProjectLibraries(project.id);
    assert.deepEqual(result.warnings, []);
    const cloud = await api.listPapers(remote.id);
    assert.equal(cloud.length, 1);
    assert.equal(cloud[0].notes, "Edited locally before sync");
    assert.equal(store.getPaper(paper.id).notes, cloud[0].notes);
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

test("cloud sync recognizes current metadata on an unchanged fingerprint from an earlier import", async () => {
  const firstRoot = workspace();
  let secondRoot;
  try {
    const api = fakeApi();
    const sync = createLibrarySync({ store, api });
    const originalProject = store.createResearchProject({ name: "Original workspace" });
    store.linkResearchProjectToCloud(originalProject.id, "shared-project");
    const originalLibrary = store.listLibraries(originalProject.id)[0];
    const remote = api.seedRemoteLibrary(originalLibrary.name);
    store.linkLibraryToCloud(originalLibrary.id, remote.id);

    const reference = { title: "Editorial", authors: ["Alex Morgan"] };
    const initial = store.addPaper(originalLibrary.id, reference);
    const enriched = store.addPaper(originalLibrary.id, { ...reference, year: 2019 });
    assert.equal(enriched.id, initial.id);
    assert.equal(enriched.canonical_key, initial.canonical_key);
    assert.equal(enriched.year, 2019);
    assert.deepEqual((await sync.syncProjectLibraries(originalProject.id)).warnings, []);
    const [original] = await api.listPapers(remote.id);
    assert.equal(original.canonical_key, initial.canonical_key);
    assert.equal(original.year, 2019);

    secondRoot = workspace();
    const project = store.createResearchProject({ name: "Fresh workspace" });
    store.linkResearchProjectToCloud(project.id, "shared-project");
    const library = store.listLibraries(project.id)[0];
    store.linkLibraryToCloud(library.id, remote.id);
    const matching = store.addPaper(library.id, { ...reference, year: 2019 });
    const otherYear = store.addPaper(library.id, { ...reference, year: 2023 });
    const otherAuthor = store.addPaper(library.id, { ...reference, authors: ["Jamie Lee"], year: 2019 });
    assert.notEqual(matching.canonical_key, original.canonical_key);

    assert.deepEqual((await sync.syncProjectLibraries(project.id)).warnings, []);
    const cloud = await api.listPapers(remote.id);
    assert.equal(cloud.length, 3);
    assert.equal(store.getPaper(matching.id).cloud_paper_id, original.id);
    assert.equal(store.getPaper(matching.id).canonical_key, matching.canonical_key);
    const yearId = store.getPaper(otherYear.id).cloud_paper_id;
    const authorId = store.getPaper(otherAuthor.id).cloud_paper_id;
    assert.equal(new Set([original.id, yearId, authorId]).size, 3);
    assert.equal(cloud.find(paper => paper.id === yearId).year, 2023);
    assert.deepEqual(cloud.find(paper => paper.id === authorId).authors, ["Jamie Lee"]);
  } finally {
    fs.rmSync(firstRoot, { recursive: true, force: true });
    if (secondRoot) fs.rmSync(secondRoot, { recursive: true, force: true });
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
