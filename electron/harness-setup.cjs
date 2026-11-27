// Native CLI onboarding: fixed official sources, verified downloads, no shell installers.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const managed = require('./agent/managed-clis.cjs');
const { nativeExecutable } = require('./agent/native-process.cjs');
const exec = promisify(execFile);
const active = new Map();
const states = new Map();
const docs = { codex: 'https://developers.openai.com/codex/cli/', claude: 'https://code.claude.com/docs/en/setup', opencode: 'https://opencode.ai/docs/', antigravity: 'https://antigravity.google/docs/getting-started?tab=cli' };
const allowedHosts = new Set(['api.github.com', 'github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com', 'downloads.claude.ai', 'storage.googleapis.com', 'antigravity-cli-auto-updater-974169037036.us-central1.run.app', 'opencode.ai', 'registry.npmjs.org']);
function backendId(value) { if (!Object.hasOwn(managed.names, value)) throw new Error('Unknown native harness.'); return value; }
function safeUrl(value) { const url = new URL(value); if (url.protocol !== 'https:' || url.port || !allowedHosts.has(url.hostname) || url.username || url.password) throw new Error('Unsupported CLI download source.'); return url.href; }
async function response(url, signal, fetchImpl = fetch, redirects = 0) {
  const result = await fetchImpl(safeUrl(url), { redirect: 'manual', signal, headers: { 'User-Agent': 'Archimedes', Accept: 'application/json' } });
  if ([301,302,303,307,308].includes(result.status)) {
    await result.body?.cancel();
    if (redirects >= 5) throw new Error('Too many CLI download redirects.');
    return response(new URL(result.headers.get('location'), url).href, signal, fetchImpl, redirects + 1);
  }
  if (!result.ok) throw new Error(`CLI download failed (${result.status}).`);
  return result;
}
async function metadataText(url, signal, fetchImpl) {
  const result = await response(url, signal, fetchImpl);
  let data = '';
  for await (const chunk of Readable.fromWeb(result.body)) { data += chunk.toString(); if (Buffer.byteLength(data) > 4 * 1024 * 1024) throw new Error('CLI manifest is too large.'); }
  return data;
}
async function metadata(url, signal, fetchImpl) { return JSON.parse(await metadataText(url, signal, fetchImpl)); }
function platformKey(platform, arch) {
  if (!['darwin','linux','win32'].includes(platform) || !['x64','arm64'].includes(arch)) throw new Error('Automatic CLI installation is unavailable on this platform.');
  return `${platform === 'win32' ? 'windows' : platform}-${arch}`;
}
async function releasePlan(backend, platform, arch, signal, fetchImpl) {
  backendId(backend);
  platformKey(platform, arch);
  if (backend === 'codex') {
    const target = `${arch === 'arm64' ? 'aarch64' : 'x86_64'}-${platform === 'darwin' ? 'apple-darwin' : platform === 'win32' ? 'pc-windows-msvc' : 'unknown-linux-musl'}`;
    const release = await metadata('https://api.github.com/repos/openai/codex/releases/latest', signal, fetchImpl);
    const name = `codex-${target}${platform === 'win32' ? '.exe' : '.tar.gz'}`;
    const asset = release.assets?.find(asset => asset.name === name);
    if (!asset || !/^sha256:[a-f0-9]{64}$/.test(asset.digest || '')) throw new Error('The official CLI release has no verifiable download for this platform.');
    return { url: asset.browser_download_url, algorithm: 'sha256', checksum: asset.digest.slice(7), archive: platform !== 'win32', member: `codex-${target}`, version: release.tag_name };
  }
  if (backend === 'claude') {
    const base = 'https://downloads.claude.ai/claude-code-releases';
    const version = (await metadataText(`${base}/latest`, signal, fetchImpl)).trim();
    if (!/^\d+\.\d+\.\d+(?:[-.][\w.-]+)?$/.test(version)) throw new Error('Invalid Claude Code release version.');
    const target = `${platform === 'win32' ? 'win32' : platform}-${arch}`;
    const manifest = await metadata(`${base}/${version}/manifest.json`, signal, fetchImpl);
    const checksum = manifest.platforms?.[target]?.checksum;
    if (!/^[a-f0-9]{64}$/.test(checksum || '')) throw new Error('The official CLI release has no verifiable download for this platform.');
    return { url: `${base}/${version}/${target}/claude${platform === 'win32' ? '.exe' : ''}`, algorithm: 'sha256', checksum, archive: false, version };
  }
  if (backend === 'opencode') {
    const latest = await metadata('https://opencode.ai/update/api/latest/cli/npm', signal, fetchImpl);
    if (latest.metadata?.package !== '@opencode/cli' || !/^\d+\.\d+\.\d+$/.test(latest.version || '')) throw new Error('Invalid OpenCode release manifest.');
    // Baseline x64 binaries support CPUs without AVX2.
    const target = `${platform === 'win32' ? 'windows' : platform}-${arch}${arch === 'x64' ? '-baseline' : ''}`;
    const pkg = await metadata(`https://registry.npmjs.org/@opencode%2fcli-${target}/${latest.version}`, signal, fetchImpl);
    const integrity = pkg.dist?.integrity;
    if (!/^sha512-[A-Za-z0-9+/]+=*$/.test(integrity || '')) throw new Error('OpenCode did not publish a verified native package.');
    return { url: pkg.dist.tarball, algorithm: 'sha512', checksum: Buffer.from(integrity.slice(7), 'base64').toString('hex'), archive: true, member: `package/bin/opencode${platform === 'win32' ? '.exe' : ''}`, version: latest.version };
  }
  const target = `${platform === 'win32' ? 'windows' : platform}_${arch === 'x64' ? 'amd64' : 'arm64'}`;
  const manifest = await metadata(`https://antigravity-cli-auto-updater-974169037036.us-central1.run.app/manifests/${target}.json`, signal, fetchImpl);
  if (!/^[a-f0-9]{128}$/.test(manifest.sha512 || '')) throw new Error('Invalid Antigravity release checksum.');
  return { url: manifest.url, algorithm: 'sha512', checksum: manifest.sha512, archive: /\.tar\.gz(?:\?|$)/.test(manifest.url), member: 'antigravity', version: manifest.version };
}
async function download(plan, file, signal, fetchImpl) {
  const result = await response(plan.url, signal, fetchImpl);
  const hash = createHash(plan.algorithm); let bytes = 0;
  await pipeline(Readable.fromWeb(result.body), new Transform({ transform(chunk, _enc, next) {
    bytes += chunk.length; if (bytes > 1024 * 1024 * 1024) return next(new Error('CLI download exceeds the size limit.'));
    hash.update(chunk); next(null, chunk);
  }}), fs.createWriteStream(file, { flags: 'wx', mode: 0o600 }), { signal });
  if (hash.digest('hex') !== plan.checksum) throw new Error('CLI checksum verification failed.');
}
async function detect(input) {
  const backend = backendId(input?.backend); const name = managed.names[backend];
  let binary;
  try { binary = nativeExecutable(backend, input.binary || name); }
  catch { return { installed: false, backend, docsUrl: docs[backend], phase: states.get(backend)?.phase || 'missing' }; }
  try {
    const { stdout } = await exec(binary, ['--version'], { timeout: 10000, maxBuffer: 8192, windowsHide: true });
    return { installed: true, backend, binary, version: stdout.trim().slice(0,150), docsUrl: docs[backend], phase: 'installed' };
  } catch { return { installed: false, backend, docsUrl: docs[backend], phase: 'unavailable' }; }
}
async function install(backend, owner, { platform = process.platform, arch = process.arch, fetchImpl = fetch, detectImpl = detect, execute = exec } = {}) {
  backendId(backend);
  if (active.has(backend)) throw new Error('This CLI is already being installed.');
  const control = new AbortController(); active.set(backend, { owner, control });
  const phase = value => states.set(backend, { phase: value });
  let folder;
  const deadline = setTimeout(() => control.abort(), 10 * 60 * 1000); deadline.unref?.();
  try {
    phase('detecting');
    const existing = await detectImpl({ backend }); control.signal.throwIfAborted();
    if (existing.installed) { phase('installed'); return existing; }
    const target = managed.binaryPath(backend, platform); if (!target) throw new Error('CLI installation storage is not initialized.');
    if (fs.existsSync(target)) throw new Error('An existing managed CLI needs repair. Choose another executable or remove the damaged installation first.');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    folder = fs.realpathSync(fs.mkdtempSync(path.join(path.dirname(target), '.install-')));
    phase('resolving');
    const plan = await releasePlan(backend, platform, arch, control.signal, fetchImpl);
    phase('downloading'); const payload = path.join(folder, 'download'); await download(plan, payload, control.signal, fetchImpl);
    phase('verifying');
    let source = payload;
    if (plan.archive) {
      const listing = await execute('tar', ['-tf', payload], { signal: control.signal, timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true });
      const entries = listing.stdout.split(/\r?\n/).filter(Boolean);
      if (!entries.includes(plan.member) || entries.some(entry => path.posix.isAbsolute(entry) || entry.includes('\\') || entry.split('/').includes('..'))) throw new Error('Unsafe CLI archive.');
      const types = await execute('tar', ['-tvf', payload, plan.member], { signal: control.signal, timeout: 30000, maxBuffer: 8192, windowsHide: true });
      if (!types.stdout.startsWith('-') || types.stdout.trim().split(/\r?\n/).length !== 1) throw new Error('Invalid CLI executable in archive.');
      // Extract only the expected executable, never scripts or arbitrary archive paths.
      await execute('tar', ['-xf', payload, '-C', folder, plan.member], { signal: control.signal, timeout: 30000, maxBuffer: 8192, windowsHide: true });
      source = path.join(folder, ...plan.member.split('/'));
      if (!fs.lstatSync(source).isFile() || fs.realpathSync(source) !== source) throw new Error('Invalid CLI executable in archive.');
    }
    control.signal.throwIfAborted();
    fs.chmodSync(source, 0o755);
    await execute(source, ['--version'], { signal: control.signal, timeout: 15000, maxBuffer: 8192, windowsHide: true });
    control.signal.throwIfAborted();
    // Publish only after checksum and launch checks. Never replace an existing file.
    fs.linkSync(source, target);
    phase('installed');
    return { installed: true, backend, binary: target, version: String(plan.version), phase: 'installed', docsUrl: docs[backend] };
  } catch (error) {
    phase(control.signal.aborted ? 'cancelled' : 'failed');
    throw new Error(control.signal.aborted ? 'CLI installation cancelled or timed out.' : error.cmd ? 'The downloaded CLI could not start. Check OS compatibility and try again.' : error.message);
  } finally { clearTimeout(deadline); if (folder) fs.rmSync(folder, { recursive: true, force: true }); active.delete(backend); }
}
function status(backend) { backendId(backend); return states.get(backend) || { phase: 'idle' }; }
function cancel(backend, owner) { backendId(backend); const job = active.get(backend); if (job && job.owner === owner) job.control.abort(); }
function shutdown() { for (const job of active.values()) job.control.abort(); }
const shellQuote = value => `'${String(value).replaceAll("'", "'\\''")}'`;
function loginSpec(backend, binary, platform = process.platform) {
  backendId(backend);
  const args = { codex: ['login'], claude: ['auth','login'], opencode: ['auth','login'], antigravity: ['acp','--login'] }[backend];
  if (platform === 'win32') return `& '${binary.replaceAll("'", "''")}' ${args.map(arg => `'${arg}'`).join(' ')}; Write-Host 'Return to Archimedes and check the connection.'; Read-Host 'Press Enter to close'`;
  return `#!/bin/sh\n${shellQuote(binary)} ${args.map(shellQuote).join(' ')}\nprintf '\\nReturn to Archimedes and check the connection.\\nPress Enter to close.\\n'\nread answer\n`;
}
async function login(input, { platform = process.platform, spawnImpl = spawn, detectImpl = detect } = {}) {
  const backend = backendId(input?.backend);
  const found = await detectImpl(input); if (!found.installed) throw new Error('Install this CLI before signing in.');
  const folder = path.join(path.dirname(managed.binaryPath(backend)), 'login'); fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  let command, args;
  if (platform === 'win32') {
    // A fixed PowerShell command is encoded; executable paths remain literal data.
    const encoded = Buffer.from(loginSpec(backend, found.binary, platform), 'utf16le').toString('base64');
    command = 'powershell.exe';
    const launch = `Start-Process powershell.exe -ArgumentList '-NoProfile','-NoExit','-EncodedCommand','${encoded}'`;
    args = ['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(launch,'utf16le').toString('base64')];
  } else {
    // Only one fixed script per harness; repeated clicks never leave unbounded files.
    const file = path.join(folder, 'sign-in.command'); fs.writeFileSync(file, loginSpec(backend, found.binary, platform), { mode: 0o700 }); fs.chmodSync(file,0o700);
    command = platform === 'darwin' ? 'open' : 'x-terminal-emulator'; args = platform === 'darwin' ? ['-a','Terminal',file] : ['-e',file];
  }
  await new Promise((resolve,reject) => { const child = spawnImpl(command,args,{detached:true,stdio:'ignore',windowsHide:false}); child.once('error',()=>reject(new Error('Could not open the sign-in terminal. Open the CLI in your terminal to sign in.'))); if (platform === 'linux') child.once('spawn', resolve);
    else child.once('exit',code=>code===0?resolve():reject(new Error('Could not open the sign-in terminal. Open the CLI in your terminal to sign in.'))); child.unref(); });
  return { opened: true };
}
module.exports = { detect, install, status, cancel, shutdown, login, releasePlan, loginSpec, safeUrl, platformKey, download };
