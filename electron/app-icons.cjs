const path = require("node:path");

function windowIconPath(platform = process.platform, resourcesPath) {
  const directory = resourcesPath ? path.join(resourcesPath, "icons") : path.join(__dirname, "assets");
  return path.join(directory, platform === "win32" ? "app-icon.ico" : "app-icon-256.png");
}

function configureAppIcon(app, platform = process.platform, resourcesPath = app.isPackaged ? process.resourcesPath : undefined) {
  // BrowserWindow.icon does not set the macOS Dock icon. PNG is accepted by
  // Electron's Dock API; the packager embeds ICNS in the .app bundle separately.
  if (platform === "darwin" && app.dock) {
    app.dock.setIcon(resourcesPath ? path.join(resourcesPath, "icons", "app-icon-1024.png") : path.join(__dirname, "assets", "app-icon-1024.png"));
  }
}

function quoteWindowsArgument(value) {
  return `"${String(value).replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`;
}

function configureWindowIcon(app, window, platform = process.platform, executable = process.execPath) {
  if (platform !== "win32") return;
  const icon = windowIconPath(platform, app.isPackaged ? process.resourcesPath : undefined);
  // WM_SETICON covers both the preview/title icon and a running window. The
  // relaunch metadata separately overrides electron.exe's generic group icon.
  window.setIcon(icon);
  window.setAppDetails({
    appId: "com.archimedes.research",
    appIconPath: icon,
    appIconIndex: 0,
    relaunchCommand: app.isPackaged ? quoteWindowsArgument(executable) : `${quoteWindowsArgument(executable)} ${quoteWindowsArgument(app.getAppPath())}`,
    relaunchDisplayName: "Archimedes",
  });
}

module.exports = { windowIconPath, configureAppIcon, configureWindowIcon };
