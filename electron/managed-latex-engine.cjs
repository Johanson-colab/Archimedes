const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const manifest = require('../shared/latex-engine.json');
const { extractExecutable } = require('./latex-engine-archive.cjs');
const inflight = new Map();
const digest = (data) => createHash('sha256').update(data).digest('hex');
function verified(file, sha256) {
  try { return fs.statSync(file).isFile() && digest(fs.readFileSync(file)) === sha256; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
async function readDownload(response, maxBytes = 64 * 1024 * 1024) {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('Compiler download exceeds its size limit.');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
async function ensureManagedEngine({ runtimeRoot, resourcesPath, platform = process.platform, arch = process.arch, fetchImpl = fetch, onProgress = () => {}, engineManifest = manifest }) {
  const target = `${platform}-${arch}`;
  const asset = engineManifest.platforms[target];
  if (!asset) throw new Error(`The managed LaTeX engine does not support ${target}.`);
  const name = platform === 'win32' ? 'tectonic.exe' : 'tectonic';
  const destination = path.join(runtimeRoot, 'engines', engineManifest.version, target, name);
  if (verified(destination, asset.executableSha256)) return destination;
  if (inflight.has(destination)) return inflight.get(destination);
  const install = (async () => {
    const bundled = resourcesPath && path.join(resourcesPath, 'latex-engine', asset.url.endsWith('.zip') ? 'engine.zip' : 'engine.tar.gz');
    let archive;
    if (bundled && fs.existsSync(bundled)) archive = fs.readFileSync(bundled);
    else {
      onProgress('Downloading compiler');
      archive = await downloadEngineArchive(asset, fetchImpl);
    }
    const binary = verifyEngineArchive(archive, asset);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const temporary = fs.mkdtempSync(path.join(path.dirname(destination), '.install-'));
    try {
      const staged = path.join(temporary, name);
      fs.writeFileSync(staged, binary, { mode: 0o755 });
      if (!verified(destination, asset.executableSha256)) {
        // Windows cannot rename over an existing corrupt cache entry.
        fs.rmSync(destination, { force: true });
        fs.renameSync(staged, destination);
      }
    } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
    return destination;
  })();
  inflight.set(destination, install);
  try { return await install; } finally { inflight.delete(destination); }
}
function verifyEngineArchive(archive, asset) {
  if (digest(archive) !== asset.sha256) throw new Error('LaTeX compiler archive checksum verification failed.');
  const binary = extractExecutable(archive, asset.member, asset.url.endsWith('.zip'));
  if (digest(binary) !== asset.executableSha256) throw new Error('LaTeX compiler executable checksum verification failed.');
  return binary;
}
async function downloadEngineArchive(asset, fetchImpl = fetch) {
  let archive;
  try { archive = await readDownload(await fetchImpl(asset.url, { signal: AbortSignal.timeout(120_000) })); }
  catch (error) { throw new Error(`Unable to prepare the LaTeX compiler: ${error.message}. Connect to the Internet and click Recompile.`, { cause: error }); }
  verifyEngineArchive(archive, asset);
  return archive;
}
async function compilerProxyEnvironment(bundle, resolveProxy, env = process.env) {
  if (!resolveProxy || ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy'].some((name) => env[name])) return {};
  const url = new URL(bundle);
  if (!['http:', 'https:'].includes(url.protocol) || ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return {};
  let timer, rules;
  try {
    rules = await Promise.race([
      resolveProxy(bundle),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("System proxy resolution timed out. Check the proxy app and retry.")), 30_000); }),
    ]);
  } finally { clearTimeout(timer); }
  const http = /(?:^|;)\s*(PROXY|HTTPS)\s+([^;\s]+)/i.exec(rules);
  if (http) {
    const proxy = `${http[1].toUpperCase() === 'HTTPS' ? 'https' : 'http'}://${http[2]}`;
    return { HTTPS_PROXY: proxy, https_proxy: proxy, HTTP_PROXY: proxy, http_proxy: proxy };
  }
  if (/SOCKS/i.test(rules)) throw new Error('The system proxy only offers SOCKS. Enable an HTTP proxy in your proxy app and retry LaTeX compilation.');
  return {};
}
function outputStage(text) {
  for (const line of text.split(/\r?\n/).reverse()) {
    if (/Running (?:TeX|BibTeX|xdvipdfmx)|Rerunning TeX/i.test(line)) return 'Compiling paper';
    if (/generating format/i.test(line)) return 'Initializing LaTeX';
    if (/download|fetch/i.test(line)) return 'Downloading fonts and packages';
  }
}
function createManagedCompiler(options) {
  let tail = Promise.resolve();
  const pending = new Map();
  return (workspace, sourcePath, onProgress = () => {}) => {
    const key = JSON.stringify([workspace, sourcePath]);
    if (pending.has(key)) {
      pending.get(key).listeners.add(onProgress);
      return pending.get(key).task;
    }
    const listeners = new Set([onProgress]);
    const progress = (stage, log) => { for (const listener of listeners) listener(stage, log); };
    const task = tail.then(async () => {
      pending.delete(key);
      progress('Preparing compiler');
      const executable = await ensureManagedEngine({ ...options, onProgress: progress });
      const cache = path.join(options.runtimeRoot, 'tex-cache');
      fs.mkdirSync(cache, { recursive: true });
      const bundle = options.bundle || manifest.bundleUrl;
      const proxyEnv = await compilerProxyEnvironment(bundle, options.resolveProxy);
      let stage = 'Compiling and preparing dependencies';
      progress(stage, `Managed Tectonic ${manifest.version}\n${Object.keys(proxyEnv).length ? 'Using system HTTP proxy.' : 'Using existing network/proxy configuration.'}\n`);
      const result = await require('./latex-workspace.cjs').compileLatexDocument(workspace, sourcePath, {
        executable, managed: true, bundle,
        timeoutMs: options.timeoutMs || 600_000, idleTimeoutMs: options.idleTimeoutMs || 120_000,
        onOutput: (log) => { stage = outputStage(log) || stage; progress(stage, log); },
        env: { ...proxyEnv, TECTONIC_CACHE_DIR: cache, XDG_CACHE_HOME: path.join(options.runtimeRoot, "xdg-cache") },
      });
      for (const diagnostic of result.diagnostics) {
        if (diagnostic.help?.includes("tlmgr")) diagnostic.help = "Archimedes manages TeX dependencies automatically. Connect to the Internet and retry. If the problem persists, include the full build log when reporting it.";
      }
      if (!result.ok && /(?:this bundle isn.t cached|couldn.t get it from the internet|error sending request|failed to (?:download|fetch)|could not resolve host|network is unreachable)/i.test(result.log)) {
        result.diagnostics.unshift({ line: null, message: 'Unable to download LaTeX dependencies.', help: 'The first build needs Internet access to download fonts and packages. Check the connection and click Recompile. Previously downloaded dependencies are cached locally.' });
      }
      return { ...result, managed: true };
    });
    pending.set(key, { task, listeners });
    tail = task.catch(() => {});
    return task;
  };
}
module.exports = { ensureManagedEngine, createManagedCompiler, readDownload, downloadEngineArchive, verifyEngineArchive, compilerProxyEnvironment, outputStage };
