const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function firstExisting(candidates, exists) {
  return candidates.find((candidate) => candidate && (candidate === "cmd.exe" || exists(candidate))) || "";
}

function resolveTerminalShell(options = {}) {
  const platform = options.platform || process.platform;
  const env = options.env || process.env;
  const exists = options.exists || fs.existsSync;
  const userShell = options.userShell || (() => {
    try {
      return os.userInfo().shell;
    } catch {
      return "";
    }
  })();

  if (platform === "win32") {
    const programFiles = env.ProgramFiles || env.ProgramW6432 || "C:\\Program Files";
    const localAppData = env.LOCALAPPDATA || "";
    const systemRoot = env.SystemRoot || "C:\\Windows";
    const candidates = [
      path.join(programFiles, "PowerShell", "7", "pwsh.exe"),
      localAppData && path.join(localAppData, "Microsoft", "WindowsApps", "pwsh.exe"),
      path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
      env.COMSPEC,
      "cmd.exe",
    ];
    return { shell: firstExisting(candidates, exists) || "cmd.exe", args: [] };
  }

  const candidates = [env.SHELL, userShell, "/bin/zsh", "/bin/bash", "/bin/sh"];
  return { shell: firstExisting(candidates, exists) || "/bin/sh", args: ["-l"] };
}

module.exports = { resolveTerminalShell };
