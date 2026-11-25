const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { once } = require("node:events");
const { createInterface } = require("node:readline");
const test = require("node:test");
const { setTimeout: delay } = require("node:timers/promises");
const { resolveTerminalShell, spawnTerminalCommand, stopTerminalCommand } = require("./terminal-shell.cjs");

test("Windows prefers PowerShell 7 when it is installed", () => {
  const pwsh = "C:\\Program Files\\PowerShell\\7\\pwsh.exe";
  const result = resolveTerminalShell({
    platform: "win32",
    env: { ProgramFiles: "C:\\Program Files", SystemRoot: "C:\\Windows", COMSPEC: "C:\\Windows\\System32\\cmd.exe" },
    exists: (candidate) => candidate === pwsh,
    userShell: "",
  });
  assert.equal(result.shell, pwsh);
  assert.deepEqual(result.args, []);
});

test("Windows falls back to Windows PowerShell before cmd", () => {
  const powershell = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
  const result = resolveTerminalShell({
    platform: "win32",
    env: { ProgramFiles: "C:\\Program Files", SystemRoot: "C:\\Windows", COMSPEC: "C:\\Windows\\System32\\cmd.exe" },
    exists: (candidate) => candidate === powershell,
    userShell: "",
  });
  assert.equal(result.shell, powershell);
});

test("Windows uses COMSPEC only as the last built-in fallback", () => {
  const cmd = "C:\\Windows\\System32\\cmd.exe";
  const result = resolveTerminalShell({
    platform: "win32",
    env: { ProgramFiles: "C:\\Program Files", SystemRoot: "C:\\Windows", COMSPEC: cmd },
    exists: (candidate) => candidate === cmd,
    userShell: "",
  });
  assert.equal(result.shell, cmd);
});

test("explicit shell profiles do not fall through to a different shell", () => {
  const pwsh = "C:\\Program Files\\PowerShell\\7\\pwsh.exe";
  const powershell = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
  const env = { ProgramFiles: "C:\\Program Files", SystemRoot: "C:\\Windows", COMSPEC: "C:\\Windows\\System32\\cmd.exe" };
  const result = resolveTerminalShell({
    platform: "win32",
    profile: "powershell",
    env,
    exists: (candidate) => candidate === pwsh || candidate === powershell,
    userShell: "",
  });
  assert.equal(result.shell, powershell);
});

test("custom shell paths are honored when they exist", () => {
  const custom = "C:\\Tools\\nu.exe";
  const result = resolveTerminalShell({
    platform: "win32",
    profile: "custom",
    customShell: custom,
    env: { ProgramFiles: "C:\\Program Files", SystemRoot: "C:\\Windows" },
    exists: (candidate) => candidate === custom,
    userShell: "",
  });
  assert.equal(result.shell, custom);
});

test("macOS and Linux use the login shell with -l", () => {
  const mac = resolveTerminalShell({
    platform: "darwin",
    env: { SHELL: "/bin/zsh" },
    exists: () => true,
    userShell: "/bin/zsh",
  });
  assert.equal(mac.shell, "/bin/zsh");
  assert.deepEqual(mac.args, ["-l"]);

  const linux = resolveTerminalShell({
    platform: "linux",
    env: { SHELL: "/usr/bin/fish" },
    exists: () => true,
    userShell: "/usr/bin/fish",
  });
  assert.equal(linux.shell, "/usr/bin/fish");
  assert.deepEqual(linux.args, ["-l"]);
});

test("missing POSIX shells fall back to /bin/sh", () => {
  const result = resolveTerminalShell({
    platform: "linux",
    env: {},
    exists: () => false,
    userShell: "",
  });
  assert.equal(result.shell, "/bin/sh");
});

test("Windows shell candidates use target paths for store installs and alternate drives", () => {
  const storeShell = "D:\\Users\\Researcher\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe";
  const store = resolveTerminalShell({
    platform: "win32",
    env: { ProgramW6432: "D:\\Programs", LOCALAPPDATA: "D:\\Users\\Researcher\\AppData\\Local", SystemRoot: "D:\\Windows" },
    exists: (candidate) => candidate === storeShell,
    userShell: "",
  });
  assert.equal(store.shell, storeShell);
  assert.deepEqual(store.args, []);

  const installedShell = "D:\\Programs\\PowerShell\\7\\pwsh.exe";
  const installed = resolveTerminalShell({
    platform: "win32",
    profile: "pwsh",
    env: { ProgramW6432: "D:\\Programs", SystemRoot: "D:\\Windows" },
    exists: (candidate) => candidate === installedShell,
    userShell: "",
  });
  assert.equal(installed.shell, installedShell);
});

test("a shell command inherits its workspace environment without application credentials", { skip: process.platform === "win32" }, async () => {
  const command = 'printf "%s|%s|%s|%s" "$ARCHIMEDES_LLM_API_KEY" "$AXIOM_WEB_SEARCH_API_KEY" "$ARCH_TEST_VISIBLE" "$TERM_PROGRAM"';
  const child = spawnTerminalCommand(command, { cwd: __dirname, version: "test", env: {
    ...process.env, SHELL: "/bin/sh", ARCHIMEDES_LLM_API_KEY: "synthetic", AXIOM_WEB_SEARCH_API_KEY: "synthetic", ARCH_TEST_VISIBLE: "visible",
  } });
  let output = "";
  child.stdout.on("data", chunk => { output += chunk; });
  assert.deepEqual(await once(child, "close"), [0, null]);
  assert.equal(output, "||visible|Archimedes");
});

test("stopping a shell command removes its shell and background process", { skip: process.platform === "win32", timeout: 5_000 }, async (t) => {
  const child = spawnTerminalCommand('sleep 60 & printf "%s\\n" "$!"; wait', { cwd: __dirname, version: "test", env: { ...process.env, SHELL: "/bin/sh" } });
  t.after(() => { if (child.signalCode === null) stopTerminalCommand(child); });
  const closed = once(child, "close");
  const lines = createInterface({ input: child.stdout });
  const [pid] = await once(lines, "line");
  assert.match(pid, /^\d+$/);
  assert.equal(stopTerminalCommand(child), true);
  assert.deepEqual(await closed, [null, "SIGKILL"]);
  for (let attempt = 0; attempt < 20; attempt++) {
    const state = spawnSync("ps", ["-o", "stat=", "-p", pid], { encoding: "utf8" });
    if (state.status === 1 || state.stdout.trim().startsWith("Z")) return;
    await delay(50);
  }
  assert.fail("Background process remained alive after stopping its process group.");
});
