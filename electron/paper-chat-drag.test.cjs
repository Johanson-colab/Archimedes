const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("desktop drop uses Electron's native File path API and rejects synthetic files", async () => {
  let bridge, call;
  const preload = fs.readFileSync(path.join(__dirname, "preload.cjs"), "utf8");
  const electron = {
    contextBridge: { exposeInMainWorld: (_name, value) => { bridge = value; } },
    ipcRenderer: { invoke: (...args) => { call = args; return Promise.resolve([]); }, on: () => {} },
    webUtils: { getPathForFile: (file) => file.nativePath || "" },
  };
  vm.runInNewContext(preload, { require: (name) => { assert.equal(name, "electron"); return electron; }, process });
  await bridge.attachDroppedFiles([{ nativePath: "/tmp/a.py" }, { nativePath: "/tmp/folder" }]);
  assert.equal(call[0], "context:attach-dropped-paths");
  assert.deepEqual(Array.from(call[1]), ["/tmp/a.py", "/tmp/folder"]);
  await assert.rejects(() => bridge.attachDroppedFiles([{}]), /Could not read/);
});

test("paper chat passes dropped attachments into the model context", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "LibraryView.tsx"), "utf8");
  assert.match(source, /application\/x-archimedes-repository-path/);
  assert.match(source, /bridge\.attachDroppedFiles\(files\)/);
  assert.match(source, /\.\.\.\(options\.initialBriefing \? \[\] : droppedAttachments\)/);
  assert.match(source, /onRemoveDropped/);
});
