const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

function electronModuleRoot() {
  // Resolve only the manifest. Requiring electron's index can start a download.
  return path.dirname(require.resolve("electron/package.json"));
}

function electronBinary({ moduleRoot = electronModuleRoot(), override = process.env.ELECTRON_OVERRIDE_DIST_PATH } = {}) {
  const relative = fs.existsSync(path.join(moduleRoot, "path.txt")) ? fs.readFileSync(path.join(moduleRoot, "path.txt"), "utf8").trim() : "";
  const expected = process.platform === "darwin" ? "Electron.app/Contents/MacOS/Electron" : process.platform === "win32" ? "electron.exe" : "electron";
  const binary = path.join(override || path.join(moduleRoot, "dist"), relative || expected);
  if (!fs.existsSync(binary)) throw new Error("Electron desktop runtime is missing. Run npm run prepare:desktop explicitly, then retry. This check never downloads a runtime.");
  return binary;
}

async function prepareDesktop({ moduleRoot = electronModuleRoot(), timeoutMs = 180000 } = {}) {
  try { return electronBinary({ moduleRoot }); } catch { /* Explicit preparation may download. */ }
  if (!Number.isFinite(timeoutMs) || timeoutMs < 100 || timeoutMs > 600000) throw new Error("Desktop preparation timeout must be between 100 and 600000 ms.");
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(moduleRoot, "install.js")], { stdio: "inherit", detached: process.platform !== "win32" });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      else { try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); } }
    }, timeoutMs);
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("exit", code => {
      clearTimeout(timer);
      if (timedOut) reject(new Error(`Electron preparation exceeded ${timeoutMs} ms. Check network/proxy access and retry npm run prepare:desktop; no test was started.`));
      else if (code !== 0) reject(new Error(`Electron preparation exited ${code}. Check the installer output and retry npm run prepare:desktop.`));
      else resolve();
    });
  });
  return electronBinary({ moduleRoot });
}

if (require.main === module) {
  const action = process.argv[2] || "--check";
  const pending = action === "--prepare" ? prepareDesktop({ timeoutMs: Number(process.env.ARCHIMEDES_DESKTOP_PREPARE_TIMEOUT_MS || 180000) }) : Promise.resolve().then(() => electronBinary());
  pending.then(binary => console.log(`Desktop runtime ready: ${binary}`)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { electronBinary, prepareDesktop };
