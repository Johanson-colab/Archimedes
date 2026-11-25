const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

function relativeParts(value, write = false) {
  const text = String(value || "").replaceAll("\\", "/");
  const parts = text.split("/").filter(part => part && part !== ".");
  if (!text || text.startsWith("/") || /^[a-z]:/i.test(text) || text.includes("\0") || parts.includes("..") || write && (!parts.length || parts.includes(".git"))) throw new Error("The path must stay inside the checkout.");
  return parts;
}

function within(root, target) { return target === root || target.startsWith(`${root}${path.sep}`); }

async function readRepoFile(root, relative) {
  const canonical = await fsp.realpath(root);
  const target = path.join(canonical, ...relativeParts(relative));
  try {
    const actual = await fsp.realpath(target);
    if (!within(canonical, actual)) throw new Error("Symlinked paths outside the checkout cannot be read.");
    if ((await fsp.stat(actual)).size > 2 * 1024 * 1024) throw new Error("The file exceeds the 2 MiB structured-read limit. Use an explicit paged shell command for large data.");
    return await fsp.readFile(actual, "utf8");
  } catch (error) { if (["ENOENT", "EISDIR", "ENOTDIR"].includes(error.code)) return null; throw error; }
}

async function writeRepoFile(root, relative, content, { mode = 0o644 } = {}) {
  const canonical = await fsp.realpath(root);
  const parts = relativeParts(relative, true);
  let current = canonical;
  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part);
    try { await fsp.mkdir(current); } catch (error) { if (error.code !== "EEXIST") throw error; }
    const stat = await fsp.lstat(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("Refusing to write through a symbolic link or non-directory.");
  }
  const target = path.join(current, parts.at(-1));
  const existing = await fsp.lstat(target).catch(error => { if (error.code === "ENOENT") return null; throw error; });
  if (existing && (existing.isSymbolicLink() || !existing.isFile())) throw new Error("Refusing to overwrite a symbolic link or non-file.");
  const file = await fsp.open(target, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | (fs.constants.O_NOFOLLOW || 0), mode);
  try { await file.writeFile(String(content ?? ""), "utf8"); } finally { await file.close(); }
  return { path: String(relative), bytes: Buffer.byteLength(String(content ?? "")) };
}

/** SSH uses the same no-link write rule without assuming GNU realpath/python. */
function remotePathChecks(repo, relative, { quote, write = false } = {}) {
  const parts = relativeParts(relative, write);
  const commands = [`test ! -L ${quote(repo)} || { echo 'Checkout is a symbolic link' >&2; exit 73; }`];
  let prefix = repo;
  for (const [index, part] of parts.entries()) {
    prefix += `/${part}`;
    commands.push(`test ! -L ${quote(prefix)} || { echo 'Refusing a symbolic link in the checkout path' >&2; exit 73; }`);
    if (write && index < parts.length - 1) commands.push(`mkdir -p ${quote(prefix)} || exit 1`);
  }
  return { path: prefix, commands: commands.join("; ") };
}

module.exports = { relativeParts, readRepoFile, writeRepoFile, remotePathChecks };
