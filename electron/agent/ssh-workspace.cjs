// A single, explicitly approved SSH operation for a local Codex session.
// This is separate from the Reproduce runner and never creates a research Run.
const { spawn } = require('node:child_process');
const { authFor, connectionArgs } = require('../ssh-servers.cjs');
const MAX_OUTPUT = 32 * 1024;
const MAX_COMMAND = 8000;
const quote = value => `'${String(value).replace(/'/g, "'\\''")}'`;
function remotePath(value) {
  if (value === '~') return '"$HOME"';
  if (value.startsWith('~/')) return `"$HOME"/${quote(value.slice(2))}`;
  if (!value.startsWith('/')) throw new Error('Remote working directory must be absolute or start with ~/.');
  return quote(value);
}
async function runSshWorkspace({ server, command, cwd, approve, signal, spawnImpl = spawn }) {
  if (!server?.id || typeof approve !== 'function') throw new Error('Select a saved SSH server and an approval surface.');
  if (typeof command !== 'string' || !command.trim() || command.length > MAX_COMMAND || command.includes('\0')) throw new Error('Enter a valid remote command.');
  const { target, password, env } = authFor(server);
  const directory = String(cwd || target.workspace || '').trim();
  if (directory.length > 2000 || /[\0\r\n]/.test(directory)) throw new Error('Invalid remote working directory.');
  const dir = remotePath(directory);
  if (signal?.aborted) throw new Error('Remote operation cancelled before approval.');
  const accepted = await approve({ command: `SSH ${target.user}@${target.host}:${target.port}\nDirectory: ${directory}\n${command}`, cwd: directory, reason: 'This command runs on the selected remote server.', signal });
  if (!accepted || signal?.aborted) throw new Error('Remote command was not approved.');
  const remoteCommand = `cd -- ${dir} || exit 1; exec bash -lc ${quote(command)}`;
  const args = connectionArgs(target, remoteCommand, { allowPassword: Boolean(password) });
  return new Promise((resolve, reject) => {
    let child, done = false, output = '', truncated = false;
    const append = chunk => { output += chunk.toString('utf8'); if (Buffer.byteLength(output, 'utf8') > MAX_OUTPUT) { output = Buffer.from(output).subarray(-MAX_OUTPUT).toString('utf8'); truncated = true; } };
    const finish = (error, code) => { if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); if (error) reject(error); else resolve({ exitCode: code, output, truncated, location: `${target.user}@${target.host}:${target.port}`, cwd: directory }); };
    const abort = () => { child?.kill('SIGTERM'); finish(new Error('SSH connection stopped. Remote process termination is not confirmed; check the server before retrying.')); };
    try { child = spawnImpl('ssh', args, { windowsHide: true, env: { ...process.env, ...env } }); }
    catch (error) { reject(error); return; }
    const timer = setTimeout(() => { child.kill('SIGTERM'); finish(new Error('SSH operation timed out. Remote process termination is not confirmed; check the server before retrying.')); }, 60_000);
    child.stdout.on('data', append); child.stderr.on('data', append);
    child.once('error', error => finish(new Error(`Could not start SSH: ${error.message}`)));
    child.once('close', code => finish(null, code));
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}
module.exports = { runSshWorkspace, remotePath };
