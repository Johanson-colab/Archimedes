const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const test = require("node:test");
const { readWorkspaceFile, writeWorkspaceTextFile } = require("./workspace-files.cjs");
const source = fs.readFileSync(path.join(__dirname, "../src/App.tsx"), "utf8");
function extract(name) {
  const start = source.search(new RegExp(`^  (?:async )?function ${name}\\(`, "m"));
  assert.ok(start >= 0, name);
  const end = source.slice(start).search(/\n  }(?=\n)/);
  return source.slice(start, start + end + 4);
}
async function harness(root) {
  const helpers = await import("../src/file-editor.ts");
  const scope = {
    ...helpers, executionWorkspace: root, executionWorkspaceRef: { current: root }, fileWorkspaceVersion: 0, fileWorkspaceVersionRef: { current: 0 }, fileEditorScopesRef: { current: {} }, openFilesRef: { current: [] },
    desktopBridge: { writeWorkspaceFile: async (...args) => writeWorkspaceTextFile(...args), readWorkspaceFile: async (...args) => readWorkspaceFile(...args) },
    setFileEditorScopes() {}, setOpenFiles: (files) => { scope.visibleFiles = files; },
    setSelectedFile: (update) => { scope.selectedFile = typeof update === "function" ? update(scope.selectedFile) : update; },
    withoutKey: (records, key) => Object.fromEntries(Object.entries(records).filter(([name]) => name !== key)),
  };
  const names = ["replaceFileEditorScopes", "isCurrentFileWorkspace", "updateFileScope", "setDrafts", "setFileConflicts", "setFileErrors", "setFileSavingPath", "saveFile", "reloadFile", "updateFileDraft", "ensureFileDraft", "dismissFileConflict"];
  const { transformWithOxc } = await import("vite");
  const { code } = await transformWithOxc(names.map(extract).join("\n"), "file-owner-callbacks.tsx");
  const functions = new Function("scope", `with(scope) { ${code}; return { ${names.join(",")} }; }`)(scope);
  function select(root) {
    if (scope.executionWorkspace !== root) scope.fileWorkspaceVersion++;
    scope.executionWorkspace = root; scope.executionWorkspaceRef.current = root; scope.fileWorkspaceVersionRef.current = scope.fileWorkspaceVersion;
    const file = readWorkspaceFile(root, "notes.md");
    scope.openFilesRef.current = [file]; scope.selectedFile = file; scope.visibleFiles = [file];
    functions.ensureFileDraft(file);
  }
  return { ...functions, scope, select, get: (root) => helpers.getFileEditorScope(scope.fileEditorScopesRef.current, root) };
}
function directories(t) {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "file-editor-owner-")));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const a = path.join(directory, "a"), b = path.join(directory, "b");
  fs.mkdirSync(a); fs.mkdirSync(b);
  fs.writeFileSync(path.join(a, "notes.md"), "Original A\n"); fs.writeFileSync(path.join(b, "notes.md"), "Original B\n");
  return { a, b };
}

test("actual save writes its captured directory and preserves the other root's current editor", async (t) => {
  const { a, b } = directories(t), h = await harness(a);
  h.select(a); h.updateFileDraft("notes.md", "Submitted A\n");
  let release;
  h.scope.desktopBridge.writeWorkspaceFile = async (...args) => { await new Promise(resolve => { release = resolve; }); return writeWorkspaceTextFile(...args); };
  const saving = h.saveFile("notes.md");
  h.select(b); h.updateFileDraft("notes.md", "Unsaved B\n");
  const bDraft = h.get(b).drafts["notes.md"];
  release(); await saving;
  assert.equal(fs.readFileSync(path.join(a, "notes.md"), "utf8"), "Submitted A\n");
  assert.equal(fs.readFileSync(path.join(b, "notes.md"), "utf8"), "Original B\n");
  assert.equal(h.get(b).drafts["notes.md"], bDraft);
  assert.equal(h.scope.selectedFile.content, "Original B\n");
  assert.equal(h.get(a).saving.size, 0);
  h.select(a);
  assert.equal(h.get(a).drafts["notes.md"].content, "Submitted A\n");
});

test("an actual external conflict can retain the local edit, then save and reopen cleanly", async (t) => {
  const { a } = directories(t), h = await harness(a);
  h.select(a); h.updateFileDraft("notes.md", "Local research note\n");
  fs.writeFileSync(path.join(a, "notes.md"), "External note\n");
  h.setFileConflicts({ "notes.md": "External note\n" });
  h.scope.fileConflicts = h.get(a).conflicts;
  h.dismissFileConflict("notes.md");
  assert.equal(h.get(a).drafts["notes.md"].content, "Local research note\n");
  await h.saveFile("notes.md");
  await h.reloadFile("notes.md");
  assert.equal(h.get(a).drafts["notes.md"].content, "Local research note\n");
  assert.equal(h.get(a).drafts["notes.md"].savedContent, "Local research note\n");
  assert.deepEqual(h.get(a).conflicts, {});
});
