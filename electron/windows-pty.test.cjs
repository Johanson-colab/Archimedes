const assert = require("node:assert/strict");
const test = require("node:test");
const { stopProcessTree } = require("./process-tree.cjs");

test("Windows ConPTY can repeatedly close immediately without AttachConsole helpers", { skip: process.platform !== "win32", timeout: 20000 }, async () => {
  const pty = require("node-pty");
  for (let index = 0; index < 4; index += 1) {
    const terminal = pty.spawn(process.env.COMSPEC || "cmd.exe", ["/d"], {
      useConptyDll: true, cols: 80, rows: 24, cwd: process.cwd(), env: process.env,
    });
    const exited = new Promise((resolve) => terminal.onExit(resolve));
    const pid = terminal.pid;
    stopProcessTree(terminal);
    terminal.kill();
    await exited;
    assert.throws(() => process.kill(pid, 0), /ESRCH/);
  }
});
