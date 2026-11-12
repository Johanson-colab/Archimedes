const assert = require("node:assert/strict");
const test = require("node:test");
const { resolveTerminalShell } = require("./terminal-shell.cjs");

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

test("Windows finds portable PowerShell on a quoted, case-insensitive PATH", () => {
  const portable = "D:\\中文 Tools\\pwsh.exe";
  const result = resolveTerminalShell({
    platform: "win32",
    env: { pAtH: '"D:\\中文 Tools";C:\\Windows\\System32', systemroot: "C:\\Windows" },
    exists: (candidate) => candidate === portable,
    userShell: "",
  });
  assert.equal(result.shell, portable);
});

test("Windows custom shell executable names resolve on PATH", () => {
  const custom = "D:\\Tools\\nu.exe";
  const result = resolveTerminalShell({
    platform: "win32", profile: "custom", customShell: "nu.exe",
    env: { Path: "D:\\Tools" }, exists: (candidate) => candidate === custom, userShell: "",
  });
  assert.equal(result.shell, custom);
});
