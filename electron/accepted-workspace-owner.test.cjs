const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { randomUUID } = require("node:crypto");
const test = require("node:test");
const store = require("./store.cjs");
const { createWorkspaceIpc, isWorkspaceDataChannel } = require("./workspace-context.cjs");
const source = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
function extract(name) {
  const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, "m"));
  const end = source.indexOf("\n}", start) + 2;
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end);
}

test("menu proposals and late reader previews preserve the accepted owner; recovery IPC needs no database", async t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-accepted-owner-")));
  const a = path.join(root, "a"), b = path.join(root, "b"); fs.mkdirSync(a); fs.mkdirSync(b);
  fs.writeFileSync(path.join(a, "paper.pdf"), "fixture");
  t.after(() => { store.closeAllWorkspaces(); fs.rmSync(root, { recursive: true, force: true }); });
  const handlers = new Map(), windowWorkspaces = new Map(), windowPreviewTokens = new Map(), previewTokenWorkspaces = new Map();
  const event = { sender: { id: 1 } }, proposals = [];
  const browserWindow = { webContents: { id: 1, send: (...args) => proposals.push(args) }, isDestroyed: () => false };
  const helpers = new Function("scope", `with(scope) { ${["setWindowWorkspace", "createPreviewToken", "openFolderFromMenu", "readerStateForWindow"].map(extract).join("\n")}; return {setWindowWorkspace,createPreviewToken,openFolderFromMenu,readerStateForWindow}; }`)({
    windowWorkspaces, windowPreviewTokens, previewTokenWorkspaces, randomUUID, fs,
    focusedWindow: () => browserWindow, chooseFolderForWindow: async () => b,
    store: { getPaperReader: () => ({ asset: { status: "ready", relative_path: "paper.pdf" } }) },
    workspaceFiles: require("./workspace-files.cjs"),
  });
  helpers.setWindowWorkspace(1, a);
  const bindingStart = source.indexOf("  const ipcMain = createWorkspaceIpc(");
  const bindingEnd = source.indexOf("\n  });", bindingStart) + 6;
  const ipc = new Function("scope", `with(scope) { ${source.slice(bindingStart,bindingEnd)}; return ipcMain; }`)({
    createWorkspaceIpc, isWorkspaceDataChannel, store, windowWorkspaces, resolveWorkspace: path.resolve,
    electronIpcMain: { handle: (name, callback) => handlers.set(name, callback) },
  });
  ipc.handle("library:owner", () => store.currentStore().workspace);
  const ownerA = store.createWorkspaceStore(a), ownerB = store.createWorkspaceStore(b);
  ownerA.updatePaper("seed-react", { notes: "A notes" }); ownerB.updatePaper("seed-react", { notes: "B notes" });
  const listStart = source.indexOf('  ipcMain.handle("paper-review-app:list-papers",');
  const listEnd = source.indexOf('  ipcMain.handle("paper-to-slides:stage",', listStart);
  new Function("scope", `with(scope) { ${source.slice(listStart,listEnd)} }`)({
    ipcMain: ipc, store, BrowserWindow: { fromWebContents: () => browserWindow }, workspaceForWindow: () => windowWorkspaces.get(1), resolveWorkspace: fs.realpathSync,
    paperReview: { listPapers: () => [store.getPaper("seed-react")] },
  });
  assert.equal(handlers.get("paper-review-app:list-papers")(event).at(0).notes, "A notes", "indirect libraryStore consumers retain A");

  await helpers.openFolderFromMenu();
  assert.deepEqual(proposals, [["menu:open-folder", b]]);
  assert.equal(handlers.get("library:owner")(event), a, "an ignored menu proposal does not switch IPC ownership");
  const openStart = source.indexOf('  ipcMain.handle("workspace:open",');
  const openEnd = source.indexOf('  ipcMain.handle("workspace:list-files",', openStart);
  new Function("scope", `with(scope) { ${source.slice(openStart, openEnd)} }`)({ ipcMain: ipc, store, setWindowWorkspace: helpers.setWindowWorkspace, rememberWorkspace() {}, watchWorkspace() {} });
  const alias = path.join(root, "selected-folder");
  const linkType = process.platform === "win32" ? "junction" : "dir";
  fs.symlinkSync(b, alias, linkType);
  assert.equal(handlers.get("workspace:open")(event, alias).workspace, b);
  fs.unlinkSync(alias);
  fs.symlinkSync(a, alias, linkType);
  assert.equal(handlers.get("paper-review-app:list-papers")(event).at(0).notes, "B notes", "indirect libraryStore consumers follow accepted B");
  const bToken = helpers.createPreviewToken(1, b);
  helpers.readerStateForWindow(1, a, "paper");
  assert.equal(handlers.get("library:owner")(event), b, "a late A preview does not restore A as the data owner");
  assert.equal(previewTokenWorkspaces.get(bToken), b, "existing B preview URLs retain their own root");
  fs.renameSync(b, path.join(root, "renamed-b"));
  for (const channel of ["workspace:choose", "terminal:stop", "auth:get-state", "model-config:get", "paper-review-app:get-settings"]) {
    ipc.handle(channel, () => "available");
    assert.equal(handlers.get(channel)(event), "available", channel);
  }
  assert.throws(() => handlers.get("library:owner")(event), /ENOENT|exist/);
});
