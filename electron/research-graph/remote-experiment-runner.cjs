const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const store = require('../store.cjs');
const servers = require('../ssh-servers.cjs');
const { remotePath } = require('../agent/ssh-workspace.cjs');
const { runDirectory } = require('./experiment-runner.cjs');

const source = fs.readFileSync(path.join(__dirname, 'remote-job.py'), 'utf8');
const quote = value => `'${String(value).replace(/'/g, "'\\''")}'`;
const terminal = new Set(['succeeded', 'failed', 'cancelled']);

function endpoint(server) {
  return { id: server.id, host: server.host, user: server.user, port: Number(server.port || 22) };
}

function savedServer(remote) {
  const server = servers.listServers().find(item => item.id === remote?.id);
  if (!server || JSON.stringify(endpoint(server)) !== JSON.stringify(endpoint(remote))) {
    throw new Error('The saved SSH server was removed or its address changed; remote status is unknown.');
  }
  return server;
}

function transport(server, request, { spawnImpl = spawn } = {}) {
  const { target, password, env } = servers.authFor(server);
  const command = `python3 -c ${quote(source)} ${quote(JSON.stringify(request))} ${quote(source)}`;
  const args = servers.connectionArgs(target, command, { allowPassword: Boolean(password) });
  return new Promise((resolve, reject) => {
    let child, output = '', errors = '', settled = false;
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(value); };
    try { child = spawnImpl('ssh', args, { env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (error) { reject(error); return; }
    const timer = setTimeout(() => { child.kill('SIGTERM'); finish(new Error('SSH connection timed out; remote job state is unknown.')); }, 20000);
    child.stdout.on('data', chunk => { output = (output + chunk.toString()).slice(-200000); });
    child.stderr.on('data', chunk => { errors = (errors + chunk.toString()).slice(-2000); });
    child.once('error', error => finish(error));
    child.once('close', code => {
      if (code !== 0) return finish(new Error(`Remote request failed; job state is unknown. ${errors.trim()}`));
      try { finish(null, JSON.parse(output)); } catch { finish(new Error('Invalid remote job response; state is unknown.')); }
    });
  });
}

async function start({ projectId, threadId, nodeId, command, cwd, workspace, server, request = transport }) {
  const text = String(command || '').trim();
  const directory = String(cwd || server?.workspace || '').trim();
  if (!text || text.length > 4000 || text.includes('\0')) throw new Error('Invalid experiment command.');
  if (!directory || directory.length > 2000 || /[\0\r\n]/.test(directory)) throw new Error('Invalid remote directory.');
  remotePath(directory);
  const remote = endpoint(savedServer(endpoint(server)));
  const existing = store.listExperimentRuns({ nodeId });
  if (existing.some(run => !terminal.has(run.status))) throw new Error('This experiment already has a run in progress.');
  if (existing.some(run => run.status === 'succeeded' && run.command !== text)) throw new Error('The run command is fixed after a successful run. Create a next round to change it.');
  const runId = randomUUID();
  const logDirectory = runDirectory(path.resolve(workspace), runId);
  fs.mkdirSync(logDirectory, { recursive: true });
  const logPath = path.join(logDirectory, 'run.log');
  fs.writeFileSync(logPath, '', { flag: 'wx' });
  const run = store.createExperimentRun({ id: runId, projectId, threadId, nodeId, command: text, cwd: directory, backend: 'ssh', logPath, remote });
  try {
    await request(savedServer(remote), { op: 'launch', runId, command: text, cwd: directory });
    return { run, launchConfirmed: true };
  } catch (error) {
    // A lost reply does not prove launch failed. Never resend it automatically.
    return { run, launchConfirmed: false, warning: `Launch could not be confirmed: ${error.message}. Check the run before retrying.` };
  }
}

async function refresh(runId, { request = transport, maxBytes = 120000 } = {}) {
  const run = store.getExperimentRun(runId);
  if (!run || run.backend !== 'ssh') throw new Error('Remote experiment run not found.');
  if (!store.canAccessProject(run.project_id, 'editor')) throw new Error('You do not have permission to refresh this remote run.');
  const result = await request(savedServer(run.provenance?.remote), { op: 'inspect', runId, maxBytes });
  if (typeof result.log === 'string') {
    const bytes = Buffer.from(result.log, 'base64');
    if (bytes.length > 120000) throw new Error('Remote log exceeded the allowed size.');
    fs.writeFileSync(run.log_path, bytes);
  }
  const current = store.getExperimentRun(runId);
  if (['running', 'succeeded', 'failed', 'cancelled'].includes(result.status) && !terminal.has(current.status) && current.status !== result.status) {
    return { run: store.updateExperimentRun({ runId, status: result.status, exitCode: result.exitCode, error: result.error || '' }), connection: 'connected' };
  }
  return { run: current, connection: result.status === 'unknown' ? 'unknown' : 'connected', reason: result.reason || '' };
}

async function cancel(runId, { request = transport } = {}) {
  const run = store.getExperimentRun(runId);
  if (!run || run.backend !== 'ssh') throw new Error('Remote experiment run not found.');
  if (!store.canAccessProject(run.project_id, 'editor')) throw new Error('You do not have permission to stop this remote run.');
  if (terminal.has(run.status)) return run;
  await request(savedServer(run.provenance?.remote), { op: 'cancel', runId });
  return run; // The supervisor records cancellation only after the process exits.
}

module.exports = { start, refresh, cancel, transport, endpoint, savedServer };
