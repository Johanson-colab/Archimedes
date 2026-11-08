const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { StringDecoder } = require('node:string_decoder');

const OUTPUT_LIMIT = 32_000;
const LOG_LIMIT = 10 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10 * 60_000;
const MAX_TIMEOUT_MS = 60 * 60_000;

function createLog(root) {
  const workspace = fs.realpathSync(root);
  let dir = workspace;
  for (const part of ['.archimedes', 'agent-command-logs']) {
    dir = path.join(dir, part);
    const stat = fs.lstatSync(dir, { throwIfNoEntry: false });
    if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw new Error(`Command log directory is not a real directory: ${dir}`);
    if (!stat) fs.mkdirSync(dir);
  }
  const file = path.join(dir, `${randomUUID()}.log`);
  return { relative: path.relative(workspace, file).split(path.sep).join('/'), fd: fs.openSync(file, 'wx', 0o600) };
}

function runApprovedCommand({ root, cwd, command, timeoutSeconds, signal, onUpdate = () => {} }) {
  if (signal?.aborted) return Promise.reject(Object.assign(new Error('Command was interrupted before starting.'), { name: 'AbortError' }));
  const requested = Number(timeoutSeconds);
  const timeoutMs = Number.isFinite(requested) && requested > 0 ? Math.min(Math.round(requested * 1000), MAX_TIMEOUT_MS) : DEFAULT_TIMEOUT_MS;
  const log = createLog(root);
  const started = Date.now();
  const shell = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : fs.existsSync('/bin/zsh') ? '/bin/zsh' : '/bin/sh';
  const args = process.platform === 'win32' ? ['/d', '/s', '/c', command] : ['-lc', command];
  let child;
  try { child = spawn(shell, args, { cwd, env: process.env, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (error) { fs.closeSync(log.fd); throw error; }
  return new Promise((resolve, reject) => {
    let tail = '', bytes = 0, logBytes = 0, logTruncated = false, timedOut = false, aborted = false, settled = false, spawnError, ioError;
    let killTimer, updateTimer;
    const decoderOut = new StringDecoder('utf8'), decoderErr = new StringDecoder('utf8');
    function stop() {
      if (!child.pid) return;
      if (process.platform === 'win32') {
        try { const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); killer.on('error', () => { try { child.kill(); } catch {} }); killer.unref(); } catch { try { child.kill(); } catch {} }
      } else {
        try { process.kill(-child.pid, 'SIGTERM'); } catch { try { child.kill('SIGTERM'); } catch {} }
        killTimer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 2000);
        killTimer.unref();
      }
    }
    function failIO(error) { if (!ioError) { ioError = error; stop(); } }
    function flushUpdate() { clearTimeout(updateTimer); updateTimer = null; try { onUpdate(tail.slice(-1000)); } catch (error) { failIO(error); } }
    function accept(chunk, decoder) {
      try {
        const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += data.length;
        const room = Math.max(0, LOG_LIMIT - logBytes);
        if (room) {
          const part = data.subarray(0, room);
          let offset = 0;
          while (offset < part.length) {
            const written = fs.writeSync(log.fd, part, offset, part.length - offset);
            if (!written) throw new Error('Could not persist command output.');
            offset += written; logBytes += written;
          }
        }
        if (data.length > room) logTruncated = true;
        tail = (tail + decoder.write(data)).slice(-OUTPUT_LIMIT);
        if (!updateTimer) { updateTimer = setTimeout(flushUpdate, 250); updateTimer.unref(); }
      } catch (error) { failIO(error); }
    }
    child.stdout.on('data', data => accept(data, decoderOut));
    child.stderr.on('data', data => accept(data, decoderErr));
    child.once('error', error => { spawnError = error; });
    const timeout = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
    timeout.unref();
    const onAbort = () => { aborted = true; stop(); };
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
    child.once('close', (code, processSignal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout); if (!aborted && !timedOut && !ioError) clearTimeout(killTimer); clearTimeout(updateTimer);
      signal?.removeEventListener('abort', onAbort);
      tail = (tail + decoderOut.end() + decoderErr.end()).slice(-OUTPUT_LIMIT);
      try { fs.closeSync(log.fd); } catch (error) { ioError ||= error; }
      const result = { approved: true, status: aborted ? 'interrupted' : timedOut ? 'timed_out' : spawnError ? 'failed_to_start' : ioError ? 'failed' : code === 0 ? 'completed' : 'failed', exit_code: code, signal: processSignal || null, duration_ms: Date.now() - started, output: tail, output_truncated: bytes > Buffer.byteLength(tail), log_path: log.relative, log_truncated: logTruncated, ...(spawnError || ioError ? { error: (spawnError || ioError).message } : {}) };
      if (aborted) reject(Object.assign(new Error('Command interrupted.'), { name: 'AbortError', commandResult: result }));
      else resolve(result);
    });
  });
}

module.exports = { runApprovedCommand, OUTPUT_LIMIT, LOG_LIMIT, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS };
