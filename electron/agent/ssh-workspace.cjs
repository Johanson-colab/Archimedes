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
async function runSshWorkspace({ server, command, cwd, approve, signal, spawnImpl = spawn, displayCommand }) {
  if (!server?.id || typeof approve !== 'function') throw new Error('Select a saved SSH server and an approval surface.');
  if (typeof command !== 'string' || !command.trim() || command.length > MAX_COMMAND || command.includes('\0')) throw new Error('Enter a valid remote command.');
  const { target, password, env } = authFor(server);
  const directory = String(cwd || target.workspace || '').trim();
  if (directory.length > 2000 || /[\0\r\n]/.test(directory)) throw new Error('Invalid remote working directory.');
  const dir = remotePath(directory);
  if (signal?.aborted) throw new Error('Remote operation cancelled before approval.');
  const accepted = await approve({ command: `SSH ${target.user}@${target.host}:${target.port}\nDirectory: ${directory}\n${displayCommand || command}`, cwd: directory, reason: 'This operation runs on the selected remote server.', signal });
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

const FILE_TOOLS_VERSION = 2;
const FILE_TOOL_NAMES = new Set(['ssh_remote_read', 'ssh_remote_edit']);
const filePathSchema = { type: 'string', description: 'Remote file path, absolute or relative to the selected remote working directory.' };
const fileToolDefinitions = [
  { type: 'function', name: 'ssh_remote_read', description: 'Read a bounded range of lines from a UTF-8 text file on the selected SSH server. Requires approval. Use offset and limit to read more.', inputSchema: { type: 'object', properties: { path: filePathSchema, offset: { type: 'integer', minimum: 1 }, limit: { type: 'integer', minimum: 1, maximum: 200 } }, required: ['path'], additionalProperties: false } },
  { type: 'function', name: 'ssh_remote_edit', description: 'Replace one exact, unique text occurrence in an existing remote UTF-8 file. Requires approval showing the old and new text. Read first; this is not a native Codex local edit.', inputSchema: { type: 'object', properties: { path: filePathSchema, old_text: { type: 'string' }, new_text: { type: 'string' } }, required: ['path', 'old_text', 'new_text'], additionalProperties: false } },
];

function buildRemoteFileOperation(name, args) {
  if (!FILE_TOOL_NAMES.has(name) || !args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Invalid remote file operation.');
  const allowed = name === 'ssh_remote_read' ? ['path', 'offset', 'limit'] : ['path', 'old_text', 'new_text'];
  if (Object.keys(args).some(key => !allowed.includes(key))) throw new Error('Unexpected remote file argument.');
  if (typeof args.path !== 'string' || !args.path.trim() || args.path.length > 1000 || /[\0\r\n]/.test(args.path)) throw new Error('Invalid remote file path.');
  const payload = { path: args.path };
  let script, displayCommand;
  if (name === 'ssh_remote_read') {
    const offset = args.offset ?? 1, limit = args.limit ?? 100;
    if (!Number.isSafeInteger(offset) || offset < 1 || offset > 10000000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw new Error('Invalid remote read range.');
    Object.assign(payload, { offset, limit });
    displayCommand = `Read remote file ${args.path} (lines ${offset}–${offset + limit - 1}; maximum 24 KiB)`;
    script = `import json,sys,os\np=json.loads(sys.argv[1]); path=os.path.expanduser(p['path']); n=0\nwith open(path,'rb') as f:\n for i,line in enumerate(f,1):\n  if i < p['offset']: continue\n  if i >= p['offset']+p['limit']: break\n  n+=len(line)\n  if n>24576: print('\\n[Read limit reached; use a smaller range]'); break\n  print(str(i)+': '+line.decode('utf-8',errors='strict'),end='')`;
  } else {
    if (typeof args.old_text !== 'string' || !args.old_text || typeof args.new_text !== 'string' || Buffer.byteLength(args.old_text) + Buffer.byteLength(args.new_text) > 3000 || /\0/.test(args.old_text + args.new_text)) throw new Error('Remote edit requires nonempty old text and at most 3000 bytes of replacement text.');
    Object.assign(payload, { old_text: args.old_text, new_text: args.new_text });
    displayCommand = `Edit remote file ${args.path}\nReplace exactly:\n${args.old_text}\nWith:\n${args.new_text}`;
    script = `import json,sys,os,tempfile,stat\np=json.loads(sys.argv[1]); path=os.path.expanduser(p['path'])\nif os.path.islink(path): raise ValueError('Refusing to edit a symbolic link')\nwith open(path,'rb') as f: data=f.read(1048577)\nif len(data)>1048576: raise ValueError('File exceeds 1 MiB edit limit')\ns=data.decode('utf-8'); old=p['old_text']\nif s.count(old)!=1: raise ValueError('Expected exactly one occurrence of old text')\nmode=stat.S_IMODE(os.stat(path).st_mode); fd,tmp=tempfile.mkstemp(prefix='.archimedes-edit-',dir=os.path.dirname(os.path.abspath(path)))\ntry:\n with os.fdopen(fd,'wb') as f: f.write(s.replace(old,p['new_text'],1).encode('utf-8'))\n os.chmod(tmp,mode); os.replace(tmp,path)\nfinally:\n if os.path.exists(tmp): os.unlink(tmp)\nprint('Remote file updated')`;
  }
  return { command: `python3 -c ${quote(script)} ${quote(JSON.stringify(payload))}`, displayCommand };
}

async function runRemoteFileOperation({ name, args, ...options }) {
  const operation = buildRemoteFileOperation(name, args);
  return runSshWorkspace({ ...options, ...operation });
}
module.exports = { runSshWorkspace, runRemoteFileOperation, buildRemoteFileOperation, fileToolDefinitions, FILE_TOOLS_VERSION, FILE_TOOL_NAMES, remotePath };
