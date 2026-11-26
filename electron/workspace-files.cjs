const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { resolveWorkspaceTarget } = require("./security/path-sandbox.cjs");
const { diffLines } = require("diff");
const { writeTextFileAtomically } = require("./atomic-text-file.cjs");

const IGNORED_NAMES = new Set([".archimedes", ".git", "node_modules", "dist", "build", ".next", ".DS_Store"]);
const TEXT_EXTENSIONS = new Set([
  "", ".c", ".cc", ".cjs", ".cpp", ".css", ".csv", ".env", ".go", ".h", ".hpp", ".html",
  ".ini", ".java", ".js", ".json", ".jsonl", ".jsx", ".kt", ".latex", ".log", ".lua", ".m",
  ".md", ".mdx", ".mjs", ".php", ".pl", ".properties", ".py", ".r", ".rb", ".rs", ".rst",
  ".bib", ".bst", ".cfg", ".cls", ".scss", ".sh", ".sql", ".sty", ".swift", ".tex", ".toml", ".ts", ".tsx", ".txt", ".vue", ".xml",
  ".yaml", ".yml",
]);
const IMAGE_EXTENSIONS = new Set([".avif", ".bmp", ".gif", ".jpeg", ".jpg", ".png", ".webp"]);
const MAX_SNAPSHOT_ENTRIES = 5_000;
const MAX_TEXT_BYTES = 2_000_000;
const MAX_SNAPSHOT_TEXT_BYTES = 1_000_000;
const MAX_SNAPSHOT_TOTAL_TEXT_BYTES = 8_000_000;
const SNAPSHOT_GENERATED_DIRECTORY_NAMES = new Set([".venv", "venv", "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache", ".tox", ".nox"]);

function normalizeRelative(value = "") {
  return String(value || "").replaceAll("\\", "/").replace(/^\/+/, "");
}

function workspacePath(root, requested = "", { mustExist = true } = {}) {
  return resolveWorkspaceTarget(root, normalizeRelative(requested), mustExist).target;
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

function inspectWorkspacePath(root, relative) {
  const target = workspacePath(root, relative);
  const stats = fs.statSync(target);
  if (!stats.isFile() && !stats.isDirectory()) throw new Error("The requested path is not a file or directory.");
  return { path: relativePath(root, target), type: stats.isDirectory() ? "directory" : "file" };
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
  const requested = workspacePath(root, normalized, { mustExist: false });
  const target = fs.lstatSync(requested, { throwIfNoEntry: false }) ? workspacePath(root, normalized) : requested;
  writeTextFileAtomically(target, content);
  return readWorkspaceFile(root, normalized);
}

function snapshotWorkspace(root) {
  const files = new Map();
  let retainedTextBytes = 0;
  const coverage = { entries: 0, textBytesRead: 0, metadataOnly: 0, ignoredDirectories: 0, generatedDirectories: 0, byteBudgetReached: false, entryLimitReached: false };

  function visit(directory) {
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.size >= MAX_SNAPSHOT_ENTRIES) { coverage.entryLimitReached = true; break; }
      const generatedDirectory = entry.isDirectory() && SNAPSHOT_GENERATED_DIRECTORY_NAMES.has(entry.name);
      if (IGNORED_NAMES.has(entry.name) || generatedDirectory || entry.isSymbolicLink()) {
        if (entry.isDirectory()) {
          coverage.ignoredDirectories += 1;
          if (generatedDirectory) coverage.generatedDirectories += 1;
        }
        continue;
      }
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(target);
        continue;
      }
      if (!entry.isFile()) continue;
      const stats = fs.statSync(target);
      const kind = fileKind(target);
      // The I/O budget must apply before reading/hashing, not merely before
      // retaining text. Beyond it, size/time metadata still detects changes.
      const isText = kind === "text" || kind === "markdown";
      if (isText && (stats.size > MAX_SNAPSHOT_TEXT_BYTES || retainedTextBytes + stats.size > MAX_SNAPSHOT_TOTAL_TEXT_BYTES)) coverage.byteBudgetReached = true;
      const text = isText && stats.size <= MAX_SNAPSHOT_TEXT_BYTES
        && retainedTextBytes + stats.size <= MAX_SNAPSHOT_TOTAL_TEXT_BYTES
        ? fs.readFileSync(target, "utf8")
        : null;
      const metadata = `${stats.size}:${stats.mtimeMs}:${stats.ctimeMs}`;
      const fingerprint = text === null
        ? metadata
        : createHash("sha1").update(text).digest("hex");
      if (text !== null) { retainedTextBytes += stats.size; coverage.textBytesRead += stats.size; }
      else coverage.metadataOnly += 1;
      files.set(relativePath(root, target), { kind, content: text, fingerprint, metadata, tracking: text === null ? "metadata" : "content" });
    }
  }

  visit(workspacePath(root));
  coverage.entries = files.size;
  Object.defineProperty(files, "coverage", { value: coverage });
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
    // Adding an earlier file can shift the text budget. That alone must not
    // report an untouched file as modified when its tracking mode changes.
    if (previous.tracking !== next.tracking && previous.metadata === next.metadata) continue;
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
  inspectWorkspacePath,
  listWorkspaceDirectory,
  listWorkspaceTree,
  readWorkspaceFile,
  snapshotWorkspace,
  workspacePath,
  writeWorkspaceTextFile,
};
