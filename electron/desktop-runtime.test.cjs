const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { electronBinary, prepareDesktop } = require("../scripts/electron-runtime.cjs");
const { testFiles } = require("../scripts/run-tests.cjs");

const platformExecutable = process.platform === "darwin" ? "Electron.app/Contents/MacOS/Electron" : process.platform === "win32" ? "electron.exe" : "electron";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-runtime-check-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "index.js"), "throw new Error('The implicit download entry must never be loaded')");
  return root;
}

function writeExecutable(moduleRoot) {
  const binary = path.join(moduleRoot, "dist", platformExecutable);
  fs.mkdirSync(path.dirname(binary), { recursive: true });
  fs.writeFileSync(binary, "fixture");
  return binary;
}

function writeCompleteRuntime(moduleRoot, version) {
  const binary = writeExecutable(moduleRoot);
  fs.writeFileSync(path.join(moduleRoot, "path.txt"), platformExecutable);
  fs.writeFileSync(path.join(moduleRoot, "dist", "version"), version);
  return binary;
}

function completeInstallerSource(version) {
  return `
    const fs = require("node:fs");
    const path = require("node:path");
    const platformPath = ${JSON.stringify(platformExecutable)};
    const binary = path.join(__dirname, "dist", platformPath);
    fs.mkdirSync(path.dirname(binary), { recursive: true });
    fs.writeFileSync(binary, "fixture");
    fs.writeFileSync(path.join(__dirname, "dist", "version"), ${JSON.stringify(version)});
    fs.writeFileSync(path.join(__dirname, "path.txt"), platformPath);
  `;
}

function stalledInstallerSource(pidFile) {
  return `
    const fs = require("node:fs");
    const path = require("node:path");
    const binary = path.join(__dirname, "dist", ${JSON.stringify(platformExecutable)});
    fs.mkdirSync(path.dirname(binary), { recursive: true });
    fs.writeFileSync(binary, "fixture");
    fs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
    setInterval(() => {}, 1000);
  `;
}

async function waitForFile(file, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(file)) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${file}`);
}

test("missing desktop runtime fails immediately without evaluating Electron's download entry", t => {
  const moduleRoot = fixture(t), started = Date.now();
  assert.throws(() => electronBinary({ moduleRoot, override: "" }), /npm run prepare:desktop/);
  assert.ok(Date.now() - started < 1000);
  const binary = writeCompleteRuntime(moduleRoot, "1.0.0");
  assert.equal(electronBinary({ moduleRoot, override: "" }), binary);
});

test("executable-only or incomplete desktop runtime state is never reported ready", t => {
  const moduleRoot = fixture(t);
  const binary = writeExecutable(moduleRoot);
  assert.throws(() => electronBinary({ moduleRoot, override: "" }), /path\.txt is missing[\s\S]*npm run prepare:desktop/);
  fs.writeFileSync(path.join(moduleRoot, "path.txt"), platformExecutable);
  assert.throws(() => electronBinary({ moduleRoot, override: "" }), /dist\/version is missing[\s\S]*npm run prepare:desktop/);
  fs.writeFileSync(path.join(moduleRoot, "dist", "version"), "1.0.0");
  fs.writeFileSync(path.join(moduleRoot, "package.json"), JSON.stringify({ name: "electron", version: "2.0.0" }));
  assert.throws(() => electronBinary({ moduleRoot, override: "" }), /does not match package version[\s\S]*npm run prepare:desktop/);
  fs.writeFileSync(path.join(moduleRoot, "dist", "version"), "2.0.0");
  fs.writeFileSync(path.join(moduleRoot, "path.txt"), "unexpected-path");
  assert.throws(() => electronBinary({ moduleRoot, override: "" }), /path\.txt points at[\s\S]*npm run prepare:desktop/);
  fs.writeFileSync(path.join(moduleRoot, "path.txt"), platformExecutable);
  fs.rmSync(binary);
  assert.throws(() => electronBinary({ moduleRoot, override: "" }), /executable is missing[\s\S]*npm run prepare:desktop/);
  writeExecutable(moduleRoot);
  assert.equal(electronBinary({ moduleRoot, override: "" }), binary);
});

test("an explicit dist override remains usable without install metadata", t => {
  const moduleRoot = fixture(t), override = path.join(moduleRoot, "custom-dist");
  const binary = path.join(override, platformExecutable);
  fs.mkdirSync(path.dirname(binary), { recursive: true });
  fs.writeFileSync(binary, "fixture");
  assert.equal(electronBinary({ moduleRoot, override }), binary);
  fs.rmSync(binary);
  assert.throws(() => electronBinary({ moduleRoot, override }), /overridden executable is missing[\s\S]*npm run prepare:desktop/);
});

test("a complete fixture install prepares and returns the desktop binary", async t => {
  const moduleRoot = fixture(t), version = "9.9.9";
  fs.writeFileSync(path.join(moduleRoot, "package.json"), JSON.stringify({ name: "electron", version }));
  fs.writeFileSync(path.join(moduleRoot, "install.js"), completeInstallerSource(version));
  assert.throws(() => electronBinary({ moduleRoot, override: "" }), /npm run prepare:desktop/);
  const binary = await prepareDesktop({ moduleRoot, override: "", timeoutMs: 30000 });
  assert.equal(binary, path.join(moduleRoot, "dist", platformExecutable));
  assert.equal(fs.readFileSync(path.join(moduleRoot, "path.txt"), "utf8"), platformExecutable);
  assert.equal(fs.readFileSync(path.join(moduleRoot, "dist", "version"), "utf8"), version);
});

test("cancelling preparation kills the installer it owns and reports cancellation", async t => {
  const moduleRoot = fixture(t), pidFile = path.join(moduleRoot, "installer.pid"), started = Date.now();
  fs.writeFileSync(path.join(moduleRoot, "install.js"), stalledInstallerSource(pidFile));
  const controller = new AbortController();
  const pending = prepareDesktop({ moduleRoot, override: "", timeoutMs: 30000, signal: controller.signal });
  await waitForFile(pidFile);
  const pid = Number(fs.readFileSync(pidFile, "utf8"));
  assert.ok(Number.isInteger(pid) && pid > 0, `installer wrote a valid pid: ${pid}`);
  controller.abort();
  await assert.rejects(pending, /cancelled/);
  assert.ok(Date.now() - started < 5000, "cancellation must not wait for the timeout");
  assert.throws(() => process.kill(pid, 0), error => error.code === "ESRCH", "installer process must be gone");
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
