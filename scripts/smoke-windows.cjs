// Run the actual Electron main/preload/renderer with disposable settings and data.
// Optional argument: an unpacked build's resources/app.asar.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");

if (!process.versions.electron) {
  const { spawnSync } = require("node:child_process");
  if (process.platform !== "win32") throw new Error("This smoke check requires Windows.");
  const root = path.resolve(__dirname, "..");
  const source = path.resolve(process.argv[2] || root);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes smoke 中文 "));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.VITE_DEV_SERVER_URL;
  let status = 1;
  try {
    const result = spawnSync(require("electron"), [__filename, source, scratch], {
      cwd: scratch, env, windowsHide: true, stdio: "inherit", timeout: 60000,
    });
    if (result.error) console.error(result.error.message);
    status = result.status ?? 1;
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }
  process.exit(status);
}

const { app, session } = require("electron");
const source = process.argv[2];
const scratch = process.argv[3];
const profile = path.join(scratch, "profile");
const workspace = path.join(scratch, "工作区 & files");
fs.mkdirSync(profile);
fs.mkdirSync(workspace);
fs.writeFileSync(path.join(profile, "last-workspace.json"), JSON.stringify({ workspace }));
app.setPath("userData", profile);
// The test must not call remote providers or download research data.
app.whenReady().then(() => session.defaultSession.webRequest.onBeforeRequest(
  { urls: ["http://*/*", "https://*/*"] }, (_details, callback) => callback({ cancel: true }),
));
const timeout = setTimeout(() => { console.error("Desktop smoke check timed out"); app.exit(1); }, 45000);
app.on("browser-window-created", (_event, win) => {
  win.hide();
  win.webContents.setBackgroundThrottling(false);
  win.webContents.once("did-finish-load", async () => {
    try {
      const result = await win.webContents.executeJavaScript(`(async () => {
        const bridge = window.researchDesk;
        if (!bridge || bridge.platform !== 'win32') throw new Error('Preload did not load');
        await document.fonts.ready;
        await Promise.all([...document.images].map((img) => img.complete ? Promise.resolve() : new Promise((resolve) => {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', resolve, { once: true });
        })));
        return { platform: bridge.platform, images: document.images.length,
          brokenImages: [...document.images].filter((img) => !img.naturalWidth).map((img) => img.getAttribute('src')),
          rendered: document.querySelector('#root').children.length > 0 };
      })()`);
      assert.equal(result.rendered, true);
      assert.deepEqual(result.brokenImages, []);
      // Use a fixed content viewport for package screenshots.
      win.setMinimumSize(960, 500);
      win.setSize(1280, 680);
      await new Promise((resolve) => setTimeout(resolve, 400));
      const screenshot = await win.webContents.capturePage();
      const output = path.resolve(__dirname, "../release/windows-smoke.png");
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(output, screenshot.toPNG());
      console.log(JSON.stringify({ ok: true, source, ...result, screenshot: output }));
      clearTimeout(timeout);
      app.quit();
    } catch (error) {
      console.error(error);
      clearTimeout(timeout);
      app.once("will-quit", () => app.exit(1));
      app.quit();
    }
  });
});
require(path.join(source, "electron/main.cjs"));
