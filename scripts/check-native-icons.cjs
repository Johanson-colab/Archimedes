// Run with Electron, not Node: electron scripts/check-native-icons.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow, nativeImage } = require("electron");
const { windowIconPath, configureAppIcon } = require("../electron/app-icons.cjs");

app.setPath("userData", path.join(os.tmpdir(), "opencode", "archimedes-icon-smoke"));
app.whenReady().then(async () => {
  const iconPath = windowIconPath();
  const image = nativeImage.createFromPath(iconPath);
  assert.equal(image.isEmpty(), false, "Electron must decode the platform icon");
  configureAppIcon(app);
  const window = new BrowserWindow({ show: false, icon: iconPath, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  await window.loadURL("data:text/html,<title>Archimedes icon smoke test</title>");
  assert.ok(window.getNativeWindowHandle().length);
  const result = { platform: process.platform, electron: process.versions.electron, icon: path.basename(iconPath), decodedSize: image.getSize(), windowCreated: true };
  console.log(JSON.stringify(result));
  const output = process.env.ARCHIMEDES_ICON_SMOKE_OUTPUT;
  if (output) fs.writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
  window.destroy();
  app.quit();
}).catch((error) => { console.error(error); app.exit(1); });
