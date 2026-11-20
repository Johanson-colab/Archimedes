// Per-turn local mailbox. Native harnesses can write inside their workspace
// without requiring network/socket permissions; the main process keeps the
// session scope, tool validation and command approval checks.
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes, timingSafeEqual } = require("node:crypto");

const MAX_REQUEST = 128 * 1024;
const MAX_RESPONSE = 1024 * 1024;
const ALLOWED = new Set(["create_experiment", "prepare_experiment_workspace", "run_experiment", "wait_experiment", "read_experiment_log", "record_experiment_activity", "record_experiment_evidence", "create_experiment_result"]);
function quote(value) { return `'${String(value).replaceAll("'", "'\\''")}'`; }

async function createExperimentBridge({ workspace, invoke, signal, executable = process.execPath } = {}) {
  if (process.platform === "win32") throw new Error("The live experiment bridge is not yet available on Windows.");
  if (typeof invoke !== "function" || !workspace) throw new Error("A workspace and experiment handler are required.");
  if (signal?.aborted) throw new Error("The research turn has already ended.");
  const root = fs.realpathSync(workspace);
  const appDirectory = path.join(root, ".archimedes");
  fs.mkdirSync(appDirectory, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(appDirectory);
  if (stat.isSymbolicLink() || !stat.isDirectory() || fs.realpathSync(appDirectory) !== appDirectory) throw new Error("The experiment bridge requires a local .archimedes folder.");
  const folder = fs.mkdtempSync(path.join(appDirectory, "bridge-"));
  fs.chmodSync(folder, 0o700);
  const secret = randomBytes(32).toString("hex");
  const credentialPath = path.join(folder, "connection.json");
  fs.writeFileSync(credentialPath, JSON.stringify({ directory: folder, secret }), { mode: 0o600, flag: "wx" });
  let closed = false, used = false, active = null;
  const handled = new Set();
  const ownedFiles = new Set([credentialPath]);
  function send(file, value) {
    if (closed) return;
    let output = JSON.stringify(value);
    if (Buffer.byteLength(output) > MAX_RESPONSE) output = JSON.stringify({ error: "Experiment bridge response exceeded the size limit." });
    try { fs.writeFileSync(file, output, { mode: 0o600, flag: "wx" }); ownedFiles.add(file); } catch { /* caller disappeared or file already exists */ }
  }
  function scan() {
    if (closed) return;
    let names;
    try { names = fs.readdirSync(folder); } catch { return; }
    for (const name of names) {
      const match = /^([a-f0-9]{32})\.request$/.exec(name);
      if (!match || handled.has(name)) continue;
      if (handled.size >= 256) return;
      handled.add(name);
      const requestPath = path.join(folder, name), responsePath = path.join(folder, `${match[1]}.response`);
      let request;
      try {
        const info = fs.lstatSync(requestPath);
        if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_REQUEST) throw new Error("Invalid request.");
        request = JSON.parse(fs.readFileSync(requestPath, "utf8"));
      } catch { send(responsePath, { error: "Invalid experiment request." }); continue; }
      const provided = typeof request?.secret === "string" ? Buffer.from(request.secret) : Buffer.alloc(0);
      const expected = Buffer.from(secret);
      if (provided.length !== expected.length || !timingSafeEqual(provided, expected) || !ALLOWED.has(request.method) || !request.arguments || typeof request.arguments !== "object" || Array.isArray(request.arguments) || !Number.isSafeInteger(request.pid) || request.pid < 1) {
        send(responsePath, { error: "Experiment request is not authorized or is invalid." }); continue;
      }
      ownedFiles.add(requestPath);
      if (active) { send(responsePath, { error: "Another experiment request is still in progress. Retry after it completes." }); continue; }
      used = true;
      const requestAbort = new AbortController();
      active = requestAbort;
      // Check both the lease and client process immediately before an approved
      // operation starts, as well as periodically while waiting for approval.
      const isRequestActive = () => {
        if (closed || requestAbort.signal.aborted) return false;
        try { if (Date.now() - fs.statSync(requestPath).mtimeMs > 6000) return false; process.kill(request.pid, 0); return true; }
        catch { return false; }
      };
      const lease = setInterval(() => { if (!isRequestActive()) requestAbort.abort(); }, 500);
      lease.unref?.();
      Promise.resolve().then(() => invoke(request.method, request.arguments, requestAbort.signal, isRequestActive))
        .then((result) => { if (!requestAbort.signal.aborted) send(responsePath, { result }); }, (error) => { if (!requestAbort.signal.aborted) send(responsePath, { error: String(error?.message || error).slice(0, 2000) }); })
        .finally(() => { clearInterval(lease); if (active === requestAbort) active = null; });
    }
  }
  const poll = setInterval(scan, 100);
  poll.unref?.();
  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(poll);
    signal?.removeEventListener("abort", close);
    active?.abort();
    for (const file of ownedFiles) { try { fs.unlinkSync(file); } catch { /* already removed */ } }
    try { fs.rmdirSync(folder); } catch { /* preserve unexpected or caller-owned files */ }
  };
  signal?.addEventListener("abort", close, { once: true });
  if (signal?.aborted) { close(); throw new Error("The research turn has already ended."); }
  const cli = path.join(__dirname, "experiment-bridge-cli.cjs");
  const command = `ELECTRON_RUN_AS_NODE=1 ${quote(executable)} ${quote(cli)} ${quote(credentialPath)}`;
  const instructions = [
    "Live Archimedes experiment tools are available for this turn. If direct experiment tools are available, use them. Otherwise use the local CLI below. Use only when the user explicitly asks to undertake or run an experiment. Never repeat an existing run.",
    `Command prefix: ${command}`,
    "Invoke as: <prefix> <tool_name> '<JSON object>'. It returns JSON. Use exact existing idea/experiment ids or titles from the conversation; do not guess an ambiguous idea.",
    'Example: <prefix> create_experiment \'{"idea":"<idea title>","title":"<experiment title>"}\'',
    'Use record_experiment_activity with {"experiment":"...","category":"preparation|reproduction|baseline|implementation|execution|repair|observation","status":"started|completed|failed|note","title":"..."} to report actual observed work without creating extra graph nodes.',
    'Worktree: prepare_experiment_workspace {"experiment":"..."} (for a child add "parent_run_id"). It requests approval and returns workspace information.',
    'Formal execution: run_experiment {"experiment":"...","command":"...","use_experiment_workspace":true} to run inside that worktree. Do not pass a "workspace" field: use_experiment_workspace selects it. Optional "cwd" is relative to the chosen workspace. This requests approval and returns run_id.',
    'Wait: wait_experiment {"run_id":"...","timeout_seconds":20}. Logs: read_experiment_log {"run_id":"..."}. Evidence: record_experiment_evidence {"run_id":"...","metrics":{"accuracy":0.9},"artifacts":["results/plot.png"]}. Result: create_experiment_result {"run_id":"...","verdict":"inconclusive","reasoning":"..."}. Use only documented fields.',
    "Ordinary shell commands are not automatically formal experiment runs. Do not emit fenced experiment directives after using the live bridge. Do not reveal or copy the connection file.",
  ].join("\n");
  return { instructions, credentialPath, close, wasUsed: () => used };
}
module.exports = { createExperimentBridge };
