const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

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
    const pwsh = [path.win32.join(programFiles, "PowerShell", "7", "pwsh.exe"), localAppData && path.win32.join(localAppData, "Microsoft", "WindowsApps", "pwsh.exe")];
    const powershell = [path.win32.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")];
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

function cleanTerminalEnvironment(version, env = process.env) {
  const inherited = Object.entries(env).filter(([name, value]) =>
    typeof value === "string" && !/^(ARCHIMEDES|AXIOM)_/i.test(name));
  return {
    ...Object.fromEntries(inherited),
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
    TERM_PROGRAM: "Archimedes",
    TERM_PROGRAM_VERSION: version,
  };
}

function spawnTerminalCommand(command, { cwd, version, env = process.env }) {
  const windows = process.platform === "win32";
  const { shell, args } = windows
    ? { shell: "cmd.exe", args: ["/d", "/s", "/c"] }
    : resolveTerminalShell({ env });
  return spawn(shell, [...args, ...(windows ? [] : ["-c"]), command], {
    cwd,
    env: cleanTerminalEnvironment(version, env),
    detached: !windows,
  });
}

function stopTerminalCommand(child) {
  if (process.platform === "win32") return child.kill("SIGTERM");
  if (!child.pid) return false;
  try {
    // The leader can exit while inherited stdio and its other processes stay open.
    process.kill(-child.pid, "SIGKILL");
    return true;
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
    return false;
  }
}

module.exports = { cleanTerminalEnvironment, resolveTerminalShell, spawnTerminalCommand, stopTerminalCommand };
