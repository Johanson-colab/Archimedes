const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { electronBinary } = require("./electron-runtime.cjs");
const desktop = new Set(["electron/chat-layout-width.test.cjs", "electron/pdf-root-layout.test.cjs"]);
const root = path.join(__dirname, "..");

function testFiles(mode = "all") {
  const all = [...fs.globSync(["electron/*.test.cjs", "electron/figure-forge-upstream-*.mjs", "electron/agent/*.test.cjs", "server/*.test.cjs"], { cwd: root })].map(file => file.replaceAll("\\", "/")).sort();
  return all.filter(file => mode === "all" || (mode === "desktop" ? desktop.has(file) : !desktop.has(file)));
}

function runTests(mode = "all") {
  if (!["all", "core", "desktop"].includes(mode)) throw new Error("Use --all, --core, or --desktop.");
  if (mode !== "core") {
    electronBinary();
    if (process.platform === "linux" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) throw new Error("Desktop tests need a display. Run npm test under xvfb-run, or use npm run test:core while preparing a desktop environment.");
  }
  const env = { ...process.env };
  // The full test command executes both original real-Chromium regressions.
  if (mode !== "core") env.ARCHIMEDES_RUN_ELECTRON_LAYOUT_TESTS = "1";
  delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(process.execPath, ["--test", "--test-concurrency=4", ...testFiles(mode)], { cwd: root, env, stdio: "inherit" });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (require.main === module) {
  try { process.exitCode = runTests((process.argv[2] || "--all").replace(/^--/, "")); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { testFiles, runTests };
