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

test("a failed note change preserves all existing notes on disk and in memory", async (t) => {
  for (const [name, change, content] of [
    ["update", () => notes.saveNote("thread-1", "revised experiment note"), "revised experiment note"],
    ["clear", () => notes.saveNote("thread-1", " "), ""],
    ["delete", () => notes.deleteNote("thread-1"), ""],
  ]) {
    await t.test(name, (t) => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-workbench-notes-"));
      t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
      const file = path.join(directory, "workbench-notes.json");
      const original = {
        "thread-1": { content: "original experiment note", updatedAt: "2026-11-25T12:00:00.000Z" },
        "thread-2": { content: "unrelated literature note", updatedAt: "2026-11-24T12:00:00.000Z" },
      };
      const originalJson = `${JSON.stringify(original, null, 2)}\n`;
      const readNotes = () => Object.fromEntries(Object.keys(original).map((key) => [key, notes.getNote(key)]));
      const write = fs.writeFileSync;
      write(file, originalJson);
      notes.initialize(directory);
      t.mock.method(fs, "writeFileSync", (target, text, options) => {
        write(target, text.slice(0, 12), options);
        throw new Error("Simulated partial write");
      });

      assert.throws(change, /Simulated partial write/);
      assert.deepEqual({ notes: readNotes(), json: fs.readFileSync(file, "utf8") }, { notes: original, json: originalJson });
      notes.initialize(directory);
      assert.deepEqual(readNotes(), original);

      t.mock.restoreAll();
      change();
      notes.initialize(directory);
      assert.equal(notes.getNote("thread-1").content, content);
      assert.deepEqual(notes.getNote("thread-2"), original["thread-2"]);
    });
  }
});
