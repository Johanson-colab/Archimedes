const { spawnSync } = require("node:child_process");
const path = require("node:path");

// Verify the shipped Windows binaries against Electron before requiring a compiler.
if (process.platform === "win32") {
  const probe = spawnSync(require("electron"), ["-e", "require('node-pty'); console.log('Windows terminal binaries loaded')"], {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: "inherit",
    windowsHide: true,
  });
  if (probe.status === 0) process.exit(0);
  console.log("Prebuilt terminal binaries unavailable; rebuilding from source.");
}
const rebuildCli = path.join(path.dirname(require.resolve("@electron/rebuild")), "cli.js");
const rebuild = spawnSync(process.execPath, [rebuildCli, "-f", "-w", "node-pty"], {
  stdio: "inherit",
  windowsHide: true,
});
if (rebuild.error) console.error(rebuild.error.message);
process.exit(rebuild.status ?? 1);
