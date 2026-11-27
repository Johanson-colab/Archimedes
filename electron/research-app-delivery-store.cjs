const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function directory(app, create = false) {
  let current = app.workspace;
  for (const name of ['.archimedes', 'app-delivery', app.id]) {
    current = path.join(current, name);
    const stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (!stat && create) fs.mkdirSync(current);
    else if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw new Error('Linked delivery storage is not supported.');
  }
  return current;
}
function read(app, name, max = 256000) {
  try {
    const file = path.join(directory(app), name), stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > max) throw new Error('Invalid delivery record.');
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function write(app, name, value) {
  const dir = directory(app, true), target = path.join(dir, name), temp = path.join(dir, `.record-${randomUUID()}`);
  if (fs.lstatSync(target, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error('Linked delivery records are not supported.');
  try { fs.writeFileSync(temp, JSON.stringify(value, null, 2), { flag: 'wx', mode: 0o600 }); fs.renameSync(temp, target); }
  finally { fs.rmSync(temp, { force: true }); }
}
function identity(app) {
  const { fingerprint } = require('./research-app-runtime.cjs');
  const interpreter = path.join(app.directory, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const stat = app.runtime.kind === 'python-http' ? fs.statSync(interpreter, { throwIfNoEntry: false }) : null;
  return { fingerprint: fingerprint(app), environment: JSON.stringify({ platform: process.platform, arch: process.arch, runtime: app.runtime.kind, python: stat ? [fs.realpathSync(interpreter), stat.size, stat.mtimeMs] : null, ...(app.frontend ? { frontend: require("./research-app-frontend.cjs").buildStatus(app).identity } : {}), host: 1 }) };
}
function same(a, b) { return a?.fingerprint === b?.fingerprint && a?.environment === b?.environment; }
function deliveryStatus(app) {
  const key = identity(app), state = read(app, 'state.json'), good = read(app, 'verified.json');
  let interrupted = false;
  if (['preparing', 'checking', 'repairing'].includes(state?.status)) {
    try { if (!Number.isInteger(state.ownerPid)) interrupted = true; else process.kill(state.ownerPid, 0); } catch (error) { interrupted = error.code === 'ESRCH'; }
  }
  const certified = same(key, good) && good.scope === 'host-http-and-browser' && good.browser?.passed && good.checks?.length && good.checks.every(check => check.passed);
  const status = interrupted ? 'failed' : same(key, state) && (state.status !== 'ready' || certified) ? state.status : 'draft';
  return { status, error: interrupted ? 'Previous validation was interrupted. Validate this App again.' : same(key, state) ? state.error || '' : '', attempts: same(key, state) ? state.attempts || 0 : 0, checks: same(key, state) ? state.checks || [] : [], verifiedAt: same(key, good) ? good.verifiedAt : null, canRestore: Boolean(good && /^[a-f0-9]{64}$/.test(good.fingerprint) && fs.lstatSync(path.join(directory(app), `${good.fingerprint}.snapshot.json`), { throwIfNoEntry: false })?.isFile()), fingerprint: key.fingerprint };
}
function recoveryAvailable(workspace, id) {
  try { const app = { workspace, id }; const good = read(app, 'verified.json'); return Boolean(good && /^[a-f0-9]{64}$/.test(good.fingerprint) && fs.lstatSync(path.join(directory(app), `${good.fingerprint}.snapshot.json`), { throwIfNoEntry: false })?.isFile()); } catch { return false; }
}
function requireVerified(app) {
  if (deliveryStatus(app).status !== 'ready') throw new Error('Validate this App version before installing or reopening it.');
}
function saveState(app, state) {
  const record = { schemaVersion: 1, ...identity(app), ...state, ownerPid: process.pid, updatedAt: new Date().toISOString() };
  write(app, 'state.json', record); return record;
}
function snapshot(app) {
  const { sourceFiles, fingerprint } = require('./research-app-runtime.cjs');
  const files = sourceFiles(app), id = fingerprint(app);
  write(app, `${id}.snapshot.json`, { fingerprint: id, frontend: app.frontend, files: files.map(f => ({ path: f.path, content: f.content.toString('base64'), mode: f.mode })) });
  return id;
}
function markVerified(app, evidence, expected) {
  if (!same(identity(app), expected)) throw new Error('App source or environment changed during validation.');
  snapshot(app);
  if (!same(identity(app), expected)) throw new Error('App source changed while saving its verified version.');
  const record = saveState(app, { ...evidence, status: 'ready', verifiedAt: new Date().toISOString() });
  write(app, 'verified.json', record); return record;
}
function restoreVerified(workspace, appId) {
  const { readApp, fingerprint } = require('./research-app-runtime.cjs');
  // Read the storage location without requiring a currently valid manifest.
  const root = fs.realpathSync(workspace);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(appId || '') || appId.length > 80) throw new Error('Invalid Research App ID.');
  const app = { workspace: root, id: appId, directory: path.join(root, 'research-apps', appId) };
  for (const dir of [path.dirname(app.directory), app.directory]) if (!fs.lstatSync(dir).isDirectory() || fs.lstatSync(dir).isSymbolicLink()) throw new Error('Linked App directories are not supported.');
  const good = read(app, 'verified.json');
  if (!good) throw new Error('No verified App version is available.');
  const saved = read(app, `${good.fingerprint}.snapshot.json`, 24000000);
  if (!saved || !Array.isArray(saved.files) || saved.files.length > 1600) throw new Error('Verified snapshot is unavailable.');
  const result = replaceSource(app, saved);
  const restored = readApp(workspace, appId);
  saveState(restored, { ...good, ...identity(restored), status: same(identity(restored), good) ? 'ready' : 'draft', error: '', restoredAt: new Date().toISOString() });
  return { restored: true, ...result };
}
function replaceSource(app, saved, expectedFingerprint) {
  const { readApp, fingerprint } = require('./research-app-runtime.cjs');
  const stage = path.join(path.dirname(app.directory), `.restore-${randomUUID()}`), backup = path.join(directory(app, true), `recovery-${randomUUID()}`);
  const moved = []; let swapped = false, oldMoved = false;
  fs.mkdirSync(stage);
  try {
    let bytes = 0;
    for (const file of saved.files) {
      if (typeof file.path !== 'string' || path.isAbsolute(file.path) || file.path.split(/[\\/]/).some((p, i) => !p || p === '..' || p === '.' || (p.startsWith('.') && !(i === 0 && p === '.capabilities')))) throw new Error('Invalid snapshot path.');
      const content = Buffer.from(file.content, 'base64'); bytes += content.length;
      if (bytes > 16000000) throw new Error('Snapshot exceeds the source limit.');
      const target = path.join(stage, file.path); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content, { flag: 'wx', mode: file.mode & 0o777 });
    }
    if (fingerprint({ directory: stage, frontend: app.frontend || saved.frontend }) !== saved.fingerprint) throw new Error('Snapshot integrity check failed.');
    if (expectedFingerprint && fingerprint(readApp(app.workspace, app.id)) !== expectedFingerprint) throw new Error('App source changed during repair. Generated changes were not applied.');
    fs.renameSync(app.directory, backup); oldMoved = true;
    // Keep environment, data, repositories and caches; never restore them from a code snapshot.
    for (const entry of fs.readdirSync(backup)) if ((entry.startsWith('.') && entry !== '.capabilities') || ['node_modules', '__pycache__'].includes(entry)) {
      fs.renameSync(path.join(backup, entry), path.join(stage, entry)); moved.push(entry);
    }
    fs.renameSync(stage, app.directory); swapped = true;
    readApp(app.workspace, app.id);
    return { fingerprint: saved.fingerprint, recoveryPath: backup };
  } catch (error) {
    const source = swapped ? app.directory : stage;
    for (const entry of moved) if (fs.existsSync(path.join(source, entry))) fs.renameSync(path.join(source, entry), path.join(backup, entry));
    if (swapped) fs.renameSync(app.directory, stage);
    if (oldMoved) fs.renameSync(backup, app.directory);
    throw error;
  } finally { fs.rmSync(stage, { recursive: true, force: true }); }
}
module.exports = { recoveryAvailable, identity, same, deliveryStatus, requireVerified, saveState, markVerified, snapshot, restoreVerified, replaceSource, readRecord: read, writeRecord: write };
