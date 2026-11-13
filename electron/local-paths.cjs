const os = require("node:os");
const path = require("node:path");

function expandHomePath(value, { home = os.homedir(), platform = process.platform } = {}) {
  const text = String(value || "");
  if (!text.startsWith("~")) return text;
  const paths = platform === "win32" ? path.win32 : path.posix;
  if (!paths.isAbsolute(home)) throw new Error("The local home directory could not be determined.");
  if (text === "~") return home;
  if (!text.startsWith("~/") && !(platform === "win32" && text.startsWith("~\\"))) {
    throw new Error("Use ~ or ~/ for the current user's home directory; ~user paths are not supported.");
  }
  return paths.join(home, text.slice(2));
}

module.exports = { expandHomePath };
