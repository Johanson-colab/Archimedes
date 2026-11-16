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
}
test("one paper retains independent project reasons and discovery snapshots while personal notes stay shared", t => {
  const f = fixture(t);
  const paper = f.owner.addPaper(f.libraryA.id, { title: "Shared research paper", authors: ["Author"], doi: "10.1000/shared" }, {
    reason: "A uses the method", discovery: { query: "method", providers: ["arxiv"], degraded: true, machine_reason: "Model suggestion", ignored_secret: "must-not-persist" },
  });
  f.owner.updatePaper(paper.id, { notes: "Personal reading note", reading_status: "read" });
  const same = f.owner.addPaper(f.libraryB.id, { title: "Different indexed title", doi: "10.1000/shared" }, { reason: "B compares the evaluation" });
  assert.equal(same.id, paper.id);
  f.owner.addPaper(f.libraryA.id, paper, { discovery: { query: "new query", criteria: ["explicit filter"], fetched_at: "2026-11-16", providers: ["s2"], degraded: false } });
  const a = f.owner.getProjectPaperSelection(paper.id, f.a.id), b = f.owner.getProjectPaperSelection(paper.id, f.b.id);
  assert.equal(a.reason, "A uses the method");
  assert.equal(a.discovery.query, "new query");
  assert.equal(a.discovery.machine_reason, undefined, "new discovery is a complete snapshot, not an accidental merge of two queries");
  assert.equal(b.reason, "B compares the evaluation");
  assert.equal(f.owner.listPapers(f.libraryB.id)[0].notes, "Personal reading note");
  assert.equal(f.owner.listPapers(f.libraryB.id)[0].reading_status, "read");
  store.openWorkspace(f.idle); store.openWorkspace(f.root);
  const reopened = store;
  assert.deepEqual(reopened.getProjectPaperSelection(paper.id, f.a.id), a);
  assert.deepEqual(reopened.getProjectPaperSelection(paper.id, f.b.id), b);
});


test("paper/link/selection save rolls back as one operation, and viewers cannot change project reasons ", t => {
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
    assert.throws(() => f.owner.saveProjectPaperSelection(paper.id, f.a.id, { reason: "Forbidden" }), /editor/);
  } finally { store.setLocalIdentity({ userId: "local-user", displayName: "Local user", deviceId: "local-device", deviceName: "This device" }); }
});


test("the real preload and main selection handlers preserve the selected project relationship", async t => {
  const f = fixture(t), handlers = new Map();
  const main = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8"), start = main.indexOf('  ipcMain.handle("library:add-paper",'), end = main.indexOf('  ipcMain.handle("library:import-local-pdf",', start);
  new Function("ipcMain", "store", main.slice(start, end))({ handle: (channel, callback) => handlers.set(channel, callback) }, store);
  let bridge;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "preload.cjs"), "utf8"), { process, require(name) {
    assert.equal(name, "electron"); return { contextBridge: { exposeInMainWorld: (_name, value) => { bridge = value; } }, ipcRenderer: { invoke: (channel, input) => Promise.resolve().then(() => handlers.get(channel)({}, input)) } };
  } });
  const paper = await bridge.addLibraryPaper(f.libraryA.id, { title: "Bridge selection", authors: [] }, { reason: "Method baseline", discovery: { query: "method" } });
  assert.equal((await bridge.getProjectPaperSelection(paper.id, f.a.id)).discovery.query, "method");
  await bridge.saveProjectPaperSelection(paper.id, f.a.id, { reason: "Revised project purpose" });
  assert.equal((await bridge.getProjectPaperSelection(paper.id, f.a.id)).reason, "Revised project purpose");
  await assert.rejects(bridge.getProjectPaperSelection(paper.id, f.b.id), /access/);
});
