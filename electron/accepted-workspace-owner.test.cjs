const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { randomUUID } = require("node:crypto");
const test = require("node:test");
const store = require("./store.cjs");
const agent = require("./agent.cjs");
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
  const handlers = new Map(), windowWorkspaces = new Map(), windowPreviewTokens = new Map(), previewTokenWorkspaces = new Map(), windowApprovalClaims = new Map();
  const event = { sender: { id: 1 } }, proposals = [];
  const browserWindow = { webContents: { id: 1, send: (...args) => proposals.push(args) }, isDestroyed: () => false };
  const helpers = new Function("scope", `with(scope) { ${["setWindowWorkspace", "releaseWindowApprovalClaim", "createPreviewToken", "openFolderFromMenu", "readerStateForWindow"].map(extract).join("\n")}; return {setWindowWorkspace,releaseWindowApprovalClaim,createPreviewToken,openFolderFromMenu,readerStateForWindow}; }`)({
    windowWorkspaces, windowApprovalClaims, windowPreviewTokens, previewTokenWorkspaces, randomUUID, fs, agent,
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
  const claimStart = source.indexOf('  ipcMain.handle("agent:claim-approvals",');
  const claimEnd = source.indexOf('  ipcMain.handle("agent:interrupt",', claimStart);
  new Function("scope", `with(scope) { ${source.slice(claimStart, claimEnd)} }`)({
    ipcMain: ipc, agent, windowWorkspaces, windowApprovalClaims, releaseWindowApprovalClaim: helpers.releaseWindowApprovalClaim,
  });
  const sharedThread = "same-imported-thread";
  const claim = handlers.get("agent:claim-approvals");
  assert.equal(claim(event, sharedThread, true, a).claimed, true);
  assert.equal(ownerA.run(() => agent.hasApprovalSurface(sharedThread)), true);
  ownerA.updatePaper("seed-react", { notes: "A notes" }); ownerB.updatePaper("seed-react", { notes: "B notes" });
  const listStart = source.indexOf('  ipcMain.handle("paper-review-app:list-papers",');
  const listEnd = source.indexOf('  ipcMain.handle("paper-to-slides:stage",', listStart);
  new Function("scope", `with(scope) { ${source.slice(listStart,listEnd)} }`)({
    ipcMain: ipc, store, BrowserWindow: { fromWebContents: () => browserWindow }, workspaceForWindow: () => windowWorkspaces.get(1), resolveWorkspace: fs.realpathSync,
    paperReview: { listPapers: () => [store.getPaper("seed-react")] },
  });
  assert.equal(handlers.get("paper-review-app:list-papers")(event).at(0).notes, "A notes", "indirect libraryStore consumers retain A");

  const reviewStart = source.indexOf('  ipcMain.handle("paper-review-app:create",');
  const reviewEnd = source.indexOf('  ipcMain.handle("paper-review-app:get-run",', reviewStart);
  new Function("scope", `with(scope) { ${source.slice(reviewStart, reviewEnd)} }`)({
    ipcMain: ipc, store, windowWorkspaces, resolveWorkspace: fs.realpathSync,
    paperReview: { createRun: (_input, options) => options.workspace },
  });
  const review = handlers.get("paper-review-app:create");
  assert.equal(await review(event, { workspace: b, source: { kind: "library" } }), a);
  assert.equal(await review(event, { workspace: b, source: { paperId: "seed-react" } }), a);
  assert.equal(await review(event, { workspace: b, source: { kind: "pdf" } }), b);

  const runStart = source.indexOf('  ipcMain.handle("agent:run",');
  const runEnd = source.indexOf('  ipcMain.handle("paper-review:run",', runStart);
  let finishReply, started;
  const pending = new Promise(resolve => { started = resolve; });
  const paperThread = ownerA.createResearchThread({ prompt: "Read paper", mode: "free-chat", kind: "paper", workspacePath: a });
  const fakeAgent = { runAgent: () => { started(); return new Promise(resolve => { finishReply = resolve; }); } };
  new Function("scope", `with(scope) { ${source.slice(runStart, runEnd)} }`)({
    ipcMain: ipc, store, resolveWorkspace: fs.realpathSync, sanitizeAgentContext: async () => [],
    agentBackendConfig: { get: () => ({ backend: "api" }) }, modelConfig: { getActiveModelConfig: () => ({}) },
    normalizeReasoningEffort: () => "medium", normalizeContextLength: () => "standard", agent: fakeAgent,
    runWindowAgent: ({ run }) => run({ emit() {} }),
  });
  const reply = handlers.get("agent:run")(event, { prompt: "Read this", origin: "paper", paperId: "seed-react", workspace: a, projectId: paperThread.project_id });
  await pending;
  helpers.setWindowWorkspace(1, b);
  finishReply({ threadId: paperThread.id, response: "A saved answer" });
  const saved = await reply;
  assert.equal(saved.paperChatSaveError, undefined);
  assert.equal(ownerA.getPaperChatThread("seed-react", paperThread.project_id).id, paperThread.id);
  assert.equal(ownerB.getPaperChatThread("seed-react"), null);
  helpers.setWindowWorkspace(1, a);
  claim(event, sharedThread, true, a);

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
  const updateStart = source.indexOf('  ipcMain.handle("library:update-paper",');
  const updateEnd = source.indexOf('  ipcMain.handle("library:remove-paper",', updateStart);
  new Function("ipcMain", "store", source.slice(updateStart, updateEnd))(ipc, store);
  const updatePaper = handlers.get("library:update-paper");
  assert.throws(() => updatePaper(event, { paperId: "seed-react", dataRoot: a, patch: { notes: "A unsent notes", starred: true, reading_status: "read" } }), /another data folder/);
  assert.equal(ownerA.getPaper("seed-react").notes, "A notes");
  assert.equal(ownerB.getPaper("seed-react").notes, "B notes");
  updatePaper(event, { paperId: "seed-react", dataRoot: b, patch: { notes: "B saved notes" } });
  fs.unlinkSync(alias);
  fs.symlinkSync(a, alias, linkType);
  assert.equal(ownerA.run(() => agent.hasApprovalSurface(sharedThread)), false);
  assert.equal(claim(event, sharedThread, true, b).claimed, true);
  assert.equal(claim(event, sharedThread, false, a).claimed, false);
  assert.equal(ownerB.run(() => agent.hasApprovalSurface(sharedThread)), true);
  helpers.releaseWindowApprovalClaim(event.sender.id);
  assert.equal(ownerB.run(() => agent.hasApprovalSurface(sharedThread)), false);
  assert.equal(handlers.get("paper-review-app:list-papers")(event).at(0).notes, "B saved notes", "indirect libraryStore consumers follow accepted B");
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

test("only a window that reopens a replaced database can write to the restored papers", t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-replaced-store-")));
  t.after(() => { store.closeAllWorkspaces(); fs.rmSync(root, { recursive: true, force: true }); });
  const folder = path.join(root, "current");
  const replacement = path.join(root, "restored");
  fs.mkdirSync(folder);
  fs.mkdirSync(replacement);
  const restored = store.createWorkspaceStore(replacement);
  restored.updatePaper("seed-react", { notes: "Restored notes" });
  restored.close();

  const handlers = new Map();
  const ipc = createWorkspaceIpc({
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) }, store, workspaceForEvent: () => folder,
  });
  ipc.handle("workspace:open", () => store.getSnapshot());
  const begin = source.indexOf('  ipcMain.handle("library:update-paper",');
  const end = source.indexOf('  ipcMain.handle("library:remove-paper",', begin);
  new Function("ipcMain", "store", source.slice(begin, end))(ipc, store);
  const open = handlers.get("workspace:open");
  const save = (event, notes) => handlers.get("library:update-paper")(event, {
    paperId: "seed-react", dataRoot: folder, patch: { notes },
  });
  const first = { sender: { id: 1 } }, second = { sender: { id: 2 } };
  open(first);
  open(second);
  fs.renameSync(folder, path.join(root, "old"));
  fs.renameSync(replacement, folder);

  assert.throws(() => save(first, "Old draft"), /Reopen the folder/);
  assert.throws(() => save(first, "Retried draft"), /Reopen the folder/);
  open(second);
  assert.equal(store.createWorkspaceStore(folder).getPaper("seed-react").notes, "Restored notes");
  save(second, "Reviewed after reload");
  assert.throws(() => save(first, "Still stale"), /Reopen the folder/);
  assert.equal(store.createWorkspaceStore(folder).getPaper("seed-react").notes, "Reviewed after reload");
  open(first);
  save(first, "New draft");
  assert.equal(store.createWorkspaceStore(folder).getPaper("seed-react").notes, "New draft");
});

test("a window that vetoes Quit keeps its detached research database open", t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-quit-owner-")));
  const owner = store.createWorkspaceStore(root);
  t.after(() => { store.closeAllWorkspaces(); fs.rmSync(root, { recursive: true, force: true }); });
  const app = new (require("node:events").EventEmitter)();
  const registration = source.slice(source.lastIndexOf('app.on(', source.indexOf('  closeAllNativeClients();')));
  new Function("app", "store", "experimentRunner", "closeAllNativeClients", "closeAllTerminals", "collaborationServer", "presence",
    "deepReadingRuns", "activeLiteratureSearches", "workspaceWatchers", "windowPreviewTokens", "harnessSetup", registration)(
    app, store, { shutdownExperimentRuns() {} }, () => {}, () => {}, null, null, new Map(), new Map(), new Map(), new Map(), { shutdown() {} },
  );
  app.emit("before-quit");
  owner.updatePaper("seed-react", { notes: "finished after the canceled quit" });
  assert.equal(owner.getPaper("seed-react").notes, "finished after the canceled quit");
  app.emit("will-quit");
  assert.throws(() => owner.getPaper("seed-react"), /Open a workspace/);
});
