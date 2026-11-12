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

module.exports = { windowIconPath, configureAppIcon };
