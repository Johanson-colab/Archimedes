const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

function electronModuleRoot() {
  // Resolve only the manifest. Requiring electron's index can start a download.
  return path.dirname(require.resolve("electron/package.json"));
}

function platformPath() {
  if (process.platform === "darwin") return "Electron.app/Contents/MacOS/Electron";
  if (process.platform === "win32") return "electron.exe";
  return "electron";
}

function notReady(detail) {
  return new Error(`Electron desktop runtime is not ready: ${detail}. Run npm run prepare:desktop explicitly, then retry. This check never downloads a runtime.`);
}

function readText(file) {
  try { return fs.readFileSync(file, "utf8"); } catch { return null; }
}

function moduleVersion(moduleRoot) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(moduleRoot, "package.json"), "utf8"));
    return typeof manifest.version === "string" && manifest.version.trim() ? manifest.version.trim() : null;
  } catch { return null; }
}

// Electron's installer writes path.txt and dist/version after the executable.
// Treat all three as the installed contract so a partially extracted dist can never pass.
function managedBinary(moduleRoot) {
  const expected = platformPath();
  const installedPath = readText(path.join(moduleRoot, "path.txt"));
  if (installedPath === null) throw notReady("path.txt is missing");
  if (installedPath !== expected) throw notReady(`path.txt points at ${JSON.stringify(installedPath)} instead of ${JSON.stringify(expected)}`);
  const installedVersion = readText(path.join(moduleRoot, "dist", "version"));
  if (installedVersion === null) throw notReady("dist/version is missing");
  const version = installedVersion.trim().replace(/^v/, "");
  if (!version) throw notReady("dist/version is empty");
  const expectedVersion = moduleVersion(moduleRoot);
  if (expectedVersion && version !== expectedVersion) throw notReady(`installed Electron ${version} does not match package version ${expectedVersion}`);
  const binary = path.join(moduleRoot, "dist", expected);
  if (!fs.existsSync(binary)) throw notReady(`the executable is missing at ${binary}`);
  return binary;
}

// An explicit override may point at a custom runtime that Electron's installer never
// managed, so install metadata is optional. Resolve and verify the executable only.
function overrideBinary(moduleRoot, override) {
  const installedPath = readText(path.join(moduleRoot, "path.txt"));
  const relative = installedPath && installedPath.trim() ? installedPath.trim() : platformPath();
  const binary = path.join(override, relative);
  if (!fs.existsSync(binary)) throw notReady(`the overridden executable is missing at ${binary}`);
  return binary;
}

function electronBinary({ moduleRoot = electronModuleRoot(), override = process.env.ELECTRON_OVERRIDE_DIST_PATH } = {}) {
  return override ? overrideBinary(moduleRoot, override) : managedBinary(moduleRoot);
}

function terminationError() {
  return new Error("Electron preparation was cancelled. The installer was stopped; run npm run prepare:desktop again when ready.");
}

function terminateInstaller(child) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" }).once("error", () => {});
    return;
  }
  try { process.kill(-child.pid, "SIGKILL"); }
  catch { try { child.kill("SIGKILL"); } catch { /* The installer already exited. */ } }
}

async function prepareDesktop({ moduleRoot = electronModuleRoot(), timeoutMs = 180000, signal, override = process.env.ELECTRON_OVERRIDE_DIST_PATH } = {}) {
  if (signal?.aborted) throw terminationError();
  try { return electronBinary({ moduleRoot, override }); } catch { /* Explicit preparation may download. */ }
  if (!Number.isFinite(timeoutMs) || timeoutMs < 100 || timeoutMs > 600000) throw new Error("Desktop preparation timeout must be between 100 and 600000 ms.");
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(moduleRoot, "install.js")], { stdio: "inherit", detached: process.platform !== "win32" });
    let settled = false, timedOut = false, cancelled = false, timer = null;
    const onAbort = () => {
      if (settled || cancelled) return;
      cancelled = true;
      terminateInstaller(child);
    };
    const settle = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (error) reject(error); else resolve();
    };
    timer = setTimeout(() => {
      timedOut = true;
      terminateInstaller(child);
    }, timeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });
    child.once("error", settle);
    child.once("exit", code => {
      if (timedOut) settle(new Error(`Electron preparation exceeded ${timeoutMs} ms. Check network/proxy access and retry npm run prepare:desktop; no test was started.`));
      else if (cancelled) settle(terminationError());
      else if (code !== 0) settle(new Error(`Electron preparation exited ${code}. Check the installer output and retry npm run prepare:desktop.`));
      else settle();
    });
  });
  if (signal?.aborted) throw terminationError();
  return electronBinary({ moduleRoot, override });
}

async function main() {
  const action = process.argv[2] || "--check";
  const controller = action === "--prepare" ? new AbortController() : null;
  const stop = () => controller?.abort();
  if (controller) {
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  }
  try {
    const binary = action === "--prepare"
      ? await prepareDesktop({ timeoutMs: Number(process.env.ARCHIMEDES_DESKTOP_PREPARE_TIMEOUT_MS || 180000), signal: controller.signal })
      : electronBinary();
    console.log(`Desktop runtime ready: ${binary}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    if (controller) {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
    }
  }
}

if (require.main === module) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { electronBinary, prepareDesktop };
