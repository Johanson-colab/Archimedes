const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const APP_NAME = "Archimedes";
const SHELL_REVISION = "2";
const electronExecutable = require("electron");

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}.`);
}

function macIcon(source, destination) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-iconset-"));
  const iconset = path.join(temporaryRoot, "archimedes.iconset");
  fs.mkdirSync(iconset);
  const entries = [
    [16, "icon_16x16.png"], [32, "icon_16x16@2x.png"],
    [32, "icon_32x32.png"], [64, "icon_32x32@2x.png"],
    [128, "icon_128x128.png"], [256, "icon_128x128@2x.png"],
    [256, "icon_256x256.png"], [512, "icon_256x256@2x.png"],
    [512, "icon_512x512.png"], [1024, "icon_512x512@2x.png"],
  ];
  try {
    for (const [size, name] of entries) run("sips", ["-z", String(size), String(size), source, "--out", path.join(iconset, name)]);
    run("iconutil", ["-c", "icns", iconset, "-o", destination]);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function brandedMacApplication() {
  const sourceApp = path.resolve(electronExecutable, "../../..");
  const sourceInfo = path.join(sourceApp, "Contents", "Info.plist");
  const icon = path.join(__dirname, "..", "electron", "assets", "app-icon-256.png");
  const fingerprint = [SHELL_REVISION, fs.statSync(sourceInfo).mtimeMs, fs.statSync(icon).mtimeMs]
    .map((value) => Math.floor(value).toString(36)).join("-");
  const destination = path.join(os.tmpdir(), "archimedes-electron-shell", fingerprint, `${APP_NAME}.app`);
  const executable = path.join(destination, "Contents", "MacOS", "Electron");

  if (!fs.existsSync(destination)) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.cpSync(sourceApp, destination, { recursive: true, dereference: true });
  }
  if (!fs.existsSync(path.join(destination, "Contents", "Resources", "archimedes.icns"))) {
    const plist = path.join(destination, "Contents", "Info.plist");
    macIcon(icon, path.join(destination, "Contents", "Resources", "archimedes.icns"));
    run("plutil", ["-replace", "CFBundleDisplayName", "-string", APP_NAME, plist]);
    run("plutil", ["-replace", "CFBundleName", "-string", APP_NAME, plist]);
    run("plutil", ["-replace", "CFBundleIconFile", "-string", "archimedes", plist]);
  }
  return executable;
}

const args = process.argv.slice(2);
const executable = process.platform === "darwin" ? brandedMacApplication() : electronExecutable;
const child = spawn(executable, args, { stdio: "inherit", env: process.env });
child.on("error", (error) => { throw error; });
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
