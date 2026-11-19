const { spawn } = require("node:child_process");
const path = require("node:path");
const { commandShell } = require("./command-shell.cjs");

function spawnCommand(command, launch, options = {}) {
  const { shell, args, windowsVerbatimArguments } = commandShell(command, launch);
  if (!windowsVerbatimArguments) {
    return spawn(shell, args, { ...options, windowsHide: true });
  }

  // GUI Electron has no console: chcp cannot configure pipe-only CMD output,
  // which remains in the OEM code page. ConPTY provides a real hidden console
  // and delivers UTF-8, including mixed CMD built-ins and native program output.
  // Isolate each ConPTY host: node-pty's Windows worker can otherwise keep the
  // application's event loop/handles alive after a short-lived command exits.
  return spawn(process.execPath, [path.join(__dirname, "cmd-host.cjs"), shell, args.join(" ")], {
    ...options, windowsHide: true,
    env: { ...(options.env || process.env), ELECTRON_RUN_AS_NODE: "1" },
  });
}

module.exports = { spawnCommand };
