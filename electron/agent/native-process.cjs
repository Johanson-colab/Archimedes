const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { StringDecoder } = require('node:string_decoder');
const clients = new Set();
const LINE_LIMIT = 8 * 1024 * 1024;
function nativeExecutable(backend, binary = backend) {
  if (binary !== backend) {
    if (!path.isAbsolute(binary) || !fs.statSync(binary, { throwIfNoEntry: false })?.isFile()) throw new Error(`Choose an existing absolute ${backend} executable path.`);
    return binary;
  }
  const dirs = [...String(process.env.PATH || '').split(path.delimiter), '/opt/homebrew/bin', '/usr/local/bin', path.join(os.homedir(), '.local/bin'), path.join(os.homedir(), '.opencode/bin')];
  const file = dirs.filter(path.isAbsolute).map(dir => path.join(dir, process.platform === 'win32' ? `${backend}.exe` : backend)).find(file => fs.statSync(file, { throwIfNoEntry: false })?.isFile());
  if (!file) throw new Error(`${backend} CLI was not found. Install it and sign in through its native CLI.`);
  return file;
}
class NativeProcess extends EventEmitter {
  constructor({ backend, binary = backend, args = [], cwd, env = {}, sessionId, requestTimeout = 20_000, spawnImpl = spawn, platform = process.platform, treeKillImpl = spawn, treeKillTimeout = 2000 } = {}) {
    super(); Object.assign(this, { backend, binary, args, cwd, env, sessionId, requestTimeout, spawnImpl, platform, treeKillImpl, treeKillTimeout });
    this.buffer = ''; this.decoder = new StringDecoder('utf8'); this.closed = false; this.pending = new Map(); this.nextId = 0;
  }
  start() {
    if (this.closed || this.child) throw new Error('Native process cannot be restarted.');
    const binary = this.spawnImpl === spawn ? nativeExecutable(this.backend, this.binary) : this.binary;
    const env = { ...process.env, ...this.env }; delete env.CLAUDECODE; delete env.CLAUDE_CODE_ENTRYPOINT; delete env.CODEX_THREAD_ID;
    this.child = this.spawnImpl(binary, this.args, { cwd: this.cwd, env, stdio: ['pipe', 'pipe', 'pipe'], detached: this.platform !== 'win32', windowsHide: true });
    clients.add(this);
    this.child.stdout.on('data', data => this.read(Buffer.isBuffer(data) ? this.decoder.write(data) : data));
    this.child.stderr?.on('data', () => {}); // Native stderr/configuration may contain credentials.
    this.child.stdin.on('error', () => this.fail(new Error(`${this.backend} input connection closed. No request was replayed.`)));
    this.child.on('error', () => this.fail(new Error(`${this.backend} could not start. Check its native installation.`)));
    // exit can precede buffered stdout delivery. close follows stdio drain, so
    // the final result/acknowledgement can settle before connection teardown.
    this.child.on('close', () => this.fail(new Error(`${this.backend} exited before completion. No request was replayed.`)));
    return this;
  }
  read(chunk) {
    if (this.closed) return;
    this.buffer += chunk;
    let index;
    while ((index = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, index); this.buffer = this.buffer.slice(index + 1);
      if (Buffer.byteLength(line) > LINE_LIMIT) return this.fail(new Error(`${this.backend} sent an oversized protocol message.`));
      if (!line.trim()) continue;
      let message;
      try { message = JSON.parse(line); } catch { return this.fail(new Error(`${this.backend} sent invalid JSON.`)); }
      if (!message || typeof message !== 'object' || Array.isArray(message)) return this.fail(new Error(`${this.backend} sent an invalid protocol object.`));
      let id, result, error;
      if (message.type === 'control_response') { id = message.response?.request_id; result = message.response?.response; error = message.response?.subtype === 'error'; }
      else if (Object.hasOwn(message, 'id') && !message.method) { id = message.id; result = message.result; error = Boolean(message.error); }
      if (id !== undefined && this.pending.has(id)) {
        const pending = this.pending.get(id); this.pending.delete(id); clearTimeout(pending.timer);
        if (error) {
          // Use recognized error codes, never raw provider errors/configuration.
          const hint = this.backend === 'opencode' && message.error?.code === -32000
            ? 'Provider authentication required. Sign in through OpenCode, then retry this turn explicitly.'
            : message.error?.data?.errorName === 'provider.free-limit'
            ? 'The OpenCode free usage limit has been reached. Choose another configured native model or connect a provider in OpenCode.'
            : 'Check native configuration and model access.';
          pending.reject(new Error(`${this.backend} rejected ${pending.method}. ${hint} No request was replayed.`));
        } else pending.resolve(result);
      } else {
        try { this.emit('message', message); } catch (error) { return this.fail(error); }
      }
      if (this.closed) return;
    }
    if (Buffer.byteLength(this.buffer) > LINE_LIMIT) this.fail(new Error(`${this.backend} sent an oversized protocol message.`));
  }
  send(message) {
    if (this.closed || !this.child?.stdin.writable) throw new Error(`${this.backend} connection is closed.`);
    const data = JSON.stringify(message);
    if (Buffer.byteLength(data) + 1 > LINE_LIMIT) throw new Error('Native outbound protocol size limit exceeded. No request was sent or replayed.');
    this.child.stdin.write(data + '\n');
  }
  request(method, params = {}, timeoutMs = this.requestTimeout) {
    const id = this.backend === 'claude' ? `archimedes_${++this.nextId}` : ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${this.backend} ${method} timed out. No request was replayed.`)); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, method });
      try { this.send(this.backend === 'claude' ? { type: 'control_request', request_id: id, request: { subtype: method, ...params } } : { jsonrpc: '2.0', id, method, params }); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  respond(id, result) { this.send(this.backend === 'claude' ? { type: 'control_response', response: { subtype: 'success', request_id: id, response: result } } : { jsonrpc: '2.0', id, result }); }
  unsupported(id) { this.send(this.backend === 'claude' ? { type: 'control_response', response: { subtype: 'error', request_id: id, error: 'This client cannot safely approve this native request.' } } : { jsonrpc: '2.0', id, error: { code: -32601, message: 'Unsupported native request; it was not approved.' } }); }
  fail(error) {
    if (this.closed) return; this.closed = true; clients.delete(this);
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(error); } this.pending.clear();
    try { this.emit('closed', error); } finally { this.terminate(); }
  }
  terminate() {
    const child = this.child; if (!child) return;
    if (this.platform === 'win32') return this.terminateWindowsTree(child);
    const kill = signal => { try { if (this.platform !== 'win32' && child.pid) process.kill(-child.pid, signal); else child.kill(signal); } catch { try { child.kill(signal); } catch {} } };
    kill('SIGTERM');
    // Kill the process group even if the leader exited: tools can outlive it.
    const timer = setTimeout(() => kill('SIGKILL'), 2000); timer.unref();
  }
  terminateWindowsTree(child) {
    let fallbackUsed = false;
    const fallback = () => {
      if (fallbackUsed) return; fallbackUsed = true;
      try { child.kill('SIGKILL'); } catch {} // Only the process we spawned.
    };
    // Never accept PIDs from protocol payloads or user configuration.
    const pid = child.pid;
    if (!Number.isSafeInteger(pid) || pid <= 0 || pid > 2147483647) return fallback();
    let helper;
    try {
      helper = this.treeKillImpl('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore' });
    } catch { return fallback(); }
    const timeout = Math.min(2000, Math.max(1, Number(this.treeKillTimeout) || 2000));
    const timer = setTimeout(() => {
      try { helper.kill('SIGKILL'); } catch {}
      fallback();
    }, timeout);
    timer.unref();
    helper.once('error', () => { clearTimeout(timer); fallback(); });
    helper.once('close', code => { clearTimeout(timer); if (code !== 0) fallback(); });
  }
  close() { this.fail(new Error(`${this.backend} connection closed.`)); }
}
function closeAllExternalClients() { for (const client of [...clients]) client.close(); }
module.exports = { NativeProcess, nativeExecutable, closeAllExternalClients, LINE_LIMIT };
