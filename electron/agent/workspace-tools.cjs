const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { workspacePath, fileChangeForContent } = require('../workspace-files.cjs');

const MAX_READ_BYTES = 8 * 1024 * 1024;
const MAX_OUTPUT_CHARS = 64_000;
const MAX_WRITE_BYTES = 200_000;
const IGNORE = new Set(['node_modules', 'dist', 'build', '.next', '__pycache__']);
const hash = content => createHash('sha256').update(content).digest('hex');

function visibleRelative(value, allowRoot = false) {
  if (typeof value !== 'string' || path.isAbsolute(value) || value.includes('\0')) throw new Error('Use a workspace-relative path.');
  const normalized = value.replaceAll('\\', '/');
  const parts = normalized.split('/').filter(Boolean);
  if ((!parts.length && !allowRoot) || parts.some(part => part === '..' || (part.startsWith('.') && part !== '.'))) throw new Error('The requested path is hidden or outside the workspace.');
  return parts.filter(part => part !== '.').join('/');
}

function visibleExisting(root, value, allowRoot = false) {
  const relative = visibleRelative(value, allowRoot);
  const target = workspacePath(root, relative);
  const realRoot = fs.realpathSync(root);
  visibleRelative(path.relative(realRoot, target).split(path.sep).join('/'), allowRoot);
  return { root: realRoot, target, relative: path.relative(realRoot, target).split(path.sep).join('/') || '.' };
}

function readLines(root, file, startLine = 1, endLine) {
  const resolved = visibleExisting(root, file);
  const start = startLine == null ? 1 : Number(startLine);
  const end = endLine == null ? start + 399 : Number(endLine);
  if (!Number.isInteger(start) || start < 1 || !Number.isInteger(end) || end < start || end - start >= 2000) throw new Error('Choose a valid line range of at most 2000 lines.');
  const stats = fs.statSync(resolved.target);
  if (!stats.isFile() || stats.size > MAX_READ_BYTES) throw new Error(`Read requires a text file no larger than ${MAX_READ_BYTES} bytes.`);
  const buffer = fs.readFileSync(resolved.target);
  if (buffer.subarray(0, 8192).includes(0)) throw new Error('The requested file appears to be binary.');
  const text = buffer.toString('utf8');
  const selected = [];
  let length = 0, last = start - 1, lineTruncated = false, position = 0, lineNumber = 1, nextLine = null, totalLines = null;
  while (position <= text.length) {
    const endIndex = text.indexOf('\n', position);
    const lineEnd = endIndex < 0 ? text.length : endIndex;
    if (lineNumber >= start) {
      const line = text.slice(position, lineEnd).replace(/\r$/, '');
      const remaining = MAX_OUTPUT_CHARS - length - (selected.length ? 1 : 0);
      if (remaining <= 0) { nextLine = lineNumber; break; }
      selected.push(line.slice(0, remaining));
      length += selected.at(-1).length + (selected.length > 1 ? 1 : 0);
      last = lineNumber;
      if (line.length > remaining) { lineTruncated = true; nextLine = endIndex < 0 ? null : lineNumber + 1; break; }
    }
    if (endIndex < 0) { totalLines = lineNumber; break; }
    position = endIndex + 1;
    lineNumber += 1;
    if (lineNumber > end) { nextLine = lineNumber; break; }
  }
  return { path: resolved.relative, content: selected.join('\n'), start_line: start, end_line: last, total_lines: totalLines, next_line: nextLine, line_truncated: lineTruncated };
}

function searchWorkspace(root, { query, directory = '', caseSensitive = false, signal } = {}) {
  if (typeof query !== 'string' || !query.trim() || query.length > 500) throw new Error('Search requires a non-empty literal query of at most 500 characters.');
  const resolved = visibleExisting(root, directory, true);
  if (!fs.statSync(resolved.target).isDirectory()) throw new Error('Search directory must be a directory.');
  const matches = [], pending = [resolved.target];
  let scanned = 0, bytes = 0, skipped = 0, directories = 0, visited = 0, truncated = false;
  const needle = caseSensitive ? query : query.toLocaleLowerCase();
  traversal: while (pending.length) {
    if (signal?.aborted) throw Object.assign(new Error('Workspace search interrupted.'), { name: 'AbortError' });
    if (directories >= 1000 || visited >= 10_000) { truncated = true; break; }
    const current = pending.pop();
    let handle;
    try {
      const real = fs.realpathSync(current);
      if (fs.lstatSync(current).isSymbolicLink() || (real !== resolved.root && !real.startsWith(resolved.root + path.sep))) { skipped += 1; continue; }
      handle = fs.opendirSync(current);
      directories += 1;
    }
    catch { skipped += 1; continue; }
    try {
      let entry;
      while ((entry = handle.readSync()) !== null) {
        visited += 1;
        if (visited > 10_000) { truncated = true; break traversal; }
        if (entry.name.startsWith('.') || IGNORE.has(entry.name) || entry.isSymbolicLink()) continue;
        const target = path.join(current, entry.name);
        if (entry.isDirectory()) { pending.push(target); continue; }
        if (!entry.isFile()) continue;
        if (scanned >= 5000 || bytes >= 32 * 1024 * 1024 || matches.length >= 100) { truncated = true; break traversal; }
        try {
          const stats = fs.lstatSync(target);
          if (!stats.isFile() || stats.isSymbolicLink() || stats.size > 1024 * 1024 || bytes + stats.size > 32 * 1024 * 1024) { skipped += 1; continue; }
          const data = fs.readFileSync(target);
          scanned += 1; bytes += data.length;
          if (data.subarray(0, 8192).includes(0)) { skipped += 1; continue; }
          const text = data.toString('utf8');
          let position = 0, lineNumber = 1;
          while (position <= text.length) {
            const end = text.indexOf('\n', position);
            const line = text.slice(position, end < 0 ? text.length : end).replace(/\r$/, '');
            const at = (caseSensitive ? line : line.toLocaleLowerCase()).indexOf(needle);
            if (at >= 0) {
              matches.push({ path: path.relative(resolved.root, target).split(path.sep).join('/'), line: lineNumber, text: line.slice(Math.max(0, at - 100), Math.max(0, at - 100) + 300) });
              if (matches.length >= 100) { truncated = true; break traversal; }
            }
            if (end < 0) break;
            position = end + 1; lineNumber += 1;
          }
        } catch { skipped += 1; }
      }
    } finally { handle.closeSync(); }
  }
  return { query, directory: resolved.relative, matches, scanned_files: scanned, skipped_files: skipped, truncated, bytes_scanned: bytes };
}

function writableTarget(root, relative, createParents = false) {
  const rootPath = fs.realpathSync(root);
  const normalized = visibleRelative(relative);
  const parts = normalized.split('/');
  let current = rootPath;
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    const stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink()) throw new Error('Refusing to write through a symbolic link.');
    if (index < parts.length - 1) {
      if (stat && !stat.isDirectory()) throw new Error('A parent path is not a directory.');
      if (!stat && createParents) fs.mkdirSync(current);
    } else if (stat && !stat.isFile()) throw new Error('The write target is not a regular file.');
  }
  return { root: rootPath, target: current, relative: normalized };
}

function prepareWrite(root, file, content) {
  if (typeof content !== 'string' || Buffer.byteLength(content) > MAX_WRITE_BYTES) throw new Error(`A write needs UTF-8 content of at most ${MAX_WRITE_BYTES} bytes.`);
  const resolved = writableTarget(root, file);
  const stat = fs.statSync(resolved.target, { throwIfNoEntry: false });
  if (stat && stat.size > MAX_READ_BYTES) throw new Error('Existing file is too large to safely review.');
  const previous = stat ? fs.readFileSync(resolved.target) : null;
  return { path: resolved.relative, content, workspaceRoot: resolved.root, expectedExists: Boolean(previous), expectedHash: previous ? hash(previous) : null, change: fileChangeForContent(resolved.root, resolved.relative, content) };
}

function prepareEdit(root, file, oldText, newText, replaceAll = false) {
  if (typeof oldText !== 'string' || !oldText || typeof newText !== 'string') throw new Error('An edit needs non-empty old_text and a new_text string.');
  const resolved = visibleExisting(root, file);
  const stat = fs.statSync(resolved.target);
  if (!stat.isFile() || stat.size > MAX_WRITE_BYTES) throw new Error('Precise editing requires a text file of at most 200000 bytes.');
  const buffer = fs.readFileSync(resolved.target);
  if (buffer.includes(0)) throw new Error('Precise editing does not support binary files.');
  const original = buffer.toString('utf8');
  const parts = original.split(oldText);
  const count = parts.length - 1;
  if (!count) throw new Error('old_text was not found; read the current file and try again.');
  if (count > 1 && !replaceAll) throw new Error(`old_text matched ${count} places; provide a unique match or set replace_all.`);
  const content = replaceAll ? parts.join(newText) : original.replace(oldText, () => newText);
  return { ...prepareWrite(root, file, content), replacementCount: replaceAll ? count : 1, editPreview: { before: oldText, after: newText } };
}

function applyApprovedWrite(payload, fallbackRoot) {
  const { target } = writableTarget(payload.workspaceRoot || fallbackRoot, payload.path, true);
  const stat = fs.lstatSync(target, { throwIfNoEntry: false });
  const expected = Object.hasOwn(payload, 'expectedExists');
  if (expected && Boolean(stat) !== payload.expectedExists) throw Object.assign(new Error('The file changed while awaiting approval. Read it again and request a new edit.'), { code: 'WORKSPACE_CONFLICT' });
  const flags = stat ? fs.constants.O_RDWR : fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL;
  let fd;
  try { fd = fs.openSync(target, flags | (fs.constants.O_NOFOLLOW || 0), 0o666); }
  catch (error) {
    if (expected && ['EEXIST', 'ENOENT'].includes(error.code)) throw Object.assign(new Error('The file changed while awaiting approval. Read it again and request a new edit.'), { code: 'WORKSPACE_CONFLICT' });
    throw error;
  }
  try {
    if (expected && stat && hash(fs.readFileSync(fd)) !== payload.expectedHash) throw Object.assign(new Error('The file changed while awaiting approval. Read it again and request a new edit.'), { code: 'WORKSPACE_CONFLICT' });
    fs.ftruncateSync(fd, 0);
    const content = Buffer.from(payload.content, 'utf8');
    let offset = 0;
    while (offset < content.length) { const n = fs.writeSync(fd, content, offset, content.length - offset, offset); if (!n) throw new Error('Could not write workspace file.'); offset += n; }
  } finally { fs.closeSync(fd); }
}

function readCommandLog(root, relative, offset = 0, length = 32_000) {
  if (typeof relative !== 'string' || !/^\.archimedes\/agent-command-logs\/[a-f0-9-]{36}\.log$/.test(relative)) throw new Error('Invalid command log path.');
  const start = Number(offset), size = Number(length);
  if (!Number.isSafeInteger(start) || start < 0 || !Number.isInteger(size) || size < 1 || size > 64_000) throw new Error('Choose a valid log offset and length (1–64000 bytes).');
  const rootPath = fs.realpathSync(root);
  let target = rootPath;
  for (const part of relative.split('/')) {
    target = path.join(target, part);
    if (fs.lstatSync(target).isSymbolicLink()) throw new Error('Command logs cannot be symbolic links.');
  }
  const fd = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > 10 * 1024 * 1024) throw new Error('Invalid command log file.');
    const data = Buffer.alloc(Math.min(size + 3, Math.max(0, stat.size - start)));
    const read = data.length ? fs.readSync(fd, data, 0, data.length, start) : 0;
    let end = Math.min(size, read);
    while (end < read && (data[end] & 0xc0) === 0x80) end += 1;
    return { log_path: relative, offset: start, content: data.subarray(0, end).toString('utf8'), next_offset: start + end < stat.size ? start + end : null, size_bytes: stat.size };
  } finally { fs.closeSync(fd); }
}

module.exports = { readLines, searchWorkspace, prepareWrite, prepareEdit, applyApprovedWrite, readCommandLog, writableTarget, visibleExisting, MAX_READ_BYTES, MAX_OUTPUT_CHARS, MAX_WRITE_BYTES };
