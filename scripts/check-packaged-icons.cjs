const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const { execFileSync } = require("node:child_process");
const toolRequire = createRequire(require.resolve("electron-builder/package.json"));
const builderRequire = createRequire(toolRequire.resolve("app-builder-lib/package.json"));
const asar = builderRequire("@electron/asar");
const root = path.join(__dirname, "..");
const directory = path.resolve(process.argv[2] || "release/win-unpacked");
const isMacBundle = directory.endsWith(".app");
const resources = path.join(directory, ...(isMacBundle ? ["Contents", "Resources"] : ["resources"]));
const archive = path.join(resources, "app.asar");

const files = asar.listPackage(archive).map((file) => file.replaceAll("\\", "/"));
for (const file of ["/electron/main.cjs", "/electron/app-icons.cjs", "/server/supabase-server.cjs", "/shared/brand-logo.json", "/dist/index.html"]) {
  assert.ok(files.includes(file), `Missing runtime file: ${file}`);
}
assert.equal(files.some((file) => /(?:^|\/)\.env(?:\.|$)/.test(file)), false, "Do not package local environment files");
for (const file of ["app-icon.ico", "app-icon.icns", "app-icon-256.png", "app-icon-1024.png"]) {
  assert.deepEqual(fs.readFileSync(path.join(resources, "icons", file)), fs.readFileSync(path.join(root, "electron", "assets", file)));
}
const html = asar.extractFile(archive, "dist/index.html").toString();
assert.doesNotMatch(html, /(?:src|href)="\/assets\//, "Packaged file:// pages need relative asset URLs");
const result = { runtimeFilesPresent: true, environmentFilesExcluded: true, externalRuntimeIconsMatch: true, relativeRendererAssets: true };
if (isMacBundle) {
  assert.equal(process.platform, "darwin", "Inspect the bundle on macOS with plutil");
  const icon = execFileSync("/usr/bin/plutil", ["-extract", "CFBundleIconFile", "raw", "-o", "-", path.join(directory, "Contents", "Info.plist")], { encoding: "utf8" }).trim();
  const name = icon.endsWith(".icns") ? icon : `${icon}.icns`;
  assert.deepEqual(fs.readFileSync(path.join(resources, name)), fs.readFileSync(path.join(root, "electron/assets/app-icon.icns")));
  result.macBundleIconMatches = true;
} else if (process.platform === "win32") {
  const executable = path.join(directory, "Archimedes.exe");
  assert.ok(fs.existsSync(executable));
  result.windowsExecutable = true;
}
console.log(JSON.stringify(result, null, 2));
if (process.env.ARCHIMEDES_PACKAGE_AUDIT_OUTPUT) fs.writeFileSync(process.env.ARCHIMEDES_PACKAGE_AUDIT_OUTPUT, JSON.stringify(result, null, 2) + "\n");
