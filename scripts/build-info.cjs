const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");

function collectBuildInfo(root, { channel = process.env.ARCHIMEDES_BUILD_CHANNEL } = {}) {
  const git = (...args) => { try { return execFileSync("git", args, { cwd: root, encoding: "utf8", timeout: 10000, stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } };
  const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
  const commit = git("rev-parse", "HEAD");
  const branch = git("branch", "--show-current");
  const tag = git("describe", "--tags", "--exact-match");
  const files = git("ls-files", "-co", "--exclude-standard").split("\n").filter(file => /^(src|electron|server|shared|scripts)\//.test(file) && /\.(cjs|mjs|ts|tsx|json|css|html)$/.test(file) || /^(package(-lock)?\.json|vite\.config\.ts|electron-builder\.config\.cjs)$/.test(file)).sort();
  const digest = createHash("sha256");
  for (const file of files) if (fs.existsSync(path.join(root, file))) digest.update(file + "\0").update(fs.readFileSync(path.join(root, file))).update("\0");
  const cloudFile = path.join(root, "src/cloud-features.ts");
  const cloud = !fs.existsSync(cloudFile) || !/CLOUD_FEATURES_ENABLED\s*=\s*false/.test(fs.readFileSync(cloudFile, "utf8"));
  const apps = JSON.parse(fs.readFileSync(path.join(root, "shared/research-apps.json"), "utf8")).apps;
  return { version, commit: commit || "unknown", channel: channel || (!commit ? "unknown" : tag || branch.startsWith("release/") ? "release" : "development"), branch: branch || null, sourceDirty: commit ? Boolean(git("status", "--porcelain")) : null, sourceFingerprint: commit ? digest.digest("hex") : null, capabilities: { cloudEntryPoints: cloud, defaultResearchApps: Object.entries(apps).filter(([, app]) => app.defaultEnabled).map(([id]) => id), betaResearchApps: Object.entries(apps).filter(([, app]) => app.beta).map(([id]) => id) } };
}

function writeBuildInfo(root, options = {}) {
  const file = path.join(root, ".archimedes/build-info.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const info = collectBuildInfo(root, options);
  fs.writeFileSync(file, `${JSON.stringify(info, null, 2)}\n`);
  return info;
}
if (require.main === module) console.log(JSON.stringify(writeBuildInfo(path.join(__dirname, "..")), null, 2));
module.exports = { collectBuildInfo, writeBuildInfo };
