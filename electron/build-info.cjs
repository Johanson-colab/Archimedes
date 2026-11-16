const fs = require("node:fs");
const path = require("node:path");

function getBuildInfo({ isPackaged = false, appPath = path.join(__dirname, ".."), platform = process.platform, arch = process.arch } = {}) {
  let source;
  if (isPackaged) {
    try { source = JSON.parse(fs.readFileSync(path.join(appPath, ".archimedes/build-info.json"), "utf8")); }
    catch { source = { version: require("../package.json").version, commit: "unknown", channel: "unknown", sourceDirty: null, sourceFingerprint: null, capabilities: null }; }
  } else source = require("../scripts/build-info.cjs").collectBuildInfo(appPath);
  return { ...source, platform, arch, packaged: isPackaged, electron: process.versions.electron || null };
}
module.exports = { getBuildInfo };
