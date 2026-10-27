const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const notes = require("./workbench-notes.cjs");

test("workbench notes persist per key and survive reload", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-workbench-notes-"));
  try {
    notes.initialize(directory);
    notes.saveNote("thread-1", "# Scratch\nDraft prompt");
    assert.equal(notes.getNote("thread-1").content, "# Scratch\nDraft prompt");
    assert.ok(notes.getNote("thread-1").updatedAt);

    notes.initialize(directory);
    assert.equal(notes.getNote("thread-1").content, "# Scratch\nDraft prompt");
    assert.equal(notes.getNote("thread-2").content, "");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("workbench notes clear empty content and delete explicitly", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-workbench-notes-"));
  try {
    notes.initialize(directory);
    notes.saveNote("draft", "hello");
    notes.saveNote("draft", "   ");
    assert.equal(notes.getNote("draft").content, "");

    notes.saveNote("thread-2", "keep");
    assert.deepEqual(notes.deleteNote("thread-2"), { deleted: true });
    assert.deepEqual(notes.deleteNote("thread-2"), { deleted: false });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("workbench notes reject empty keys", () => {
  assert.throws(() => notes.saveNote("", "content"), /note key/i);
  assert.throws(() => notes.getNote("   "), /note key/i);
});
