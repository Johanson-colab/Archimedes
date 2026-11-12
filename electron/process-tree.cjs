const { spawnSync } = require("node:child_process");
const path = require("node:path");

function stopProcessTree(child, signal = "SIGTERM") {
  if (!child || child.exitCode != null || child.signalCode != null) return;
  if (process.platform === "win32" && Number.isInteger(child.pid) && child.pid > 0) {
    // Synchronous cleanup also completes when called during Electron's before-quit.
    const taskkill = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "taskkill.exe");
    const result = spawnSync(taskkill, ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore", timeout: 5000 });
    if (!result.error && result.status === 0) return;
  }
  try { child.kill(signal); } catch { /* The process may already have exited. */ }
}

module.exports = { stopProcessTree };
