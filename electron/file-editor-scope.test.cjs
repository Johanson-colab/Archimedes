const assert = require("node:assert/strict");
const test = require("node:test");

const path = "README.md";
const rootA = "/research/project-a";
const rootB = "/research/project-b";

async function helpers() {
  return import("../src/file-editor.ts");
}

function draft(content, savedContent = content) {
  return { path, content, savedContent, lineEnding: "\n", modifiedAt: "2026-11-16T00:00:00Z" };
}

test("same relative paths keep independent drafts and feedback in each execution root", async () => {
  const { getFileEditorScope, updateFileEditorScope, isDraftDirty } = await helpers();
  let scopes = updateFileEditorScope({}, rootA, (scope) => ({ ...scope, drafts: { [path]: draft("Unsaved A", "Original A") }, errors: { [path]: "A save error" } }));
  scopes = updateFileEditorScope(scopes, rootB, (scope) => ({ ...scope, drafts: { [path]: draft("Original B") } }));
  assert.equal(getFileEditorScope(scopes, rootB).drafts[path].content, "Original B");
  assert.equal(getFileEditorScope(scopes, rootB).errors[path], undefined);
  assert.equal(getFileEditorScope(scopes, rootA).drafts[path].content, "Unsaved A");
  assert.equal(isDraftDirty(getFileEditorScope(scopes, rootA).drafts[path]), true);
});

test("a delayed A save completion leaves the active B draft and its feedback untouched", async () => {
  const { getFileEditorScope, updateFileEditorScope, finishFileEditorSave, isDraftDirty } = await helpers();
  let scopes = updateFileEditorScope({}, rootA, (scope) => ({ ...scope, drafts: { [path]: draft("Submitted A", "Original A") }, conflicts: { [path]: "External A" } }));
  let resolveSave;
  const saveResponse = new Promise((resolve) => { resolveSave = resolve; });
  const completion = saveResponse.then(() => {
    scopes = finishFileEditorSave(scopes, rootA, path, "Submitted A", "2026-11-16T01:00:00Z");
  });

  scopes = updateFileEditorScope(scopes, rootB, (scope) => ({
    ...scope,
    drafts: { [path]: draft("Unsaved B", "Original B") },
    saving: new Set([path]),
    conflicts: { [path]: "External B" },
    errors: { [path]: "B save error" },
  }));
  const beforeB = getFileEditorScope(scopes, rootB);
  resolveSave();
  await completion;

  assert.equal(getFileEditorScope(scopes, rootB), beforeB);
  assert.equal(isDraftDirty(beforeB.drafts[path]), true);
  assert.equal(getFileEditorScope(scopes, rootA).drafts[path].savedContent, "Submitted A");
  assert.equal(isDraftDirty(getFileEditorScope(scopes, rootA).drafts[path]), false);
  assert.deepEqual(getFileEditorScope(scopes, rootA).conflicts, {});
});

test("save completion preserves edits made after submission and does not reopen closed drafts", async () => {
  const { getFileEditorScope, updateFileEditorScope, finishFileEditorSave, isDraftDirty } = await helpers();
  let scopes = updateFileEditorScope({}, rootA, (scope) => ({ ...scope, drafts: { [path]: draft("A plus later keystrokes", "Original A") } }));
  scopes = finishFileEditorSave(scopes, rootA, path, "Submitted A", "2026-11-16T01:00:00Z");
  const latest = getFileEditorScope(scopes, rootA).drafts[path];
  assert.equal(latest.content, "A plus later keystrokes");
  assert.equal(latest.savedContent, "Submitted A");
  assert.equal(isDraftDirty(latest), true);

  scopes = updateFileEditorScope(scopes, rootA, (scope) => ({ ...scope, drafts: {} }));
  scopes = finishFileEditorSave(scopes, rootA, path, "A plus later keystrokes", "2026-11-16T02:00:00Z");
  assert.equal(getFileEditorScope(scopes, rootA).drafts[path], undefined);
});

test("closing the app detects dirty drafts outside the currently viewed root", async () => {
  const { updateFileEditorScope, hasDirtyFileEditorScopes, finishFileEditorSave } = await helpers();
  let scopes = updateFileEditorScope({}, rootA, (scope) => ({ ...scope, drafts: { [path]: draft("Hidden A edit", "Original A") } }));
  scopes = updateFileEditorScope(scopes, rootB, (scope) => ({ ...scope, drafts: { [path]: draft("Original B") } }));
  assert.equal(hasDirtyFileEditorScopes(scopes), true);
  scopes = finishFileEditorSave(scopes, rootA, path, "Hidden A edit", "2026-11-16T01:00:00Z");
  assert.equal(hasDirtyFileEditorScopes(scopes), false);
});
