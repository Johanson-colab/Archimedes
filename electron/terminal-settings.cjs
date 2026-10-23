const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { resolveTerminalShell } = require("./terminal-shell.cjs");

const SETTINGS_FILE = "terminal-settings.json";
const SHELL_PROFILES = new Set(["auto", "pwsh", "powershell", "cmd", "zsh", "fish", "bash", "custom"]);
const EXTERNAL_TERMINALS = new Set(["auto", "windows-terminal", "ghostty", "wezterm", "terminal", "none"]);
let settingsPath = "";
let settings = null;

function defaults() {
  return {
    shell: "auto",
    customShell: "",
    fontFamily: "",
    fontSize: 12,
    scrollback: 10_000,
    externalTerminal: "auto",
    onboarded: false,
  };
}

function normalize(input = {}) {
  const next = { ...defaults(), ...(settings || {}), ...input };
  if (!SHELL_PROFILES.has(next.shell)) next.shell = "auto";
  if (!EXTERNAL_TERMINALS.has(next.externalTerminal)) next.externalTerminal = "auto";
  next.customShell = typeof next.customShell === "string" ? next.customShell.trim() : "";
  next.fontFamily = typeof next.fontFamily === "string" ? next.fontFamily.trim() : "";
  next.fontSize = Math.max(10, Math.min(20, Number(next.fontSize) || 12));
  next.scrollback = Math.max(1_000, Math.min(50_000, Number(next.scrollback) || 10_000));
  next.onboarded = Boolean(next.onboarded);
  return next;
}

function initialize(userDataPath) {
  settingsPath = path.join(userDataPath, SETTINGS_FILE);
  try {
    settings = normalize(JSON.parse(fs.readFileSync(settingsPath, "utf8")));
  } catch {
    settings = defaults();
  }
  return settings;
}

function persist() {
  if (!settingsPath) return;
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

function getExternalTerminal(platform, requested) {
  if (requested === "none") return null;
  if (platform === "win32") {
    if (requested === "wezterm") return { command: "wezterm.exe", app: "WezTerm" };
    return { command: "wt.exe", app: "Windows Terminal" };
  }
  if (platform === "darwin") {
    if (requested === "wezterm") return { command: "open", args: ["-a", "WezTerm"], app: "WezTerm" };
    if (requested === "terminal") return { command: "open", args: ["-a", "Terminal"], app: "Terminal" };
    return { command: "open", args: ["-a", "Ghostty"], app: "Ghostty" };
  }
  if (requested === "ghostty") return { command: "ghostty", app: "Ghostty" };
  return { command: "wezterm", args: ["start"], app: "WezTerm" };
}

function terminalSettings() {
  const current = normalize();
  const platform = process.platform;
  const detected = resolveTerminalShell({ profile: current.shell, customShell: current.customShell });
  return {
    ...current,
    platform,
    detectedShell: detected.shell,
    detectedShellName: path.basename(detected.shell),
    externalTerminalLabel: getExternalTerminal(platform, current.externalTerminal)?.app || "None",
  };
}

function saveTerminalSettings(input = {}) {
  settings = normalize({ ...(settings || {}), ...input });
  persist();
  return terminalSettings();
}

function shellLaunch() {
  return resolveTerminalShell({ profile: normalize().shell, customShell: normalize().customShell });
}

function openExternalTerminal({ cwd, externalTerminal } = {}) {
  const current = normalize();
  const target = getExternalTerminal(process.platform, externalTerminal || current.externalTerminal);
  if (!target) return Promise.resolve({ opened: false, app: "None" });
  const targetCwd = cwd || os.homedir();
  let args;
  if (process.platform === "win32") {
    args = target.command === "wezterm.exe" ? ["start", "--cwd", targetCwd] : ["-d", targetCwd];
  } else if (target.app === "Ghostty") {
    args = ["-a", "Ghostty", "--args", `--working-directory=${targetCwd}`];
  } else if (target.app === "WezTerm") {
    args = ["-a", "WezTerm", "--args", "start", "--cwd", targetCwd];
  } else if (target.app === "Terminal") {
    args = ["-a", "Terminal", targetCwd];
  } else {
    args = [...(target.args || []), "--cwd", targetCwd];
  }
  return new Promise((resolve) => {
    const child = spawn(target.command, args, { cwd: cwd || os.homedir(), detached: true, stdio: "ignore" });
    child.once("error", (error) => resolve({ opened: false, app: target.app, error: error.message }));
    child.once("spawn", () => {
      child.unref();
      resolve({ opened: true, app: target.app });
    });
  });
}

module.exports = {
  defaults,
  initialize,
  terminalSettings,
  saveTerminalSettings,
  shellLaunch,
  openExternalTerminal,
};
