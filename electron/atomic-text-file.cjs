const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

/** Replace a validated target with a complete text file staged beside it. */
function writeTextFileAtomically(target, content) {
  const stats = fs.statSync(target, { throwIfNoEntry: false });
  if (stats) {
    if (!stats.isFile()) throw new Error("The write target is not a file.");
    // A rename can replace a read-only file, so check the target without truncating it.
    fs.closeSync(fs.openSync(target, fs.constants.O_WRONLY));
  }
  const directory = path.dirname(target);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = path.join(directory, `.archimedes-save-${randomUUID()}.tmp`);
  const fd = fs.openSync(temporary, "wx", stats ? stats.mode & 0o600 : 0o666);
  try {
    try {
      fs.writeFileSync(fd, content, "utf8");
      if (stats && process.platform !== "win32") fs.fchmodSync(fd, stats.mode & 0o777);
    } finally {
      fs.closeSync(fd);
    }
    // Replace only after the complete draft is written and the handle is closed.
    fs.renameSync(temporary, target);
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch { /* Preserve the original save error. */ }
    throw error;
  }
}

module.exports = { writeTextFileAtomically };
