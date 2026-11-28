const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { readApp, fingerprint } = require('./research-app-runtime.cjs');

// Only pinned registry packages are accepted. Options, URLs, local paths and
// nested requirements would conceal additional code or package sources.
function requirements(app) {
  if (app.runtime.kind !== 'python-http') throw new Error('Only Python Apps need Python setup.');
  const file = path.join(app.directory, 'requirements.txt');
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.isSymbolicLink() || stat.size > 16000) throw new Error('Add a regular requirements.txt with pinned packages first.');
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
  if (lines.length > 100 || lines.some(line => !/^[A-Za-z0-9][A-Za-z0-9._-]*(?:\[[A-Za-z0-9_,.-]+\])?==[A-Za-z0-9][A-Za-z0-9._+!-]*$/.test(line))) throw new Error('Use only pinned registry packages such as rdkit==2026.3.6 in requirements.txt.');
  return lines;
}
function createSetup({ approve, execute = runCommand }) {
  const active = new Set();
  async function setup(workspace, id, { signal } = {}) {
    signal?.throwIfAborted();
    const app = readApp(workspace, id), key = `${app.workspace}\0${id}`;
    if (active.has(key)) throw new Error('Dependency setup is already in progress.');
    active.add(key);
    try {
      const packages = requirements(app), signature = fingerprint(app);
      const envDir = path.join(app.directory, '.venv');
      if (fs.lstatSync(envDir, { throwIfNoEntry: false })) throw new Error('The App already has a .venv. Existing environments are never replaced.');
      if (!await approve({ app, packages })) throw new Error('Dependency setup was not approved.');
      signal?.throwIfAborted();
      if (fingerprint(readApp(workspace, id)) !== signature) throw new Error('App source changed during approval. Review it again.');
      // Exclusive mkdir ensures cleanup only removes a directory we created.
      fs.mkdirSync(envDir);
      try {
        const python = process.platform === 'win32' ? 'python' : 'python3';
        await execute(python, ['-m', 'venv', envDir], app.directory, signal);
        const interpreter = path.join(envDir, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
        if (packages.length) await execute(interpreter, ['-m', 'pip', 'install', '--disable-pip-version-check', '--no-input', ...packages], app.directory, signal);
        return { installed: true, packages };
      } catch (error) {
        throw new Error(`${error.message} The incomplete .venv was preserved; review and remove it before retrying.`);
      }
    } finally { active.delete(key); }
  }
  return { setup };
}
function runCommand(command, args, cwd, signal) {
  signal?.throwIfAborted();
  const env = {};
  for (const key of ['PATH', 'HOME', 'USERPROFILE', 'SystemRoot', 'WINDIR', 'PATHEXT', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL']) if (process.env[key]) env[key] = process.env[key];
  env.PIP_CONFIG_FILE = process.platform === 'win32' ? 'NUL' : '/dev/null';
  env.PIP_INDEX_URL = 'https://pypi.org/simple';
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, shell: false, detached: process.platform !== 'win32', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', timedOut = false;
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output = (output + String(chunk)).slice(-4000); });
    const terminate = () => {
      try {
        if (process.platform === 'win32') {
          const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
          killer.once('error', () => { try { child.kill(); } catch { /* already exited */ } }); killer.unref();
        }
        else process.kill(-child.pid, 'SIGKILL');
      } catch { child.kill(); }
    };
    const timer = setTimeout(() => { timedOut = true; terminate(); }, 10 * 60_000);
    signal?.addEventListener('abort', terminate, { once: true });
    if (signal?.aborted) terminate();
    child.once('error', error => { clearTimeout(timer); signal?.removeEventListener('abort', terminate); reject(new Error(`Could not start dependency setup: ${error.message}`)); });
    child.once('close', code => { clearTimeout(timer); signal?.removeEventListener('abort', terminate); if (code === 0 && !timedOut && !signal?.aborted) resolve(); else reject(new Error(signal?.aborted ? 'Dependency setup cancelled.' : timedOut ? 'Dependency setup timed out.' : `Dependency setup failed (${code}): ${output}`)); });
  });
}
module.exports = { requirements, createSetup };
