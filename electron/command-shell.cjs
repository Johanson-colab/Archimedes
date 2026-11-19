const path = require("node:path");
const { resolveTerminalShell } = require("./terminal-shell.cjs");

function commandShell(command, launch = resolveTerminalShell(), platform = process.platform) {
  const shell = launch.shell;
  if (platform !== "win32") return { shell, args: ["-lc", command] };
  const name = path.win32.basename(shell).toLowerCase();
  if (name === "powershell.exe" || name === "pwsh.exe") {
    const script = `$ProgressPreference = 'SilentlyContinue'; [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding; $OutputEncoding = [Console]::OutputEncoding; $ErrorActionPreference = 'Stop'; $LASTEXITCODE = 0; try { & {\n${command}\n}; $commandSucceeded = $?; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; if (-not $commandSucceeded) { exit 1 } } catch { [Console]::Error.WriteLine($_.ToString()); exit 1 }`;
    return { shell, args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-OutputFormat", "Text", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")] };
  }
  if (name === "cmd.exe") {
    // CMD parses quotes itself; Node's normal C-runtime quoting introduces literal
    // backslashes before quotes and breaks executable paths such as Program Files.
    return { shell, args: ["/d", "/s", "/c", `"chcp 65001 >nul & ${command}"`], windowsVerbatimArguments: true };
  }
  if (["bash.exe", "zsh.exe", "sh.exe", "fish.exe"].includes(name)) return { shell, args: ["-lc", command] };
  throw new Error("Automated commands require PowerShell, CMD, Bash, Zsh or Fish. Select one in Terminal settings; custom shells can still be used interactively.");
}

function commandEnvironment() {
  const settings = require("./terminal-settings.cjs");
  const shell = settings.shellLaunch().shell;
  return `Command execution platform: ${process.platform}; shell: ${shell}. Write commands for this shell's syntax. On Windows use quoted paths, npm.cmd with PowerShell, and do not assume Bash, Unix utilities or python3 are installed. Inspect available tools first.`;
}

module.exports = { commandShell, commandEnvironment };
