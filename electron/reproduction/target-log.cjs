const path = require("node:path");
const { isOutputPath } = require("./paths.cjs");

function shellQuote(value) { return `'${String(value).replace(/'/g, `'\\''`)}'`; }

function writeOutputCommand(outputPath) {
  if (!isOutputPath(outputPath)) throw new Error("The file is outside the application output directory.");
  const directory = path.posix.dirname(outputPath);
  return `umask 077; test ! -L /tmp/archimedes && test ! -L ${shellQuote(directory)} && test ! -L ${shellQuote(outputPath)} || exit 73; mkdir -p ${shellQuote(directory)} && cat > ${shellQuote(outputPath)}`;
}

/** tee keeps the complete log on the target, while the process reader keeps a tail. */
function loggedCommand(command, outputPath, { mirrorPath, mirrorQuote = shellQuote, mirrorChecks = "" } = {}) {
  if (!isOutputPath(outputPath)) throw new Error("The log path is outside the application output directory.");
  const directory = path.posix.dirname(outputPath), statusPath = `${outputPath}.exit`;
  // The per-run random directory is private; reject an existing link before
  // opening the log/status files. No repository file is used for bookkeeping.
  return `umask 077; test ! -L /tmp/archimedes && test ! -L ${shellQuote(directory)} || exit 73; mkdir -p ${shellQuote(directory)} || exit 1; test ! -L ${shellQuote(outputPath)} && test ! -L ${shellQuote(statusPath)} || exit 73; ${mirrorChecks ? `${mirrorChecks}; ` : ""}(sh -lc ${shellQuote(command)}; printf '%s' "$?" > ${shellQuote(statusPath)}) 2>&1 | tee ${shellQuote(outputPath)}${mirrorPath ? ` ${mirrorQuote(mirrorPath)}` : ""}; archimedes_tee_status=$?; archimedes_command_status=$(cat ${shellQuote(statusPath)}) || exit 1; rm -f ${shellQuote(statusPath)}; test "$archimedes_tee_status" = 0 || exit "$archimedes_tee_status"; exit "$archimedes_command_status"`;
}

module.exports = { loggedCommand, writeOutputCommand };
