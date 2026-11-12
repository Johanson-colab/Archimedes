// Windows: ELECTRON_RUN_AS_NODE=1 <packaged Archimedes.exe> <this script> <app dir>
// This runs a terminal echo in isolation, without opening the app/user profile.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
assert.ok(process.versions.electron, "Run with the packaged Electron executable");
const directory = path.resolve(process.argv[2] || "release/win-unpacked");
const pty = require(path.join(directory, "resources/app.asar.unpacked/node_modules/node-pty"));
const terminal = pty.spawn(process.env.ComSpec || "cmd.exe", ["/d", "/c", "echo ARCHIMEDES_ICON_PACKAGE_NATIVE_OK"], { cols: 80, rows: 24, cwd: directory, env: process.env });
let output = "";
const timeout = setTimeout(() => { terminal.kill(); console.error("Packaged native terminal timed out"); process.exit(1); }, 10000);
terminal.onData((text) => { output += text; });
terminal.onExit(({ exitCode }) => {
  clearTimeout(timeout);
  assert.equal(exitCode, 0);
  assert.ok(output.includes("ARCHIMEDES_ICON_PACKAGE_NATIVE_OK"));
  const result = { platform: process.platform, electron: process.versions.electron, packagedExecutable: "Archimedes.exe", packagedPtySpawnPassed: true, nativeRebuildSkippedForLocalIconAudit: process.env.ARCHIMEDES_ICON_AUDIT_SKIPPED_REBUILD === "1" };
  console.log(JSON.stringify(result, null, 2));
  if (process.env.ARCHIMEDES_PACKAGE_NATIVE_OUTPUT) fs.writeFileSync(process.env.ARCHIMEDES_PACKAGE_NATIVE_OUTPUT, JSON.stringify(result, null, 2) + "\n");
  process.exit(0);
});
