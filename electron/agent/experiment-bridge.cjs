// Per-turn, local-only bridge. The native agent invokes a bundled CLI, while
// the Electron process retains session validation and command approvals.
const fs = require("node:fs");
const net = require("node:net");
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
  const socketPath = path.join(folder, "s");
  if (Buffer.byteLength(socketPath) > 100) { fs.rmdirSync(folder); throw new Error("The workspace path is too long for the experiment bridge."); }
  const secret = randomBytes(32).toString("hex");
  const credentialPath = path.join(folder, "connection.json");
  fs.writeFileSync(credentialPath, JSON.stringify({ socketPath, secret }), { mode: 0o600, flag: "wx" });
  const sockets = new Set();
  const active = new Set();
  let closed = false, used = false;
  const server = net.createServer((socket) => {
    if (closed || sockets.size >= 8) { socket.destroy(); return; }
    sockets.add(socket);
    const requestAbort = new AbortController();
    let data = "", consumed = false, responding = false;
    socket.setEncoding("utf8");
    socket.setTimeout(180_000, () => socket.destroy());
    socket.on("error", () => {});
    socket.on("close", () => { sockets.delete(socket); if (!responding) requestAbort.abort(); });
    const respond = (value) => {
      if (socket.destroyed) return;
      let output = JSON.stringify(value);
      if (Buffer.byteLength(output) > MAX_RESPONSE) output = JSON.stringify({ error: "Experiment bridge response exceeded the size limit." });
      responding = true;
      socket.end(`${output}\n`);
    };
    socket.on("data", (chunk) => {
      if (consumed) return;
      data += chunk;
      if (Buffer.byteLength(data) > MAX_REQUEST) { consumed = true; respond({ error: "Experiment request exceeded the size limit." }); return; }
      const end = data.indexOf("\n");
      if (end < 0) return;
      consumed = true;
      let request;
      try { request = JSON.parse(data.slice(0, end)); } catch { respond({ error: "Invalid experiment request." }); return; }
      const provided = typeof request?.secret === "string" ? Buffer.from(request.secret) : Buffer.alloc(0);
      const expected = Buffer.from(secret);
      if (provided.length !== expected.length || !timingSafeEqual(provided, expected) || !ALLOWED.has(request.method) || !request.arguments || typeof request.arguments !== "object" || Array.isArray(request.arguments)) {
        respond({ error: "Experiment request is not authorized or is invalid." }); return;
      }
      if (active.size >= 1) { respond({ error: "Another experiment request is still in progress. Retry after it completes." }); return; }
      used = true;
      active.add(requestAbort);
      Promise.resolve().then(() => invoke(request.method, request.arguments, requestAbort.signal))
        .then((result) => respond({ result }), (error) => respond({ error: String(error?.message || error).slice(0, 2000) }))
        .finally(() => active.delete(requestAbort));
    });
  });
  const close = () => {
    if (closed) return;
    closed = true;
    signal?.removeEventListener("abort", close);
    for (const controller of active) controller.abort();
    for (const socket of sockets) socket.destroy();
    try { server.close(); } catch { /* server did not start */ }
    // Only remove files created by this bridge, never arbitrary workspace data.
    for (const file of [socketPath, credentialPath]) { try { fs.unlinkSync(file); } catch { /* already removed */ } }
    try { fs.rmdirSync(folder); } catch { /* leave unexpected contents intact */ }
  };
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(socketPath, () => { server.removeListener("error", reject); resolve(); }); });
    fs.chmodSync(socketPath, 0o600);
  } catch (error) { close(); throw error; }
  signal?.addEventListener("abort", close, { once: true });
  if (signal?.aborted) { close(); throw new Error("The research turn has already ended."); }
  const cli = path.join(__dirname, "experiment-bridge-cli.cjs");
  const command = `ELECTRON_RUN_AS_NODE=1 ${quote(executable)} ${quote(cli)} ${quote(credentialPath)}`;
  const instructions = [
    "Live Archimedes experiment tools are available for this turn. If direct experiment tools are available, use them. Otherwise use the local CLI below; if sandbox access to its local socket is denied, request native approval rather than disabling sandbox protection. Use only when the user explicitly asks to undertake or run an experiment. Never repeat an existing run.",
    `Command prefix: ${command}`,
    "Invoke as: <prefix> <tool_name> '<JSON object>'. It returns JSON. Use exact existing idea/experiment ids or titles from the conversation; do not guess an ambiguous idea.",
    'Example: <prefix> create_experiment \'{"idea":"<idea title>","title":"<experiment title>"}\'',
    'Use record_experiment_activity with {"experiment":"...","category":"preparation|reproduction|baseline|implementation|execution|repair|observation","status":"started|completed|failed|note","title":"..."} to report actual observed work without creating extra graph nodes.',
    'For formal execution use run_experiment with {"experiment":"...","command":"..."}; it requests approval and returns a run id. Use wait_experiment, read_experiment_log, record_experiment_evidence and create_experiment_result as needed. Worktree creation via prepare_experiment_workspace also requires approval.',
    "Ordinary shell commands are not automatically formal experiment runs. Do not emit fenced experiment directives after using the live bridge. Do not reveal or copy the connection file.",
  ].join("\n");
  return { instructions, credentialPath, close, wasUsed: () => used };
}

module.exports = { createExperimentBridge };
