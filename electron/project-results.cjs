const fs = require("node:fs");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const { writableTarget } = require("./agent/workspace-tools.cjs");

const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_PACKAGE_BYTES = 250 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 1024 * 1024;
const KINDS = new Set(["analysis", "figure"]);
const ROLES = new Set(["source", "reference", "output"]);
const ENCODINGS = new Set(["utf8", "base64"]);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

function identifier(value, label) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value)) throw new Error(`Invalid ${label}.`);
  return value;
}
function filename(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(value) || value === "manifest.json") throw new Error("Use a plain result filename.");
  return value;
}
function owner(input) {
  if (!KINDS.has(input.kind)) throw new Error("Choose an analysis or figure result.");
  return {
    id: identifier(input.id, "result id"), kind: input.kind,
    projectId: identifier(input.projectId, "project id"), workspaceId: identifier(input.workspaceId, "workspace id"),
    threadId: input.threadId == null ? null : identifier(input.threadId, "session id"),
    executionRoot: fs.realpathSync(input.executionRoot),
  };
}
function base(scope) { return `research-results/${scope.kind}/${scope.id}`; }
function manifestPath(scope) { return `${base(scope)}/manifest.json`; }
function sameOwner(first, second) {
  // The verified database record owns the optional session association. A
  // saved analysis may acquire a session later, or lose it after deletion.
  return ["id", "kind", "projectId", "workspaceId", "executionRoot"].every((key) => first[key] === second[key]);
}
function payload(input) {
  const text = JSON.stringify(input);
  if (!text || Buffer.byteLength(text) > MAX_MANIFEST_BYTES) throw new Error("The result manifest exceeds the 1 MB limit.");
  const value = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("A result needs a manifest object.");
  const inspect = (item) => {
    if (!item || typeof item !== "object") return;
    for (const [key, child] of Object.entries(item)) {
      if (/^(?:api[_-]?key|authorization|access[_-]?token|refresh[_-]?token|password|secret)$/i.test(key)) throw new Error("Save model settings without credentials.");
      inspect(child);
    }
  };
  inspect(value);
  return value;
}
function decode(file) {
  filename(file.name);
  if (!ROLES.has(file.role) || !ENCODINGS.has(file.encoding) || typeof file.content !== "string") throw new Error("Invalid result file.");
  if (file.encoding === "base64" && (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.content))) throw new Error("Invalid base64 result file.");
  const bytes = Buffer.from(file.content, file.encoding);
  const limit = file.role === "source" && /\.(csv|tsv)$/i.test(file.name) ? MAX_SOURCE_BYTES : MAX_FILE_BYTES;
  if (bytes.length > limit) throw new Error(`The result file ${file.name} exceeds its ${limit / 1024 / 1024} MB limit.`);
  return bytes;
}
function regularTarget(root, relative, allowMissing = false) {
  const resolved = writableTarget(root, relative);
  const stat = fs.lstatSync(resolved.target, { throwIfNoEntry: false });
  if (!stat && allowMissing) return null;
  if (!stat?.isFile()) throw new Error("The result file is missing.");
  // writableTarget checks every parent; realpath additionally binds the actual read.
  const actual = fs.realpathSync(resolved.target);
  if (!actual.startsWith(`${resolved.root}${path.sep}`)) throw new Error("The result file is outside its execution folder.");
  return { target: actual, stat };
}
function readBuffer(root, relative, limit) {
  const file = regularTarget(root, relative);
  if (file.stat.size > limit) throw new Error("The stored result file exceeds its size limit.");
  const fd = fs.openSync(file.target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try { return fs.readFileSync(fd); } finally { fs.closeSync(fd); }
}
function hashFile(root, relative) {
  const file = regularTarget(root, relative, true);
  if (!file) return null;
  if (file.stat.size > MAX_FILE_BYTES) throw new Error("The stored result file exceeds its size limit.");
  const fd = fs.openSync(file.target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const digest = createHash("sha256"), buffer = Buffer.alloc(1024 * 1024);
    let size;
    while ((size = fs.readSync(fd, buffer, 0, buffer.length, null))) digest.update(buffer.subarray(0, size));
    return digest.digest("hex");
  } finally { fs.closeSync(fd); }
}
function atomicWrite(root, relative, bytes) {
  const resolved = writableTarget(root, relative, true);
  const temporary = `${relative}.${randomUUID()}.tmp`;
  const temp = writableTarget(root, temporary);
  let fd;
  try {
    fd = fs.openSync(temp.target, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0), 0o600);
    fs.writeFileSync(fd, bytes); fs.closeSync(fd); fd = undefined;
    writableTarget(root, relative); // Recheck before replacing an existing file.
    fs.renameSync(temp.target, resolved.target);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    fs.rmSync(temp.target, { force: true });
  }
}
function load(record) {
  const scope = owner(record), relative = manifestPath(scope);
  if (record.manifestPath && record.manifestPath !== relative) throw new Error("The result manifest does not match its registered path.");
  const envelope = JSON.parse(readBuffer(scope.executionRoot, relative, MAX_MANIFEST_BYTES).toString("utf8"));
  if (envelope.schemaVersion !== 1 || !sameOwner(envelope.owner || {}, scope)) throw new Error("The result manifest does not match its registered owner.");
  if (!Array.isArray(envelope.files) || !envelope.files.length || envelope.files.length > 16) throw new Error("Invalid result file inventory.");
  const names = new Set();
  for (const file of envelope.files) {
    filename(file.name);
    if (names.has(file.name) || !ROLES.has(file.role) || !ENCODINGS.has(file.encoding) || !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 0 || file.sizeBytes > MAX_FILE_BYTES) throw new Error("Invalid result file inventory.");
    if (file.path !== `${base(scope)}/${file.name}`) throw new Error("Invalid result file path.");
    names.add(file.name);
  }
  return { scope, envelope, relative };
}
function detail(scope, envelope, relative) {
  const files = envelope.files.map((file) => {
    const actualSha256 = hashFile(scope.executionRoot, file.path);
    return { ...file, actualSha256, fileState: actualSha256 === null ? "missing" : actualSha256 === file.sha256 ? "ready" : "changed" };
  });
  return {
    ...scope, title: envelope.title, manifestPath: relative, createdAt: envelope.createdAt, updatedAt: envelope.updatedAt,
    manifest: envelope.manifest, files, fileState: files.some((file) => file.fileState === "missing") ? "missing" : files.some((file) => file.fileState === "changed") ? "changed" : "ready",
    missingFiles: files.filter((file) => file.fileState === "missing").map((file) => file.name),
    changedFiles: files.filter((file) => file.fileState === "changed").map((file) => file.name),
  };
}
function savePackage(input) {
  const scope = owner(input), relative = manifestPath(scope);
  if (typeof input.title !== "string" || !input.title.trim() || input.title.length > 500) throw new Error("Give this result a title of at most 500 characters.");
  if (!Array.isArray(input.files) || !input.files.length || input.files.length > 16) throw new Error("Save between 1 and 16 result files.");
  const manifest = payload(input.manifest), names = new Set();
  let total = 0;
  const prepared = input.files.map((file) => {
    const bytes = decode(file);
    if (names.has(file.name)) throw new Error("Result filenames must be unique.");
    names.add(file.name); total += bytes.length;
    return { bytes, metadata: { name: file.name, role: file.role, encoding: file.encoding, path: `${base(scope)}/${file.name}`, sizeBytes: bytes.length, sha256: hash(bytes) } };
  });
  if (total > MAX_PACKAGE_BYTES) throw new Error("The result package exceeds the 250 MB limit.");
  let createdAt = new Date().toISOString();
  if (regularTarget(scope.executionRoot, relative, true)) {
    const previous = load({ ...scope, manifestPath: relative });
    if (detail(scope, previous.envelope, relative).fileState !== "ready") throw new Error("The saved result files changed or are missing. Open the changed source as a new result before saving.");
    createdAt = previous.envelope.createdAt;
  }
  const envelope = { schemaVersion: 1, owner: scope, title: input.title.trim(), createdAt, updatedAt: new Date().toISOString(), manifest, files: prepared.map((file) => file.metadata) };
  const serialized = Buffer.from(JSON.stringify(envelope, null, 2) + "\n");
  if (serialized.length > MAX_MANIFEST_BYTES) throw new Error("The result manifest exceeds the 1 MB limit.");
  // Validate all destinations before the first write; an atomic manifest is the
  // receipt. Interrupted updates are reported as changed, never as verified data.
  for (const file of prepared) writableTarget(scope.executionRoot, file.metadata.path, true);
  for (const file of prepared) atomicWrite(scope.executionRoot, file.metadata.path, file.bytes);
  atomicWrite(scope.executionRoot, relative, serialized);
  return detail(scope, envelope, relative);
}
function readPackage(record) {
  const { scope, envelope, relative } = load(record);
  return detail(scope, envelope, relative);
}
function readPackageFile(record, name) {
  const { scope, envelope } = load(record);
  const file = envelope.files.find((item) => item.name === name);
  if (!file) throw new Error("This file is not registered in the result manifest.");
  const bytes = readBuffer(scope.executionRoot, file.path, MAX_FILE_BYTES), actualSha256 = hash(bytes);
  return { name: file.name, encoding: file.encoding, content: bytes.toString(file.encoding), sha256: file.sha256, actualSha256, fileState: actualSha256 === file.sha256 ? "ready" : "changed" };
}

module.exports = { savePackage, readPackage, readPackageFile, MAX_SOURCE_BYTES, MAX_FILE_BYTES, MAX_PACKAGE_BYTES };
