const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const settings = require("./terminal-settings.cjs");

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-terminal-settings-"));

test.after(() => {
  fs.rmSync(userData, { recursive: true, force: true });
});

test("terminal settings start with safe defaults", () => {
  settings.initialize(userData);
  const current = settings.terminalSettings();
  assert.equal(current.shell, "auto");
  assert.equal(current.fontSize, 12);
  assert.equal(current.scrollback, 10_000);
  assert.equal(current.externalTerminal, "auto");
  assert.equal(typeof current.detectedShell, "string");
  assert.equal(typeof current.platform, "string");
});

test("terminal settings persist and normalize values", () => {
  settings.initialize(userData);
  const saved = settings.saveTerminalSettings({
    shell: "custom",
    customShell: "/usr/local/bin/fish",
    fontFamily: "Berkeley Mono",
    fontSize: 99,
    scrollback: 999_999,
    externalTerminal: "none",
    onboarded: true,
  });
  assert.equal(saved.shell, "custom");
  assert.equal(saved.customShell, "/usr/local/bin/fish");
  assert.equal(saved.fontFamily, "Berkeley Mono");
  assert.equal(saved.fontSize, 20);
  assert.equal(saved.scrollback, 50_000);
  assert.equal(saved.externalTerminal, "none");
  assert.equal(saved.onboarded, true);

  const raw = JSON.parse(fs.readFileSync(path.join(userData, "terminal-settings.json"), "utf8"));
  assert.equal(raw.fontFamily, "Berkeley Mono");
  assert.equal(raw.onboarded, true);
});

test("invalid profiles fall back to auto", () => {
  settings.initialize(userData);
  const saved = settings.saveTerminalSettings({ shell: "unknown-shell", externalTerminal: "unknown-terminal" });
  assert.equal(saved.shell, "auto");
  assert.equal(saved.externalTerminal, "auto");
});

test("tabby is available as a cross-platform external terminal", () => {
  const win = settings.getExternalTerminal("win32", "tabby");
  assert.equal(win.app, "Tabby");
  assert.match(win.command, /tabby\.exe$/i);

  const mac = settings.getExternalTerminal("darwin", "tabby");
  assert.equal(mac.command, "open");
  assert.deepEqual(mac.args, ["-a", "Tabby", "--args", "open"]);

  const linux = settings.getExternalTerminal("linux", "tabby");
  assert.equal(linux.command, "tabby");

  settings.initialize(userData);
  const saved = settings.saveTerminalSettings({ externalTerminal: "tabby" });
  assert.equal(saved.externalTerminal, "tabby");
  assert.equal(saved.externalTerminalLabel, "Tabby");
});

test("disabled external terminal does not spawn anything", async () => {
  settings.initialize(userData);
  settings.saveTerminalSettings({ externalTerminal: "none" });
  assert.deepEqual(await settings.openExternalTerminal({ cwd: userData }), { opened: false, app: "None" });
});
