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

  const profile = options.profile || "auto";
  if (platform === "win32") {
    const programFiles = env.ProgramFiles || env.ProgramW6432 || "C:\\Program Files";
    const localAppData = env.LOCALAPPDATA || "";
    const systemRoot = env.SystemRoot || "C:\\Windows";
    const pwsh = [path.join(programFiles, "PowerShell", "7", "pwsh.exe"), localAppData && path.join(localAppData, "Microsoft", "WindowsApps", "pwsh.exe")];
    const powershell = [path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")];
    const cmd = [env.COMSPEC, "cmd.exe"];
    const candidates = profile === "pwsh" ? pwsh
      : profile === "powershell" ? powershell
      : profile === "cmd" ? cmd
      : profile === "custom" ? [options.customShell]
      : [...pwsh, ...powershell, ...cmd];
    const shell = firstExisting(candidates, exists) || firstExisting([...pwsh, ...powershell, ...cmd], exists) || "cmd.exe";
    return { shell, args: [] };
  }

  const zsh = ["/bin/zsh", "/usr/bin/zsh"];
  const fish = ["/opt/homebrew/bin/fish", "/usr/local/bin/fish", "/usr/bin/fish"];
  const bash = ["/bin/bash", "/usr/bin/bash"];
  const candidates = profile === "zsh" ? zsh
    : profile === "fish" ? fish
    : profile === "bash" ? bash
    : profile === "custom" ? [options.customShell]
    : [env.SHELL, userShell, ...zsh, ...bash, "/bin/sh"];
  const shell = firstExisting(candidates, exists) || firstExisting([env.SHELL, userShell, ...zsh, ...bash, "/bin/sh"], exists) || "/bin/sh";
  return { shell, args: ["-l"] };
}

module.exports = { resolveTerminalShell };
