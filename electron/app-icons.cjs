const path = require("node:path");

function windowIconPath(platform = process.platform) {
  return path.join(__dirname, "assets", platform === "win32" ? "app-icon.ico" : "app-icon-256.png");
}

function configureAppIcon(app, platform = process.platform) {
  // BrowserWindow.icon does not set the macOS Dock icon. PNG is accepted by
  // Electron's Dock API; ICNS is provided separately for a future .app bundle.
  if (platform === "darwin" && app.dock) {
    app.dock.setIcon(path.join(__dirname, "assets", "app-icon-1024.png"));
  }
}

module.exports = { windowIconPath, configureAppIcon };
