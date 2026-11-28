const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const editor = read("src/SharedNoteEditor.tsx");
const writing = read("src/PaperWritingView.tsx");

test("shared note editor never reports edits before the document loads", () => {
  // The pane starts with the caller's source text and stays read-only until a
  // fetch succeeds, so an unavailable collaboration service cannot feed an
  // empty draft back into the caller's autosave.
  assert.match(editor, /useState\(initialText\)/);
  assert.match(editor, /const \[loaded, setLoaded\] = useState\(false\)/);
  assert.match(editor, /if \(loadedRef\.current\) onTextChangeRef\.current\?\.\(text\.toString\(\)\)/);
  assert.match(editor, /disabled=\{!loaded\}/);
  assert.match(editor, /loadedRef\.current = true;/);
  assert.match(editor, /text\.length === 0 && initialTextRef\.current/);
});

test("paper writing only mounts the co-edit pane for a loaded document", () => {
  assert.match(writing, /initialText=\{draft\}/);
  assert.match(writing, /docKey=\{`latex:\$\{file\.path\}`\}/);
  assert.match(writing, /onTextChange=\{\(text\) => \{ setDraft\(text\); \}\}/);
});
