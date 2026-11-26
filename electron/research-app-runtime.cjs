const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { createHash, randomBytes } = require("node:crypto");

const MANIFEST = "research-app.json";
const CATEGORIES = new Set(require("../shared/research-apps.json").categories.map((item) => item.id));
const SKIP = new Set([".git", ".venv", "node_modules", "__pycache__", ".DS_Store"]);
const hash = (value) => createHash("sha256").update(value).digest("hex");
function appId(value) {
  if (typeof value !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) || value.length > 80) throw new Error("Invalid Research App ID.");
  return value;
}
function localFile(root, relative) {
  if (typeof relative !== "string" || path.isAbsolute(relative) || relative.split(/[\\/]/).some((part) => !part || part === "." || part === ".." || part.startsWith("."))) throw new Error("App paths must be relative, non-hidden files.");
  let target = root;
  for (const part of relative.split(/[\\/]/)) {
    target = path.join(target, part);
    if (fs.lstatSync(target).isSymbolicLink()) throw new Error("Linked App files are not supported.");
  }
  if (!fs.statSync(target).isFile()) throw new Error("App file not found.");
  return target;
}
function realDirectory(root, name, create = false) {
  const target = path.join(root, name);
  const stat = fs.lstatSync(target, { throwIfNoEntry: false });
  if (!stat && create) fs.mkdirSync(target);
  else if (!stat?.isDirectory() || stat.isSymbolicLink()) throw new Error("Research Apps require real workspace directories.");
  return target;
}
function readApp(workspace, id) {
  const root = fs.realpathSync(workspace);
  const directory = realDirectory(realDirectory(root, "research-apps"), appId(id));
  const manifestFile = localFile(directory, MANIFEST);
  if (fs.statSync(manifestFile).size > 16000) throw new Error("Research App manifest is too large.");
  const source = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  if (Object.keys(source).some((field) => !["schemaVersion", "id", "name", "description", "version", "category", "runtime", "environment", "agents", "skills"].includes(field)) || !source.runtime || Object.keys(source.runtime).some((field) => !["kind", "entry"].includes(field))) throw new Error("Unsupported Research App manifest field.");
  if (source.schemaVersion !== 1 || source.id !== id || !CATEGORIES.has(source.category)) throw new Error("Invalid Research App manifest or category.");
  if (typeof source.name !== "string" || !source.name.trim() || source.name.length > 80) throw new Error("Research App needs a name.");
  if (source.description !== undefined && (typeof source.description !== "string" || source.description.length > 500)) throw new Error("Research App description must be bounded text.");
  if (source.version !== undefined && (typeof source.version !== "string" || source.version.length > 40)) throw new Error("Research App version must be bounded text.");
  if (!["static", "python-http"].includes(source.runtime?.kind)) throw new Error("Use a static or python-http App runtime.");
  const entry = source.runtime.entry;
  if (source.runtime.kind === "static" && !entry?.startsWith("public/")) throw new Error("Static App entry must be inside public/.");
  localFile(directory, entry);
  if (!(source.runtime.kind === "static" ? entry.endsWith(".html") : entry.endsWith(".py"))) throw new Error("App entry must be HTML or Python for the selected runtime.");
  const environment = source.environment ?? [];
  if (!Array.isArray(environment) || environment.length > 10 || new Set(environment).size !== environment.length || environment.some((name) => typeof name !== "string" || !/^[A-Z][A-Z0-9_]{0,100}_(?:API_KEY|TOKEN)$/.test(name) || name.startsWith("ARCHIMEDES_") || name.startsWith("PYTHON") || name.startsWith("PIP_"))) throw new Error("App environment entries must be unique API key or token names.");
  if (environment.length && source.runtime.kind !== "python-http") throw new Error("Environment keys require a Python App runtime.");
  const agents = source.agents ?? [], skills = source.skills ?? [];
  if (!Array.isArray(agents) || agents.length > 3 || new Set(agents).size !== agents.length || agents.some((name) => !["codex", "claude", "opencode"].includes(name))) throw new Error("Unsupported App Agent backend.");
  if (!Array.isArray(skills) || skills.length > 20 || new Set(skills).size !== skills.length || skills.some((id) => typeof id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))) throw new Error("Invalid App skill list.");
  for (const skill of skills) {
    const skillPath = path.join(directory, ".capabilities", skill, "SKILL.md");
    for (const part of [path.join(directory, ".capabilities"), path.join(directory, ".capabilities", skill), skillPath]) if (fs.lstatSync(part).isSymbolicLink()) throw new Error("Linked App skill files are not supported.");
    if (!fs.statSync(skillPath).isFile() || fs.statSync(skillPath).size > 128000) throw new Error("App skill file is unavailable or too large.");
  }
  const needsSetup = source.runtime.kind === "python-http" && !fs.lstatSync(path.join(directory, ".venv"), { throwIfNoEntry: false });
  return { id, name: source.name.trim(), description: String(source.description || "").slice(0, 500), version: String(source.version || "0.1.0").slice(0, 40), category: source.category, runtime: { kind: source.runtime.kind, entry }, environment, agents, skills, needsSetup, workspace: root, directory };
}
function fingerprint(app) {
  const h = createHash("sha256");
  let count = 0, bytes = 0;
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (SKIP.has(entry.name) || (entry.name.startsWith(".") && entry.name !== ".capabilities")) continue;
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("Linked App source files are not supported.");
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) {
        const size = fs.statSync(file).size;
        count++; bytes += size;
        if (count > 1600 || bytes > 16_000_000) throw new Error("App source exceeds the review limit. Keep datasets and generated outputs outside the App source folder.");
        h.update(path.relative(app.directory, file)); h.update("\0"); h.update(fs.readFileSync(file));
      }
    }
  }
  visit(app.directory);
  return h.digest("hex");
}
function readState(root) {
  try {
    const directory = realDirectory(root, ".archimedes");
    const file = path.join(directory, "research-apps.json");
    if (fs.lstatSync(file).isSymbolicLink() || fs.statSync(file).size > 128000) return { version: 1, apps: {} };
    const state = JSON.parse(fs.readFileSync(file, "utf8"));
    if (state.version === 1 && state.apps && typeof state.apps === "object") return state;
  } catch { /* no saved installations */ }
  return { version: 1, apps: {} };
}
function writeState(root, state) {
  const directory = realDirectory(root, ".archimedes", true);
  const target = path.join(directory, "research-apps.json");
  if (fs.lstatSync(target, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error("Linked App state is not supported.");
  const temporary = path.join(directory, `research-apps-${randomBytes(8).toString("hex")}.tmp`);
  try { fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { flag: "wx", mode: 0o600 }); fs.renameSync(temporary, target); }
  finally { fs.rmSync(temporary, { force: true }); }
}
function cleanEnvironment(port, token) {
  const env = {};
  for (const name of ["PATH", "HOME", "USERPROFILE", "SystemRoot", "WINDIR", "PATHEXT", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL"]) if (process.env[name]) env[name] = process.env[name];
  return { ...env, PORT: String(port), ARCHIMEDES_APP_TOKEN: token, PYTHONUNBUFFERED: "1", PYTHONDONTWRITEBYTECODE: "1" };
}
async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
function createResearchAppRuntime({ approve = async () => false, readSecret = () => "", changed = () => {}, startupTimeoutMs = 45000, healthIntervalMs = 4000 } = {}) {
  const runs = new Map();
  const key = (root, id) => {
    let canonical;
    try { canonical = fs.realpathSync(root); } catch { canonical = path.resolve(root); }
    return `${canonical}\0${appId(id)}`;
  };
  const publicRun = (run) => ({ status: run?.status || "stopped", url: run?.status === "running" ? run.url : null, error: run?.error || "", logs: run?.logs || "" });
  function notify(run) { try { changed(run.app.workspace); } catch { /* window closed */ } }
  function append(run, value) { run.logs = (run.logs + String(value).replaceAll(run.token, "[runtime token]")).slice(-16000); }
  function status(workspace, id) { return publicRun(runs.get(key(workspace, id))); }
  function list(workspace) {
    const root = fs.realpathSync(workspace), state = readState(root);
    let entries;
    try { entries = fs.readdirSync(realDirectory(root, "research-apps"), { withFileTypes: true }); } catch { return []; }
    return entries.filter((entry) => entry.isDirectory() && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name)).slice(0, 100).flatMap((entry) => {
      const installed = Object.hasOwn(state.apps, entry.name) ? state.apps[entry.name] : null;
      if (!fs.existsSync(path.join(root, "research-apps", entry.name, MANIFEST))) return [];
      try {
        const app = readApp(root, entry.name);
        return [{ ...app, installed: Boolean(installed), pinned: Boolean(installed?.pinned), ...status(root, app.id) }];
      } catch (error) { return [{ id: entry.name, name: entry.name, category: "evidence", installed: Boolean(installed), pinned: false, error: error.message, status: "invalid", url: null, logs: "", workspace: root, directory: path.join(root, "research-apps", entry.name) }]; }
    });
  }
  async function consent(app, operation) {
    const signature = fingerprint(app);
    const records = readState(app.workspace).apps;
    const saved = Object.hasOwn(records, app.id) ? records[app.id] : null;
    if (saved?.fingerprint !== signature && !(await approve({ app, operation }))) throw new Error("App execution was not approved.");
    if (fingerprint(readApp(app.workspace, app.id)) !== signature) throw new Error("App source changed during approval. Review it again.");
    return signature;
  }
  async function install(workspace, id, pinned = true) {
    const app = readApp(workspace, id);
    const signature = await consent(app, "install");
    const state = readState(app.workspace);
    state.apps[id] = { fingerprint: signature, pinned: Boolean(pinned), installedAt: new Date().toISOString() };
    writeState(app.workspace, state); changed(app.workspace);
    return list(app.workspace);
  }
  async function pin(workspace, id, pinned) {
    const root = fs.realpathSync(workspace), state = readState(root);
    if (!Object.hasOwn(state.apps, appId(id))) throw new Error("Install the Research App first.");
    state.apps[id].pinned = Boolean(pinned); writeState(root, state); changed(root);
    return list(root);
  }
  async function stop(workspace, id) {
    const run = runs.get(key(workspace, id));
    if (!run) return status(workspace, id);
    run.controller.abort(); clearInterval(run.healthTimer);
    run.status = "stopping"; notify(run);
    if (run.server) { run.server.closeAllConnections(); await new Promise((resolve) => run.server.close(resolve)); }
    if (run.child && run.child.exitCode === null && run.child.signalCode === null) {
      const kill = (signal) => {
        try {
          if (process.platform === "win32") {
            // Killing only the leader can orphan its descendants before taskkill
            // gets a chance to identify the tree.
            const killer = spawn("taskkill.exe", ["/PID", String(run.child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore", shell: false });
            killer.once("error", () => { try { run.child.kill(); } catch { /* exited */ } });
          } else process.kill(-run.child.pid, signal);
        } catch { /* already exited */ }
      };
      await new Promise((resolve) => {
        const timer = setTimeout(() => { kill("SIGKILL"); resolve(); }, 1500);
        run.child.once("exit", () => { clearTimeout(timer); resolve(); }); kill("SIGTERM");
      });
    }
    run.status = "stopped"; run.url = null; notify(run);
    return publicRun(run);
  }
  async function remove(workspace, id) {
    const root = fs.realpathSync(workspace); await stop(root, id);
    const state = readState(root); delete state.apps[appId(id)]; writeState(root, state); changed(root);
    return list(root); // source/data deliberately preserved
  }
  async function start(workspace, id) {
    const app = readApp(workspace, id), runKey = key(workspace, id), previous = runs.get(runKey);
    if (previous?.status === "running") return publicRun(previous);
    if (["starting", "stopping"].includes(previous?.status)) throw new Error("An App operation is already in progress.");
    if ([...runs.values()].filter((run) => ["starting", "running"].includes(run.status)).length >= 4) throw new Error("Stop another App before starting more than four runtimes.");
    if (runs.size >= 100) for (const [id, candidate] of runs) { if (!["starting", "running", "stopping"].includes(candidate.status)) runs.delete(id); if (runs.size < 100) break; }
    const run = { app, status: "starting", token: randomBytes(24).toString("hex"), logs: "", error: "", url: null, controller: new AbortController() };
    runs.set(runKey, run); notify(run);
    try {
      await consent(app, "start");
      if (run.controller.signal.aborted) throw new Error("App startup was cancelled.");
      if (app.runtime.kind === "static") {
        const webRoot = path.dirname(localFile(app.directory, app.runtime.entry));
        run.server = http.createServer((request, response) => {
          try {
            if (request.method !== "GET" && request.method !== "HEAD") { response.writeHead(405); response.end(); return; }
            const relative = decodeURIComponent(new URL(request.url, "http://localhost").pathname).slice(1) || path.basename(app.runtime.entry);
            const file = localFile(webRoot, relative);
            const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2" };
            const type = types[path.extname(file)];
            if (!type || fs.statSync(file).size > 8_000_000) throw new Error("Not a public App asset.");
            response.writeHead(200, { "Content-Type": type, "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store", "X-Archimedes-App-Token": run.token, "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'self'" });
            response.end(request.method === "HEAD" ? undefined : fs.readFileSync(file));
          } catch { response.writeHead(404); response.end("Not found"); }
        });
        await new Promise((resolve, reject) => { run.server.once("error", reject); run.server.listen(0, "127.0.0.1", resolve); });
        run.url = `http://127.0.0.1:${run.server.address().port}/`;
      } else {
        const interpreter = path.join(app.directory, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
        if (!fs.statSync(interpreter, { throwIfNoEntry: false })?.isFile()) throw new Error("App Python environment is missing. Create this App's .venv and install its requirements first.");
        const port = await availablePort();
        if (run.controller.signal.aborted) throw new Error("App startup was cancelled.");
        run.url = `http://127.0.0.1:${port}/`;
        const secrets = Object.create(null);
        for (const name of app.environment) {
          const value = readSecret(name);
          if (!value) throw new Error(`Add ${name} in Settings → Environment before starting this App.`);
          secrets[name] = value;
        }
        run.child = spawn(interpreter, [app.runtime.entry], { cwd: app.directory, env: { ...cleanEnvironment(port, run.token), ...secrets }, stdio: ["ignore", "pipe", "pipe"], shell: false, detached: process.platform !== "win32", windowsHide: true });
        // A child with credentials can write secrets in arbitrarily fragmented
        // chunks. Suppress its output rather than attempting lossy redaction.
        if (app.environment.length) run.logs = "Runtime logs are suppressed while environment keys are provided.";
        run.child.stdout.on("data", (data) => { if (!app.environment.length) append(run, data); }); run.child.stderr.on("data", (data) => { if (!app.environment.length) append(run, data); });
        const fail = (error) => { if (["starting", "running"].includes(run.status)) { run.status = "failed"; run.error = error; run.url = null; clearInterval(run.healthTimer); notify(run); } };
        run.child.once("error", () => fail("The App process could not start."));
        run.child.once("exit", (code, signal) => {
          // The leader can exit while its tools/children still hold resources.
          // Its dedicated POSIX group belongs to this runtime, not the Agent.
          if (process.platform !== "win32" && run.child.pid) { try { process.kill(-run.child.pid, "SIGKILL"); } catch { /* group already empty */ } }
          fail(`The App process exited (${signal || code}). Check its logs and dependencies.`);
        });
      }
      const check = async () => {
        const response = await fetch(run.url, { redirect: "error", signal: AbortSignal.any([run.controller.signal, AbortSignal.timeout(1200)]) });
        const ready = response.ok && response.headers.get("x-archimedes-app-token") === run.token;
        await response.body?.cancel(); return ready;
      };
      const deadline = Date.now() + startupTimeoutMs;
      let ready = false;
      while (Date.now() < deadline && run.status === "starting" && !run.controller.signal.aborted) {
        try { ready = await check(); } catch { /* starting */ }
        if (ready) break;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      if (!ready || run.status !== "starting" || run.controller.signal.aborted) throw new Error(run.error || "App did not become ready. Python Apps must read PORT and echo ARCHIMEDES_APP_TOKEN in the X-Archimedes-App-Token response header.");
      run.status = "running"; notify(run);
      let checking = false;
      run.healthTimer = setInterval(async () => {
        if (checking || run.status !== "running") return;
        checking = true;
        try { if (!(await check())) throw new Error("Health check failed"); }
        catch { if (run.status === "running") { await stop(app.workspace, app.id); run.status = "failed"; run.error = "App became unavailable. Check logs and restart it."; notify(run); } }
        finally { checking = false; }
      }, healthIntervalMs);
      run.healthTimer.unref();
      return publicRun(run);
    } catch (error) {
      const cancelled = run.controller.signal.aborted;
      // A cancelled approval may finish after the user starts a newer run.
      // Its cleanup must never stop that replacement runtime.
      if (runs.get(runKey) === run) await stop(app.workspace, app.id);
      run.status = cancelled ? "stopped" : "failed"; run.error = error.message; notify(run);
      return publicRun(run);
    }
  }
  async function shutdown() { await Promise.all([...runs.values()].map((run) => stop(run.app.workspace, run.app.id))); }
  return { list, start, stop, status, install, pin, remove, shutdown };
}
module.exports = { createResearchAppRuntime, readApp, fingerprint, MANIFEST };
