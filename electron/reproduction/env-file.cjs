/**
 * Turns the user's environment into something a shell can source.
 *
 * The file is sourced before every command, so a key never appears in the
 * command line (and therefore never in `ps`, the journal or the run log).
 * Values are single-quoted; an embedded quote is closed, escaped and reopened.
 */

const NAME = /^[A-Z_][A-Z0-9_]{0,63}$/;

function shellAssignment(name, value) {
  const key = String(name || "");
  if (!NAME.test(key)) throw new Error(`Invalid environment variable name: ${key}`);
  return `${key}='${String(value ?? "").replace(/'/g, `'\\''`)}'`;
}

function envFileContent(values = {}) {
  const lines = Object.entries(values)
    .filter(([name]) => NAME.test(name))
    .map(([name, value]) => shellAssignment(name, value));
  return lines.length ? `${lines.join("\n")}\n` : "";
}

function envPrelude(envPath) {
  if (!envPath) return "";
  return `set -a; . '${String(envPath).replace(/'/g, `'\\''`)}'; set +a; `;
}

module.exports = { envFileContent, envPrelude, shellAssignment };
