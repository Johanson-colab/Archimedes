const { quoteRemotePath, shellQuote } = require("./remote-quotes.cjs");

function ownerPaths(root, runId) {
  if (!/^[a-zA-Z0-9-]+$/.test(runId)) throw new Error("Invalid run resource identity.");
  const directory = `${root}/active-runs/${runId}`;
  return { directory, marker: `${directory}/owner`, pid: `${directory}/pid`, tag: `archimedes-reproduction-${runId}` };
}

function ownedCommand(command, { root, runId, ownerToken }) {
  const files = ownerPaths(root, runId), q = quoteRemotePath;
  const marker = `${ownerToken}:${runId}`;
  return `test ! -L ${q(`${root}/active-runs`)} && test ! -L ${q(files.directory)} || exit 73; umask 077; mkdir -p ${q(files.directory)} || exit 1; test ! -L ${q(files.marker)} && test ! -L ${q(files.pid)} || exit 73; printf '%s' ${shellQuote(marker)} > ${q(files.marker)}; set -m; exec 3<&0; sh -c ${shellQuote(`trap ':' EXIT; ${command}`)} ${shellQuote(files.tag)} <&3 & archimedes_child=$!; exec 3<&-; printf '%s' "$archimedes_child" > ${q(files.pid)}; wait "$archimedes_child" 2>/dev/null; archimedes_status=$?; rm -f ${q(files.pid)}; exit "$archimedes_status"`;
}

function cleanupCommand({ root, runId, ownerToken, envPath = "" }) {
  const files = ownerPaths(root, runId), q = quoteRemotePath;
  const expected = shellQuote(`${ownerToken}:${runId}`);
  // The marker belongs to this exact persisted run. A reused PID whose command
  // no longer carries the run tag is deliberately left alone.
  return `if test -f ${q(files.marker)}; then test ! -L ${q(files.marker)} && test "$(cat ${q(files.marker)})" = ${expected} || { echo 'Run ownership does not match' >&2; exit 73; }; if test -f ${q(files.pid)}; then archimedes_pid=$(cat ${q(files.pid)}); case "$archimedes_pid" in ''|*[!0-9]*) exit 73;; esac; command -v ps >/dev/null 2>&1 || { echo 'Cannot verify run ownership: ps is required' >&2; exit 73; }; archimedes_args=$(ps -p "$archimedes_pid" -o args= 2>/dev/null); archimedes_ps_status=$?; if test "$archimedes_ps_status" -ne 0 && kill -0 "$archimedes_pid" 2>/dev/null; then echo 'Cannot verify the live run process' >&2; exit 73; fi; if printf '%s' "$archimedes_args" | grep -F -- ${shellQuote(files.tag)} >/dev/null; then kill -TERM -- "-$archimedes_pid" 2>/dev/null || true; sleep 0.2; kill -KILL -- "-$archimedes_pid" 2>/dev/null || true; fi; fi; rm -f ${q(files.pid)} ${q(files.marker)}; fi; ${envPath ? `test ! -L ${q(envPath)} || exit 73; rm -f ${q(envPath)};` : ""} true`;
}

module.exports = { ownerPaths, ownedCommand, cleanupCommand };
