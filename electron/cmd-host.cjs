const { stripVTControlCharacters } = require("node:util");

try {
  const env = { ...process.env };
  // This flag is only for this helper's Electron runtime, not the user's command.
  delete env.ELECTRON_RUN_AS_NODE;
  const terminal = require("node-pty").spawn(process.argv[2], process.argv[3], {
    cwd: process.cwd(), env, useConptyDll: true, cols: 500, rows: 24,
    name: "xterm-256color",
  });
  terminal.onData((data) => process.stdout.write(stripVTControlCharacters(data)));
  terminal.onExit(({ exitCode }) => {
    try { terminal.kill(); } catch { /* The console may already be closed. */ }
    // Flush the pipe before releasing the helper's remaining native handles.
    process.stdout.write("", () => process.exit(exitCode));
  });
} catch (error) {
  process.stderr.write(`${error.message}\n`, () => process.exit(1));
}
