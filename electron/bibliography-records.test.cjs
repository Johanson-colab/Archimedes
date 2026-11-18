const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { DatabaseSync } = require("node:sqlite");
const test = require("node:test");
const store = require("./store.cjs");

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-paper-selection-"))), idle = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-selection-idle-"));
  store.openWorkspace(root); const owner = store;
  const a = owner.createResearchProject({ name: "Project A" }), b = owner.createResearchProject({ name: "Project B" });
  const libraryA = owner.createLibrary({ projectId: a.id, name: "A papers" }), libraryB = owner.createLibrary({ projectId: b.id, name: "B papers" });
  t.after(() => { store.openWorkspace(idle); fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(idle, { recursive: true, force: true }); });
  return { root, idle, owner, a, b, libraryA, libraryB };
}test("explicit metadata repair and bibliography survive identifier-changing imports without discarding PDF pages or notes", t => {
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


test("bibliography keys and explicit repairs persist through the actual preload and main handlers", async t => {
  const f = fixture(t), handlers = new Map(), main = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8"), start = main.indexOf('  ipcMain.handle("library:add-paper",'), end = main.indexOf('  ipcMain.handle("library:import-local-pdf",', start);
  new Function("ipcMain", "store", main.slice(start, end))({ handle: (channel, callback) => handlers.set(channel, callback) }, store);
  let bridge;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "preload.cjs"), "utf8"), { process, require(name) { assert.equal(name, "electron"); return { contextBridge: { exposeInMainWorld: (_name, value) => { bridge = value; } }, ipcRenderer: { invoke: (channel, input) => Promise.resolve().then(() => handlers.get(channel)({}, input)) } }; } });
  const paper = await bridge.addLibraryPaper(f.libraryA.id, { title: "Bridge reference", doi: "10.1000/bridge-reference", authors: [] });
  await bridge.setPaperBibliography(paper.id, { citekey: "Bridge2026", entryType: "article" });
  await bridge.repairLibraryPaperMetadata(paper.id, { venue: "Confirmed venue" });
  store.openWorkspace(f.idle); store.openWorkspace(f.root);
  assert.equal((await bridge.getPaperBibliography(paper.id)).citekey, "Bridge2026");
  assert.equal(store.getPaper(paper.id).venue, "Confirmed venue");
  store.addProjectMember({ projectId: f.a.id, userId: "bibliography-viewer", role: "viewer" });
  store.setLocalIdentity({ userId: "bibliography-viewer", displayName: "Viewer" });
  try { await assert.rejects(bridge.setPaperBibliography(paper.id, { citekey: "Forbidden" }), /editor/); await assert.rejects(bridge.repairLibraryPaperMetadata(paper.id, { title: "Forbidden" }), /editor/); }
  finally { store.setLocalIdentity({ userId: "local-user", displayName: "Local user", deviceId: "local-device", deviceName: "This device" }); }
});
