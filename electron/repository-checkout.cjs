const { createHash } = require("node:crypto");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { normalizeGithubRepositoryUrl } = require("./github-repository.cjs");

const AUDIT_ROOT = [".archimedes", "code-audits"];
// Keep the checkout complete for audit purposes, excluding only Git metadata and local dependency trees.
const HIDDEN_DIRECTORIES = new Set([".git", ".archimedes", "node_modules"]);
const MAX_DIRECTORY_ENTRIES = 800;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_SEARCH_FILE_BYTES = 1024 * 1024;
const MAX_SEARCH_RESULTS = 80;

function checkoutDirectory(workspace, url) {
  const target = normalizeGithubRepositoryUrl(url);
  const suffix = createHash("sha256").update(target.url).digest("hex").slice(0, 10);
  return { target, root: path.join(workspace, ...AUDIT_ROOT, `${target.owner}--${target.repo}--${suffix}`) };
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: false, windowsHide: true });
    const chunks = [];
    const errors = [];
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => errors.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      const stdout = Buffer.concat(chunks).toString("utf8").trim();
      const stderr = Buffer.concat(errors).toString("utf8").trim();
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || stdout || `${command} exited with status ${code}.`));
    });
  });
}

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function safeRelativePath(value = "") {
  const normalized = String(value).replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    if (!normalized) return "";
    throw new Error("The requested repository path is invalid.");
  }
  return normalized;
}

async function assertCheckout(workspace, url) {
  const { target, root } = checkoutDirectory(workspace, url);
  const marker = path.join(root, ".git");
  if (!fs.existsSync(marker)) throw new Error("Clone this repository before starting a code audit.");
  const realRoot = await fsp.realpath(root);
  const auditRoot = await fsp.realpath(path.resolve(workspace, ...AUDIT_ROOT));
  if (!isWithin(auditRoot, realRoot)) throw new Error("Repository checkout is outside the audit directory.");
  return { target, root: realRoot };
}

async function checkoutMetadata(workspace, url) {
  const { target, root } = await assertCheckout(workspace, url);
  const [commit, branch, files] = await Promise.all([
    run("git", ["-C", root, "rev-parse", "HEAD"]),
    run("git", ["-C", root, "rev-parse", "--abbrev-ref", "HEAD"]),
    run("git", ["-C", root, "ls-files", "-z"]),
  ]);
  return {
    url: target.url,
    owner: target.owner,
    repo: target.repo,
    branch: branch === "HEAD" ? "detached" : branch,
    commit,
    file_count: files ? files.split("\0").filter(Boolean).length : 0,
    cloned_at: (await fsp.stat(root)).birthtime.toISOString(),
  };
}

async function getRepositoryCheckout(workspace, url) {
  try { return await checkoutMetadata(workspace, url); }
  catch (error) {
    if (String(error?.message || error).includes("Clone this repository")) return null;
    throw error;
  }
}

async function cloneRepositoryCheckout(workspace, url) {
  const { target, root } = checkoutDirectory(workspace, url);
  if (fs.existsSync(path.join(root, ".git"))) return checkoutMetadata(workspace, target.url);
  await fsp.mkdir(path.dirname(root), { recursive: true });
  if (fs.existsSync(root)) await fsp.rm(root, { recursive: true, force: true });
  try {
    await run("git", ["clone", "--depth", "1", "--no-tags", target.url, root]);
  } catch (error) {
    await fsp.rm(root, { recursive: true, force: true });
    throw new Error(`Could not clone ${target.owner}/${target.repo}: ${error.message || error}`);
  }
  return checkoutMetadata(workspace, target.url);
}

function fileKind(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if ([".md", ".mdx", ".rst"].includes(extension)) return "markdown";
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".pdf", ".zip", ".pt", ".pth", ".bin"].includes(extension)) return "binary";
  return "text";
}

async function resolveAuditPath(workspace, url, requested = "") {
  const { root } = await assertCheckout(workspace, url);
  const relative = safeRelativePath(requested);
  const candidate = path.resolve(root, relative || ".");
  if (!isWithin(root, candidate)) throw new Error("The requested repository path is outside the checkout.");
  const real = await fsp.realpath(candidate);
  if (!isWithin(root, real)) throw new Error("Symlinked paths outside the checkout cannot be read.");
  return { root, relative, target: real };
}

async function listRepositoryCheckoutDirectory(workspace, url, directory = "") {
  const { root, relative, target } = await resolveAuditPath(workspace, url, directory);
  const stats = await fsp.stat(target);
  if (!stats.isDirectory()) throw new Error("The requested repository path is not a directory.");
  const entries = await fsp.readdir(target, { withFileTypes: true });
  const visible = entries
    .filter((entry) => !entry.name.startsWith(".") && !HIDDEN_DIRECTORIES.has(entry.name))
    .sort((left, right) => Number(right.isDirectory()) - Number(left.isDirectory()) || left.name.localeCompare(right.name))
    .slice(0, MAX_DIRECTORY_ENTRIES);
  return {
    directory: relative,
    entries: await Promise.all(visible.map(async (entry) => {
      const entryPath = path.join(target, entry.name);
      const entryRelative = path.relative(root, entryPath).split(path.sep).join("/");
      const entryStats = await fsp.stat(entryPath);
      return { name: entry.name, path: entryRelative, type: entry.isDirectory() ? "directory" : "file", kind: entry.isDirectory() ? undefined : fileKind(entry.name), size: entryStats.size, modified_at: entryStats.mtime.toISOString() };
    })),
    truncated: entries.length > MAX_DIRECTORY_ENTRIES,
  };
}

async function readRepositoryCheckoutFile(workspace, url, filePath) {
  const { relative, target } = await resolveAuditPath(workspace, url, filePath);
  const stats = await fsp.stat(target);
  if (!stats.isFile()) throw new Error("The requested repository path is not a file.");
  if (stats.size > MAX_FILE_BYTES) throw new Error(`This file is larger than ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB and is not opened in the code audit.`);
  const content = await fsp.readFile(target, "utf8");
  if (content.includes("\0")) throw new Error("Binary files cannot be opened in the code audit.");
  return { path: relative, name: path.basename(relative), kind: fileKind(relative), size: stats.size, modified_at: stats.mtime.toISOString(), line_count: content.split("\n").length, content };
}

async function walkRepository(root, directory = "") {
  const target = path.join(root, directory);
  const entries = await fsp.readdir(target, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") || HIDDEN_DIRECTORIES.has(entry.name)) continue;
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkRepository(root, relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

// Resolve references produced by the model without guessing between files.
// A full repository-relative path always wins; abbreviated paths must match a
// whole path suffix and only regular files within the checkout are eligible.
async function resolveRepositoryCodeReference(workspace, url, requested) {
  const relative = safeRelativePath(requested);
  if (!relative) throw new Error("A repository file path is required.");
  const { root } = await assertCheckout(workspace, url);
  try {
    const exact = await resolveAuditPath(workspace, url, relative);
    if ((await fsp.stat(exact.target)).isFile()) return { status: "exact", paths: [relative] };
  } catch (error) {
    if (error?.code !== "ENOENT" && error?.code !== "ENOTDIR") throw error;
  }
  const files = await walkRepository(root);
  const matches = [];
  for (const file of files) {
    const candidate = file.split(path.sep).join("/");
    if (!candidate.endsWith(`/${relative}`)) continue;
    try {
      const resolved = await resolveAuditPath(workspace, url, candidate);
      if ((await fsp.stat(resolved.target)).isFile()) matches.push(candidate);
    } catch (error) {
      if (error?.code !== "ENOENT" && error?.code !== "ENOTDIR") throw error;
    }
  }
  matches.sort();
  return { status: matches.length === 0 ? "missing" : matches.length === 1 ? "unique" : "ambiguous", paths: matches };
}

async function searchRepositoryCheckout(workspace, url, query, directory = "") {
  const needle = String(query || "").trim();
  if (!needle || needle.length > 300) throw new Error("Search for between 1 and 300 characters.");
  const { root, relative, target } = await resolveAuditPath(workspace, url, directory);
  if (!(await fsp.stat(target)).isDirectory()) throw new Error("Search must start from a repository directory.");
  const matches = [];
  for (const file of await walkRepository(root, relative)) {
    if (matches.length >= MAX_SEARCH_RESULTS) break;
    const absolute = path.join(root, file);
    const stats = await fsp.stat(absolute);
    if (stats.size > MAX_SEARCH_FILE_BYTES || fileKind(file) === "binary") continue;
    const content = await fsp.readFile(absolute, "utf8").catch(() => "");
    if (!content || content.includes("\0")) continue;
    const lines = content.split("\n");
    for (let index = 0; index < lines.length && matches.length < MAX_SEARCH_RESULTS; index += 1) {
      if (lines[index].toLowerCase().includes(needle.toLowerCase())) matches.push({ path: file.split(path.sep).join("/"), line: index + 1, excerpt: lines[index].slice(0, 500) });
    }
  }
  return { query: needle, matches };
}

module.exports = { cloneRepositoryCheckout, getRepositoryCheckout, listRepositoryCheckoutDirectory, readRepositoryCheckoutFile, resolveRepositoryCodeReference, searchRepositoryCheckout };
