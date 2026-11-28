const assert = require("node:assert/strict");
const test = require("node:test");
const { installMainWindowLinks } = require("./main-window-links.cjs");

test("web links use the external browser and never create an Electron popup", async () => {
  let handler;
  const opened = [];
  installMainWindowLinks({ setWindowOpenHandler: (value) => { handler = value; } }, { openExternal: async (url) => opened.push(url) });
  for (const url of ["http://127.0.0.1:8765/", "http://localhost:8765/", "https://example.org/paper"]) {
    assert.deepEqual(handler({ url }), { action: "deny" });
  }
  await new Promise(setImmediate);
  assert.deepEqual(opened, ["http://127.0.0.1:8765/", "http://localhost:8765/", "https://example.org/paper"]);
});

test("non-web targets cannot launch external programs or child windows", async () => {
  let handler;
  const opened = [];
  installMainWindowLinks({ setWindowOpenHandler: (value) => { handler = value; } }, { openExternal: async (url) => opened.push(url) });
  for (const url of ["file:///etc/passwd", "javascript:alert(1)", "data:text/html,test", "custom-app://run", "invalid"]) assert.deepEqual(handler({ url }), { action: "deny" });
  await new Promise(setImmediate);
  assert.deepEqual(opened, []);
});

test("a browser-launch failure is handled without an unhandled rejection or popup", async () => {
  let handler, failed = false;
  installMainWindowLinks({ setWindowOpenHandler: (value) => { handler = value; } }, {
    openExternal: async () => { throw new Error("No browser"); }, onError: () => { failed = true; },
  });
  assert.deepEqual(handler({ url: "http://127.0.0.1:8765/" }), { action: "deny" });
  await new Promise(setImmediate);
  assert.equal(failed, true);
});
