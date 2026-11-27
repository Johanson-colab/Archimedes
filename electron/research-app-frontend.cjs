const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const digest = value => createHash('sha256').update(value).digest('hex');

function artifacts(app, root = path.join(app.directory, 'public')) {
  const files = []; let bytes = 0;
  function visit(directory, prefix) {
    if (fs.lstatSync(directory).isSymbolicLink()) throw new Error('Linked frontend output is not supported.');
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.')) continue;
      const file = path.join(directory, entry.name), relative = prefix + entry.name;
      if (entry.isSymbolicLink()) throw new Error('Linked frontend output is not supported.');
      if (entry.isDirectory()) visit(file, relative + '/');
      else if (entry.isFile()) {
        const size = fs.statSync(file).size; bytes += size;
        if (files.length >= 1600 || size > 8000000 || bytes > 16000000) throw new Error('Frontend output exceeds the host asset limit.');
        files.push({ path: relative, content: fs.readFileSync(file) });
      }
    }
  }
  visit(root, 'public/');
  if (!files.some(file => file.path === 'public/index.html')) throw new Error('Vite did not produce public/index.html.');
  return files;
}
function outputHash(files) {
  const hash = createHash('sha256'); for (const file of files) { hash.update(file.path); hash.update('\0'); hash.update(file.content); } return hash.digest('hex');
}
function buildStatus(app) {
  if (!app.frontend) return { current: true, identity: null };
  try {
    const record = require('./research-app-delivery-store.cjs').readRecord(app, 'frontend-build.json');
    const source = require('./research-app-runtime.cjs').fingerprint(app), output = outputHash(artifacts(app));
    const current = Boolean(record && record.fingerprint === source && record.outputHash === output);
    return { current, identity: current ? JSON.stringify({ output, toolchain: record.toolchain }) : 'build-required' };
  } catch { return { current: false, identity: 'build-required' }; }
}
function dependencyPlan(app) {
  const read = (name, max) => { const file = path.join(app.directory, name), stat = fs.lstatSync(file); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > max) throw new Error(`Invalid ${name}.`); return fs.readFileSync(file, 'utf8'); };
  const packageText = read('package.json', 16000), lockText = read('package-lock.json', 2000000);
  const pkg = JSON.parse(packageText), lock = JSON.parse(lockText);
  if (pkg.type !== 'module' || pkg.workspaces || pkg.overrides || lock.lockfileVersion !== 3 || !lock.packages?.['']) throw new Error('Use a single ESM App with an npm v3 lockfile, without workspaces or overrides.');
  const packages = { ...pkg.dependencies, ...pkg.devDependencies };
  if (Object.keys(packages).length > 80 || Object.entries(packages).some(([name, version]) => !/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(name) || typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version))) throw new Error('Pin frontend packages to exact registry versions.');
  for (const name of ['react', 'react-dom', 'vite', 'typescript', '@vitejs/plugin-react', '@types/react', '@types/react-dom']) if (!packages[name]) throw new Error(`React template requires ${name}.`);
  const sorted = value => JSON.stringify(Object.entries(value || {}).sort(([a], [b]) => a.localeCompare(b)));
  if (sorted(pkg.dependencies) !== sorted(lock.packages[''].dependencies) || sorted(pkg.devDependencies) !== sorted(lock.packages[''].devDependencies)) throw new Error('Update package-lock.json to match the exact dependency pins.');
  for (const [location, item] of Object.entries(lock.packages)) {
    if (!location) continue;
    if (!location.startsWith('node_modules/') || item.link || !item.resolved || !item.integrity) throw new Error('Frontend lockfile must contain integrity-pinned registry packages only.');
    const url = new URL(item.resolved);
    if (url.protocol !== 'https:' || url.hostname !== 'registry.npmjs.org' || url.username || url.password || url.search || url.hash) throw new Error('Frontend packages must resolve to the npm registry.');
  }
  for (const file of ['.npmrc', 'node_modules']) {
    const stat = fs.lstatSync(path.join(app.directory, file), { throwIfNoEntry: false });
    if (stat && (file === '.npmrc' || stat.isSymbolicLink())) throw new Error('App-local npm configuration and linked node_modules are not supported.');
  }
  return { packages, lockHash: digest(lockText) };
}
function createFrontend({ approve, execute = executeCommand } = {}) {
  const active = new Set();
  async function build(workspace, id, { signal } = {}) {
    const { readApp, fingerprint } = require('./research-app-runtime.cjs');
    const records = require('./research-app-delivery-store.cjs');
    const app = readApp(workspace, id), key = `${app.workspace}\0${id}`;
    if (!app.frontend) return { built: false, skipped: true };
    if (active.has(key)) throw new Error('Frontend build is already in progress.');
    active.add(key);
    const stageName = `.frontend-build-${randomUUID()}`, stage = path.join(app.directory, stageName);
    let previous;
    try {
      signal?.throwIfAborted();
      const expected = fingerprint(app), plan = dependencyPlan(app);
      if (!await approve?.({ app, packages: plan.packages })) throw new Error('Frontend dependency setup and build were not approved.');
      signal?.throwIfAborted();
      if (fingerprint(readApp(workspace, id)) !== expected) throw new Error('App source changed during build approval.');
      const version = (await execute('node', ['-p', 'process.versions.node'], app.directory, signal)).trim();
      const [major, minor] = version.split('.').map(Number);
      if (!(major > 22 || (major === 22 && minor >= 12) || (major === 20 && minor >= 19))) throw new Error('Install Node.js 20.19+ or 22.12+ to build Research Apps.');
      const deps = records.readRecord(app, 'frontend-dependencies.json');
      if (deps?.lockHash !== plan.lockHash || deps?.node !== version || !fs.existsSync(path.join(app.directory, 'node_modules/vite/bin/vite.js'))) {
        await execute(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org'], app.directory, signal);
        if (fingerprint(readApp(workspace, id)) !== expected) throw new Error('App source changed during dependency setup.');
        records.writeRecord(app, 'frontend-dependencies.json', { lockHash: plan.lockHash, node: version });
      }
      await execute('node', ['node_modules/typescript/bin/tsc', '--noEmit', '--project', 'tsconfig.json'], app.directory, signal);
      await execute('node', ['node_modules/vite/bin/vite.js', 'build', '--outDir', stageName, '--emptyOutDir'], app.directory, signal);
      signal?.throwIfAborted();
      const hash = outputHash(artifacts(app, stage));
      if (fingerprint(readApp(workspace, id)) !== expected) throw new Error('App source changed during frontend build.');
      const output = path.join(app.directory, 'public');
      if (fs.lstatSync(output, { throwIfNoEntry: false })) { previous = path.join(app.directory, `.frontend-previous-${randomUUID()}`); fs.renameSync(output, previous); }
      try { fs.renameSync(stage, output); }
      catch (error) { if (previous) { fs.renameSync(previous, output); previous = null; } throw error; }
      const record = { fingerprint: expected, outputHash: hash, toolchain: { node: version, lockHash: plan.lockHash }, builtAt: new Date().toISOString() };
      records.writeRecord(app, 'frontend-build.json', record);
      return { built: true, ...record };
    } finally { active.delete(key); fs.rmSync(stage, { recursive: true, force: true }); if (previous) fs.rmSync(previous, { recursive: true, force: true }); }
  }
  return { build };
}
function executeCommand(command, args, cwd, signal) {
  signal?.throwIfAborted();
  const env = {};
  for (const name of ['PATH', 'HOME', 'USERPROFILE', 'SystemRoot', 'WINDIR', 'PATHEXT', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL']) if (process.env[name]) env[name] = process.env[name];
  Object.assign(env, { NPM_CONFIG_USERCONFIG: process.platform === 'win32' ? 'NUL' : '/dev/null', NPM_CONFIG_IGNORE_SCRIPTS: 'true', NPM_CONFIG_AUDIT: 'false', NPM_CONFIG_FUND: 'false' });
  return new Promise((resolve, reject) => {
    // Only the fixed npm.cmd invocation uses a shell on Windows. All arguments are host-owned constants.
    const child = spawn(command, args, { cwd, env, shell: process.platform === 'win32' && command === 'npm.cmd', windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', timedOut = false;
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output = (output + String(chunk)).slice(-8000); });
    const terminate = () => {
      try {
        if (process.platform === 'win32') { const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); killer.once('error', () => child.kill()); }
        else process.kill(-child.pid, 'SIGKILL');
      } catch { child.kill(); }
    };
    const timer = setTimeout(() => { timedOut = true; terminate(); }, 10 * 60_000);
    signal?.addEventListener('abort', terminate, { once: true }); if (signal?.aborted) terminate();
    const finish = error => { clearTimeout(timer); signal?.removeEventListener('abort', terminate); error ? reject(error) : resolve(output); };
    child.once('error', error => finish(new Error(`Frontend tool unavailable: ${error.message}`)));
    child.once('close', code => finish(signal?.aborted ? new Error('Frontend build cancelled.') : timedOut ? new Error('Frontend build timed out.') : code ? new Error(`Frontend ${args[0]} failed (${code}):\n${output}`) : null));
  });
}
module.exports = { executeCommand, artifacts, outputHash, buildStatus, dependencyPlan, createFrontend };
