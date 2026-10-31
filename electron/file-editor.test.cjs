const assert = require("node:assert/strict");
const test = require("node:test");

async function helpers() {
  return import("../src/file-editor.ts");
}

const markdownFile = {
  name: "notes.md",
  path: "notes.md",
  kind: "markdown",
  size: 32,
  modifiedAt: "2026-10-22T00:00:00.000Z",
  content: "# Notes\r\n\r\nFirst line\r\n",
};

test("accepts editable text and rejects binary or oversized files", async () => {
  const { isEditableFile } = await helpers();
  assert.equal(isEditableFile(markdownFile), true);
  assert.equal(isEditableFile({ ...markdownFile, kind: "text", size: 10 }), true);
  assert.equal(isEditableFile({ ...markdownFile, kind: "pdf" }), false);
  assert.equal(isEditableFile({ ...markdownFile, kind: "image" }), false);
  assert.equal(isEditableFile({ ...markdownFile, size: 2_000_001 }), false);
  assert.equal(isEditableFile(null), false);
});

test("normalizes CRLF while editing and restores it when saving", async () => {
  const { createFileDraft, isDraftDirty, prepareFileContent } = await helpers();
  const draft = createFileDraft(markdownFile);
  assert.ok(draft);
  assert.equal(draft.content, "# Notes\n\nFirst line\n");
  assert.equal(draft.savedContent, draft.content);
  assert.equal(draft.lineEnding, "\r\n");
  assert.equal(isDraftDirty(draft), false);

  draft.content += "Second line\n";
  assert.equal(isDraftDirty(draft), true);
  assert.equal(prepareFileContent(draft), "# Notes\r\n\r\nFirst line\r\nSecond line\r\n");
});

test("keeps dirty buffers and reports external conflicts", async () => {
  const { createFileDraft, mergeRefreshedFiles } = await helpers();
  const draft = createFileDraft(markdownFile);
  assert.ok(draft);
  draft.content = "# Notes\n\nLocal edit\n";
  const current = { ...markdownFile, content: "# Notes\r\n\r\nFirst line\r\n" };
  const dirty = { [draft.path]: draft };

  const unchanged = mergeRefreshedFiles([current], [{ ...current }], dirty);
  assert.deepEqual(unchanged.conflicts, {});
  assert.equal(unchanged.files[0], current);

  const changed = mergeRefreshedFiles(
    [current],
    [{ ...current, content: "# Notes\r\n\r\nChanged elsewhere\r\n" }],
    dirty,
  );
  assert.deepEqual(changed.conflicts, { "notes.md": "# Notes\n\nChanged elsewhere\n" });
  assert.equal(changed.files[0], current);

  const clean = mergeRefreshedFiles([current], [{ ...current, content: "# Clean\r\n" }], {});
  assert.equal(clean.files[0].content, "# Clean\r\n");
  assert.deepEqual(clean.conflicts, {});

  const saving = mergeRefreshedFiles(
    [current],
    [{ ...current, content: "# Notes\r\n\r\nChanged elsewhere\r\n" }],
    dirty,
    new Set(["notes.md"]),
  );
  assert.deepEqual(saving.conflicts, {});
  assert.equal(saving.files[0], current);
});

test("formats a line comment as a readable chat request", async () => {
  const { formatFileComment } = await helpers();
  assert.equal(
    formatFileComment({ path: "src/experiment.py", startLine: 2, endLine: 2, excerpt: "return 1\n", body: "  Explain this value.  " }),
    "Review comment on `src/experiment.py` (line 2):\n> return 1\n\nExplain this value.",
  );
  assert.match(
    formatFileComment({ path: "src/a.ts", startLine: 3, endLine: 5, excerpt: "a\nb", body: "Tighten this" }),
    /\(lines 3-5\):\n> a\n> b\n\nTighten this/,
  );
});

test("tracks a successful save without dropping later keystrokes", async () => {
  const { createFileDraft, isDraftDirty, markDraftSaved } = await helpers();
  const draft = createFileDraft(markdownFile);
  assert.ok(draft);
  draft.content = "# Notes\n\nSaved text\n";
  const saved = markDraftSaved(draft, draft.content, "2026-10-22T01:00:00.000Z");
  assert.equal(isDraftDirty(saved), false);

  saved.content += "\nTyped during save\n";
  const stillSaved = markDraftSaved(saved, "# Notes\n\nSaved text\n", "2026-10-22T01:00:00.000Z");
  assert.equal(isDraftDirty(stillSaved), true);
  assert.equal(stillSaved.content, "# Notes\n\nSaved text\n\nTyped during save\n");
});
