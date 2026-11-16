const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { DatabaseSync } = require("node:sqlite");
const test = require("node:test");
const store = require("./store.cjs");
const { createWorkspaceIpc } = require("./workspace-context.cjs");

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-library-records-")));
  const owner = store.createWorkspaceStore(root);
  const a = owner.createResearchProject({ name: "Project A" }), b = owner.createResearchProject({ name: "Project B" });
  const libraryA = owner.createLibrary({ projectId: a.id, name: "A papers" }), libraryB = owner.createLibrary({ projectId: b.id, name: "B papers" });
  t.after(() => { store.closeAllWorkspaces(); fs.rmSync(root, { recursive: true, force: true }); });
  return { root, owner, a, b, libraryA, libraryB };
}

test("one paper retains independent project reasons and discovery snapshots while personal notes stay shared", t => {
  const f = fixture(t);
  const paper = f.owner.addPaper(f.libraryA.id, { title: "Shared research paper", authors: ["Author"], doi: "10.1000/shared" }, {
    reason: "A uses the method", discovery: { query: "method", providers: ["arxiv"], degraded: true, machine_reason: "Model suggestion", ignored_secret: "must-not-persist" },
  });
  f.owner.updatePaper(paper.id, { notes: "Personal reading note", reading_status: "read" });
  const same = f.owner.addPaper(f.libraryB.id, { title: "Different indexed title", doi: "https://doi.org/10.1000/SHARED" }, { reason: "B compares the evaluation" });
  assert.equal(same.id, paper.id);
  f.owner.addPaper(f.libraryA.id, paper, { discovery: { query: "new query", criteria: ["explicit filter"], fetched_at: "2026-11-16", providers: ["s2"], degraded: false } });
  const a = f.owner.getProjectPaperSelection(paper.id, f.a.id), b = f.owner.getProjectPaperSelection(paper.id, f.b.id);
  assert.equal(a.reason, "A uses the method");
  assert.equal(a.discovery.query, "new query");
  assert.equal(a.discovery.machine_reason, undefined, "new discovery is a complete snapshot, not an accidental merge of two queries");
  assert.equal(b.reason, "B compares the evaluation");
  assert.equal(f.owner.listPapers(f.libraryB.id)[0].notes, "Personal reading note");
  assert.equal(f.owner.listPapers(f.libraryB.id)[0].reading_status, "read");
  f.owner.close();
  const reopened = store.createWorkspaceStore(f.root);
  assert.deepEqual(reopened.getProjectPaperSelection(paper.id, f.a.id), a);
  assert.deepEqual(reopened.getProjectPaperSelection(paper.id, f.b.id), b);
});

test("paper/link/selection save rolls back as one operation, and viewers cannot change project reasons or metadata", t => {
  const f = fixture(t);
  const before = f.owner.listPapers(f.libraryA.id).length;
  assert.throws(() => f.owner.addPaper(f.libraryA.id, { title: "Must roll back", authors: [] }, { reason: {} }), /reason/);
  assert.equal(f.owner.listPapers(f.libraryA.id).length, before);
  const reader = new DatabaseSync(path.join(f.root, ".archimedes/archimedes.db"), { readOnly: true });
  try { assert.equal(reader.prepare("SELECT COUNT(*) AS count FROM papers WHERE title = 'Must roll back'").get().count, 0); }
  finally { reader.close(); }
  const paper = f.owner.addPaper(f.libraryA.id, { title: "Readable paper", authors: [] }, { reason: "Author's reason" });
  assert.throws(() => f.owner.saveProjectPaperSelection(paper.id, f.b.id, { reason: "Wrong project" }), /access/);
  f.owner.addProjectMember({ projectId: f.a.id, userId: "library-viewer", role: "viewer" });
  store.setLocalIdentity({ userId: "library-viewer", displayName: "Viewer" });
  try {
    assert.equal(f.owner.getProjectPaperSelection(paper.id, f.a.id).reason, "Author's reason");
    assert.equal(f.owner.getPaperBibliography(paper.id).citekey, "");
    assert.throws(() => f.owner.saveProjectPaperSelection(paper.id, f.a.id, { reason: "Forbidden" }), /editor/);
    assert.throws(() => f.owner.setPaperBibliography(paper.id, { citekey: "Forbidden" }), /editor/);
    assert.throws(() => f.owner.repairLibraryPaperMetadata(paper.id, { title: "Forbidden" }), /editor/);
  } finally { store.setLocalIdentity({ userId: "local-user", displayName: "Local user", deviceId: "local-device", deviceName: "This device" }); }
});

test("explicit metadata repair and bibliography survive identifier-changing imports without discarding PDF pages or notes", t => {
  const f = fixture(t);
  const paper = f.owner.addPaper(f.libraryA.id, { title: "Original title", authors: ["Original author"], year: 2025, doi: "10.1000/roundtrip", pdf_url: "https://example.test/original.pdf" });
  f.owner.updatePaper(paper.id, { notes: "Keep the personal note", reading_status: "read" });
  f.owner.replacePaperReaderAsset(paper.id, { relative_path: "source.pdf", sha256: "fixture-hash", size_bytes: 42, page_count: 1, pages: [{ page_number: 1, text: "Keep indexed evidence" }] });
  f.owner.setPaperBibliography(paper.id, { citekey: "Author2025:method", entryType: "inproceedings" });
  const repaired = f.owner.repairLibraryPaperMetadata(paper.id, { title: "User repaired title", authors: ["User selected author"], year: null, venue: "Manual venue" });
  assert.equal(repaired.year, null);
  assert.equal(repaired.pdf_url, "https://example.test/original.pdf");
  assert.equal(repaired.citekey, "Author2025:method");
  const imported = f.owner.addPaper(f.libraryB.id, { title: "Index title", authors: ["Index author"], doi: "https://doi.org/10.1000/ROUNDTRIP", pdf_url: "https://example.test/new.pdf", venue: "Index venue" });
  assert.equal(imported.id, paper.id);
  assert.equal(imported.title, "User repaired title");
  assert.deepEqual(imported.authors, ["User selected author"]);
  assert.equal(imported.venue, "Manual venue");
  assert.equal(imported.pdf_url, "https://example.test/original.pdf");
  assert.equal(imported.entry_type, "inproceedings");
  assert.equal(imported.notes, "Keep the personal note");
  assert.equal(f.owner.getPaperReader(paper.id).pages[0].text, "Keep indexed evidence");
  assert.equal(f.owner.getPaperReader(paper.id).asset.sha256, "fixture-hash");
  const collision = f.owner.addPaper(f.libraryA.id, { title: "User repaired title", doi: "10.1000/a-different-work" });
  assert.notEqual(collision.id, paper.id, "title fallback must not override conflicting strong identifiers");
  const beforeId = f.owner.addPaper(f.libraryA.id, { title: "Paper before it has an identifier", authors: [] });
  const afterId = f.owner.addPaper(f.libraryA.id, { title: beforeId.title, arxiv_id: "2611.12345v2" });
  assert.equal(afterId.id, beforeId.id);
  assert.equal(f.owner.getPaper(beforeId.id).arxiv_id, "2611.12345v2");
});

test("the real preload and main handlers save atomic selections into their sender's captured store", async t => {
  const f = fixture(t);
  const otherRoot = path.join(f.root, "other"); fs.mkdirSync(otherRoot);
  const other = store.createWorkspaceStore(otherRoot);
  let selectedRoot = f.root;
  const handlers = new Map();
  const ipc = createWorkspaceIpc({ ipcMain: { handle: (name, handler) => handlers.set(name, handler) }, store, workspaceForEvent: () => selectedRoot });
  const main = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
  const start = main.indexOf('  ipcMain.handle("library:add-paper",');
  const end = main.indexOf('  ipcMain.handle("library:import-local-pdf",', start);
  new Function("ipcMain", "store", main.slice(start, end))(ipc, store);
  let bridge;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "preload.cjs"), "utf8"), { process, require(name) {
    assert.equal(name, "electron");
    return { contextBridge: { exposeInMainWorld: (_name, value) => { bridge = value; } }, ipcRenderer: { invoke: (name, input) => Promise.resolve().then(() => handlers.get(name)({ sender: { id: 1 } }, input)) } };
  } });
  const paper = await bridge.addLibraryPaper(f.libraryA.id, { title: "Bridge paper", authors: [] }, { reason: "Saved once", discovery: { query: "bridge" } });
  const result = await bridge.getProjectPaperSelection(paper.id, f.a.id);
  assert.equal(result.reason, "Saved once");
  await bridge.setPaperBibliography(paper.id, { citekey: "Bridge2026", entryType: "article" });
  assert.equal((await bridge.getPaperBibliography(paper.id)).citekey, "Bridge2026");
  const repaired = await bridge.repairLibraryPaperMetadata(paper.id, { venue: "Confirmed venue" });
  assert.equal(repaired.venue, "Confirmed venue");
  selectedRoot = otherRoot;
  await assert.rejects(bridge.getProjectPaperSelection(paper.id, f.a.id), /access/);
  assert.equal(other.listProjectThreadsForSync(other.defaultResearchProject().id).length, 0);
  assert.equal(f.owner.getProjectPaperSelection(paper.id, f.a.id).reason, "Saved once");
});
