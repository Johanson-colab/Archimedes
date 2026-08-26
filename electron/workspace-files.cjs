const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { diffLines } = require("diff");

const IGNORED_NAMES = new Set([".archimedes", ".git", "node_modules", "dist", "build", ".next", ".DS_Store"]);
const TEXT_EXTENSIONS = new Set([
  "", ".c", ".cc", ".cjs", ".cpp", ".css", ".csv", ".env", ".go", ".h", ".hpp", ".html",
  ".ini", ".java", ".js", ".json", ".jsonl", ".jsx", ".kt", ".latex", ".log", ".lua", ".m",
  ".md", ".mdx", ".mjs", ".php", ".pl", ".properties", ".py", ".r", ".rb", ".rs", ".rst",
  ".scss", ".sh", ".sql", ".swift", ".tex", ".toml", ".ts", ".tsx", ".txt", ".vue", ".xml",
  ".yaml", ".yml",
]);
const IMAGE_EXTENSIONS = new Set([".avif", ".bmp", ".gif", ".jpeg", ".jpg", ".png", ".webp"]);
const MAX_SNAPSHOT_ENTRIES = 5_000;
const MAX_TEXT_BYTES = 2_000_000;
const MAX_SNAPSHOT_TEXT_BYTES = 1_000_000;

function normalizeRelative(value = "") {
  return String(value || "").replaceAll("\\", "/").replace(/^\/+/, "");
}

function workspacePath(root, requested = "", { mustExist = true } = {}) {
  const workspace = path.resolve(root);
  const target = path.resolve(workspace, normalizeRelative(requested));
  if (target !== workspace && !target.startsWith(`${workspace}${path.sep}`)) {
    throw new Error("The requested path is outside the active workspace.");
  }
  if (!mustExist) return target;
  const realWorkspace = fs.realpathSync(workspace);
  const realTarget = fs.realpathSync(target);
  if (realTarget !== realWorkspace && !realTarget.startsWith(`${realWorkspace}${path.sep}`)) {
    throw new Error("The requested path resolves outside the active workspace.");
  }
  return realTarget;
}

function relativePath(root, target) {
  const workspace = fs.existsSync(root) ? fs.realpathSync(root) : path.resolve(root);
  return path.relative(workspace, target).split(path.sep).join("/") || ".";
}

function fileKind(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".pdf") return "pdf";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (TEXT_EXTENSIONS.has(extension) || path.basename(filePath).startsWith(".")) {
    return extension === ".md" || extension === ".mdx" ? "markdown" : "text";
  }
  return "binary";
}

function lineCount(content) {
  if (!content) return 0;
  return content.split(/\r?\n/).length;
}

function lineStats(before, after) {
  let additions = 0;
  let deletions = 0;
  for (const part of diffLines(before, after)) {
    const count = part.count ?? lineCount(part.value);
    if (part.added) additions += count;
    if (part.removed) deletions += count;
  }
  return { additions, deletions };
}

function fileChangeForContent(root, relative, nextContent) {
  const normalized = normalizeRelative(relative);
  const target = workspacePath(root, normalized, { mustExist: false });
  if (!fs.existsSync(target)) {
    return { path: normalized, status: "created", additions: lineCount(nextContent), deletions: 0 };
  }
  const stats = fs.statSync(target);
  if (!stats.isFile()) throw new Error("The write target is not a file.");
  const previous = stats.size <= MAX_TEXT_BYTES ? fs.readFileSync(target, "utf8") : "";
  return { path: normalized, status: "modified", ...lineStats(previous, nextContent) };
}

function listWorkspaceDirectory(root, relative = "") {
  const directory = workspacePath(root, relative);
  if (!fs.statSync(directory).isDirectory()) throw new Error("The requested path is not a directory.");
  const entries = fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => !IGNORED_NAMES.has(entry.name) && !entry.isSymbolicLink())
    .sort((left, right) => {
      if (left.isDirectory() !== right.isDirectory()) return left.isDirectory() ? -1 : 1;
      return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
    })
    .flatMap((entry) => {
      const target = path.join(directory, entry.name);
      const entryPath = relativePath(root, target);
      if (entry.isDirectory()) return [{ name: entry.name, path: entryPath, type: "directory" }];
      if (!entry.isFile()) return [];
      try {
        const stats = fs.statSync(target);
        return [{
          name: entry.name,
          path: entryPath,
          type: "file",
          kind: fileKind(target),
          size: stats.size,
          modifiedAt: stats.mtime.toISOString(),
        }];
      } catch {
        return [];
      }
    });
  return { directory: normalizeRelative(relative), entries, count: entries.length, truncated: false };
}

function listWorkspaceTree(root) {
  return listWorkspaceDirectory(root);
}

function readWorkspaceFile(root, relative) {
  const target = workspacePath(root, relative);
  const stats = fs.statSync(target);
  if (!stats.isFile()) throw new Error("The requested path is not a file.");
  const kind = fileKind(target);
  const result = {
    name: path.basename(target),
    path: relativePath(root, target),
    kind,
    size: stats.size,
    modifiedAt: stats.mtime.toISOString(),
  };
  if (kind === "text" || kind === "markdown") {
    if (stats.size > MAX_TEXT_BYTES) throw new Error(`Text preview is limited to ${MAX_TEXT_BYTES} bytes.`);
    return { ...result, content: fs.readFileSync(target, "utf8") };
  }
  return result;
}

function writeWorkspaceTextFile(root, relative, content) {
  if (typeof content !== "string" || Buffer.byteLength(content, "utf8") > MAX_TEXT_BYTES) {
    throw new Error(`Text files are limited to ${MAX_TEXT_BYTES} bytes.`);
  }
  const normalized = normalizeRelative(relative);
  if (!normalized || normalized === ".") throw new Error("A workspace-relative file path is required.");
  const target = workspacePath(root, normalized, { mustExist: false });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
  return readWorkspaceFile(root, normalized);
}

function snapshotWorkspace(root) {
  const files = new Map();

  function visit(directory) {
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.size >= MAX_SNAPSHOT_ENTRIES || IGNORED_NAMES.has(entry.name) || entry.isSymbolicLink()) continue;
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(target);
        continue;
      }
      if (!entry.isFile()) continue;
      const stats = fs.statSync(target);
      const kind = fileKind(target);
      const content = (kind === "text" || kind === "markdown") && stats.size <= MAX_SNAPSHOT_TEXT_BYTES
        ? fs.readFileSync(target, "utf8")
        : null;
      const fingerprint = content === null
        ? `${stats.size}:${stats.mtimeMs}`
        : createHash("sha1").update(content).digest("hex");
      files.set(relativePath(root, target), { kind, content, fingerprint });
    }
  }

  visit(workspacePath(root));
  return files;
}

function compareWorkspaceSnapshots(before, after) {
  const paths = new Set([...before.keys(), ...after.keys()]);
  const changes = [];
  for (const filePath of [...paths].sort()) {
    const previous = before.get(filePath);
    const next = after.get(filePath);
    if (!previous && next) {
      changes.push({ path: filePath, status: "created", additions: next.content === null ? 0 : lineCount(next.content), deletions: 0 });
      continue;
    }
    if (previous && !next) {
      changes.push({ path: filePath, status: "deleted", additions: 0, deletions: previous.content === null ? 0 : lineCount(previous.content) });
      continue;
    }
    if (!previous || !next || previous.fingerprint === next.fingerprint) continue;
    const stats = previous.content !== null && next.content !== null
      ? lineStats(previous.content, next.content)
      : { additions: 0, deletions: 0 };
    changes.push({ path: filePath, status: "modified", ...stats });
  }
  return changes;
}

module.exports = {
  compareWorkspaceSnapshots,
  fileChangeForContent,
  fileKind,
  listWorkspaceDirectory,
  listWorkspaceTree,
  readWorkspaceFile,
  snapshotWorkspace,
  workspacePath,
  writeWorkspaceTextFile,
};
