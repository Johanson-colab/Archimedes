const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const config = require("../electron-builder.config.cjs");
const { windowIconPath, configureAppIcon } = require("./app-icons.cjs");
const root = path.join(__dirname, "..");

test("Windows EXE, installer, uninstaller and wizard all reference the approved multi-size ICO", () => {
  assert.equal(config.win.icon, "electron/assets/app-icon.ico");
  assert.equal(config.win.signAndEditExecutable, true);
  for (const key of ["installerIcon", "uninstallerIcon", "installerHeaderIcon"]) {
    assert.equal(config.nsis[key], config.win.icon);
    assert.ok(fs.existsSync(path.join(root, config.nsis[key])));
  }
  assert.equal(config.nsis.shortcutName, "Archimedes");
  assert.equal(config.nsis.deleteAppDataOnUninstall, false);
});

test("macOS bundle and DMG both reference the ICNS and keep native dependency rebuilds enabled", () => {
  assert.equal(config.mac.icon, "electron/assets/app-icon.icns");
  assert.equal(config.dmg.icon, config.mac.icon);
  assert.ok(fs.existsSync(path.join(root, config.mac.icon)));
  assert.equal(config.npmRebuild, true);
  assert.equal(config.appId, "com.archimedes.research");
  assert.equal(config.publish, null);
});

test("packaged Dock and window icons resolve outside ASAR, with development fallbacks", () => {
  const resources = path.join(root, "fake-resources");
  assert.equal(windowIconPath("win32", resources), path.join(resources, "icons/app-icon.ico"));
  assert.equal(windowIconPath("linux", resources), path.join(resources, "icons/app-icon-256.png"));
  const seen = [];
  configureAppIcon({ isPackaged: true, dock: { setIcon: (file) => seen.push(file) } }, "darwin", resources);
  assert.deepEqual(seen, [path.join(resources, "icons/app-icon-1024.png")]);
  assert.equal(path.basename(windowIconPath("win32")), "app-icon.ico");
  assert.equal(config.extraResources[0].to, "icons");
  assert.equal(config.extraResources[0].filter.length, 4);
});

test("packaging includes server/shared runtime code, excludes env files and uses file-safe renderer URLs", () => {
  assert.ok(config.files.includes("server/**/*"));
  assert.ok(config.files.includes("shared/**/*"));
  assert.ok(config.files.includes("!**/.env.*"));
  assert.ok(config.asarUnpack.includes("node_modules/node-pty/**/*"));
  const vite = fs.readFileSync(path.join(root, "vite.config.ts"), "utf8");
  assert.match(vite, /base: "\.\/"/);
  const manifest = require("../package.json");
  for (const key of ["package:desktop", "dist:win", "dist:mac"]) assert.match(manifest.scripts[key], /--publish never/);
  assert.equal(manifest.devDependencies["electron-builder"], "26.18.0");
});
