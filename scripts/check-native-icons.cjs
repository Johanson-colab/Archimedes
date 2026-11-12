// Run with Electron, not Node: electron scripts/check-native-icons.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { app, BrowserWindow, nativeImage } = require("electron");
const { windowIconPath, configureAppIcon, configureWindowIcon } = require("../electron/app-icons.cjs");

app.setPath("userData", path.join(os.tmpdir(), "opencode", "archimedes-icon-smoke"));
app.whenReady().then(async () => {
  const baseline = process.env.ARCHIMEDES_ICON_BASELINE;
  const iconPath = baseline || windowIconPath();
  const image = nativeImage.createFromPath(iconPath);
  assert.equal(image.isEmpty(), false, "Electron must decode the platform icon");
  configureAppIcon(app);
  const window = new BrowserWindow({ show: false, icon: iconPath, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  if (!baseline) configureWindowIcon(app, window);
  await window.loadURL("data:text/html,<title>Archimedes icon smoke test</title>");
  assert.ok(window.getNativeWindowHandle().length);
  const result = { platform: process.platform, electron: process.versions.electron, icon: path.basename(iconPath), decodedSize: image.getSize(), windowCreated: true };
  if (process.platform === "win32") {
    const handle = window.getNativeWindowHandle();
    const value = handle.length === 8 ? handle.readBigUInt64LE().toString() : String(handle.readUInt32LE());
    const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(__dirname, "check-windows-window-icons.ps1"), "-Handle", value, "-ExpectedIcon", windowIconPath(), "-RedactPaths"];
    if (baseline) args.push("-InspectOnly");
    if (process.env.ARCHIMEDES_WINDOW_ICON_AUDIT_OUTPUT) args.push("-OutputPath", process.env.ARCHIMEDES_WINDOW_ICON_AUDIT_OUTPUT);
    if (process.env.ARCHIMEDES_WINDOW_ICON_PREVIEW_PREFIX) args.push("-PreviewPrefix", process.env.ARCHIMEDES_WINDOW_ICON_PREVIEW_PREFIX);
    // Keep Electron's event loop responsive while the other process reads HWND.
    await new Promise((resolve, reject) => execFile("powershell.exe", args, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) reject(new Error(`${stdout}\n${stderr}`));
      else { console.log(stdout); resolve(); }
    }));
    result.windowAndTaskbarPropertiesVerified = !baseline;
  }
  console.log(JSON.stringify(result));
  const output = process.env.ARCHIMEDES_ICON_SMOKE_OUTPUT;
  if (output) fs.writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
  window.destroy();
  app.quit();
}).catch((error) => { console.error(error); app.exit(1); });
