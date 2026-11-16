const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { electronBinary, prepareDesktop } = require("../scripts/electron-runtime.cjs");
const { testFiles } = require("../scripts/run-tests.cjs");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-runtime-check-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "index.js"), "throw new Error('The implicit download entry must never be loaded')");
  return root;
}

test("missing desktop runtime fails immediately without evaluating Electron's download entry", t => {
  const moduleRoot = fixture(t), started = Date.now();
  assert.throws(() => electronBinary({ moduleRoot, override: "" }), /npm run prepare:desktop/);
  assert.ok(Date.now() - started < 1000);
  fs.writeFileSync(path.join(moduleRoot, "path.txt"), "fixture-electron");
  fs.mkdirSync(path.join(moduleRoot, "dist"));
  const binary = path.join(moduleRoot, "dist/fixture-electron");
  fs.writeFileSync(binary, "fixture");
  assert.equal(electronBinary({ moduleRoot, override: "" }), binary);
});

test("explicit preparation times out a stalled installer instead of hanging the test runner", async t => {
  const moduleRoot = fixture(t), started = Date.now();
  fs.writeFileSync(path.join(moduleRoot, "install.js"), "setInterval(() => {}, 1000)");
  await assert.rejects(prepareDesktop({ moduleRoot, timeoutMs: 150 }), /preparation exceeded/);
  assert.ok(Date.now() - started < 5000);
});

test("full test inventory retains both real desktop regressions and every core file", () => {
  const all = testFiles(), core = testFiles("core"), desktop = testFiles("desktop");
  assert.deepEqual(desktop, ["electron/chat-layout-width.test.cjs", "electron/pdf-root-layout.test.cjs"]);
  assert.deepEqual([...core, ...desktop].sort(), all);
  assert.ok(all.some(file => file.startsWith("electron/figure-forge-upstream-")));
  assert.ok(all.some(file => file.startsWith("server/")));
});
