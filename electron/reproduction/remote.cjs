/**
 * Remote (SSH) execution backend.
 *
 * Same five methods as the Docker backend, so the runner never learns where the
 * work happens:
 *
 *   prepare()            create a per-reproduction directory and clone into it
 *   exec(command)         run one step inside that directory
 *   readFile(path)        read a checkpoint's file
 *   httpStatus(url)       ask the service from the server's side of the network
 *   dispose()             leave the directory alone; logs and artifacts are the point
 *
 * Nothing outside the reproduction directory is touched, nothing is deleted that
 * this process did not create, and no command runs with sudo.
 */

const { spawn } = require("node:child_process");
const path = require("node:path");
const { createHash } = require("node:crypto");

const { authFor, connectionArgs } = require("../ssh-servers.cjs");

const MARKER_FILE = ".archimedes-run.json";
const PY_PROBE = [
  "import sys, urllib.request, urllib.error",
  "url = sys.argv[1]",
  "try:",
  "    with urllib.request.urlopen(url, timeout=8) as response:",
  "        print(response.status)",
  "except urllib.error.HTTPError as error:",
  "    print(error.code)",
  "except Exception:",
  "    print(0)",
].join("\n");

/** POSIX single-quote escaping for a command that goes through a remote shell. */
function shellQuote(value) {
  return `'${String(value ?? "").replace(/'/g, `'\\''`)}'`;
}

/**
 * Where one reproduction lives on the server. Derived from the repository and
 * branch so a re-run reuses the same directory, and two branches never collide.
 */
function remoteRoot(workspace, repoUrl, branch = "") {
  const base = String(workspace || "~/.archimedes").replace(/\/+$/, "") || "~/.archimedes";
  let owner = "repo";
  let repo = "checkout";
  const match = String(repoUrl || "").match(/^https?:\/\/github\.com\/([^/]+)\/([^/#?]+)/i);
  if (match) {
    owner = match[1];
    repo = match[2].replace(/\.git$/i, "");
  }
  // `repo` and `repo.git` are the same repository; hashing the raw string would
  // clone it twice.
  const canonical = match ? `https://github.com/${owner}/${repo}` : String(repoUrl || "").replace(/\.git$/i, "").replace(/\/+$/, "");
  const key = branch ? `${canonical}#${branch}` : canonical;
  const suffix = createHash("sha256").update(key).digest("hex").slice(0, 10);
  return `${base}/repro/${owner}--${repo}--${suffix}`;
}

/** Reads the probe block printed by `probeCommand()`. */
function parseProbe(output) {
  const text = String(output || "");
  const read = (key) => {
    const match = text.match(new RegExp(`^${key}=(.+)$`, "m"));
    return match ? match[1].trim() : "";
  };
  const diskKb = Number(read("DISK_KB"));
  const dockerVersion = read("DOCKER");
  return {
    os: read("OS"),
    python: read("PY"),
    docker: dockerVersion && dockerVersion !== "none" ? dockerVersion : "",
    gpu: read("GPU") && read("GPU") !== "none" ? read("GPU") : "",
    diskFreeGb: Number.isFinite(diskKb) && diskKb > 0 ? Math.round(diskKb / 1024 / 1024) : 0,
    raw: text.trim(),
  };
}

function probeCommand() {
  return [
    "echo OS=$(uname -sr 2>/dev/null | tr -d '\\n')",
    "echo PY=$(python3 -V 2>&1 | cut -d' ' -f2)",
    "echo DOCKER=$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo none)",
    "echo GPU=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1 || echo none)",
    "echo DISK_KB=$(df -Pk \"$HOME\" 2>/dev/null | awk 'NR==2{print $4}')",
  ].join("; ");
}

function createSshBackend({ server, workspace = "~/.archimedes", repoUrl = "", branch = "", emit = () => {} }) {
  const { target, password, env } = authFor(server);
  const root = remoteRoot(target.workspace || workspace, repoUrl, branch);
  const repo = `${root}/repo`;
  let prepared = false;

  const run = (command, { timeoutMs = 15 * 60 * 1_000, onData = null, signal = null } = {}) => new Promise((resolve) => {
    const args = connectionArgs(target, command, { allowPassword: Boolean(password) });
    const child = spawn("ssh", args, { windowsHide: true, env: { ...process.env, ...env } });
    const out = [];
    let settled = false;
    const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
    child.stdout.on("data", (chunk) => { out.push(chunk); onData?.(chunk.toString()); });
    child.stderr.on("data", (chunk) => { out.push(chunk); onData?.(chunk.toString()); });
    child.once("error", (error) => finish({ code: null, output: out.join(""), error: error?.message || "ssh failed" }));
    child.once("close", (code) => finish({ code, output: out.join("") }));
    const timer = setTimeout(() => { child.kill("SIGKILL"); finish({ code: null, output: out.join(""), timedOut: true }); }, Math.max(1_000, timeoutMs));
    if (timer.unref) timer.unref();
    if (signal) {
      if (signal.aborted) child.kill("SIGKILL");
      else signal.addEventListener("abort", () => child.kill("SIGKILL"), { once: true });
    }
  });

  return {
    kind: "ssh",
    image: "",
    container: "",
    describe: () => `SSH · ${target.user}@${target.host}`,
    remoteRoot: root,

    /** What the machine can offer, before anything is cloned. */
    async probe() {
      const result = await run(probeCommand(), { timeoutMs: 60_000 });
      return { ...parseProbe(result.output), ok: result.code === 0 };
    },

    async prepare() {
      emit({ type: "preparing", detail: `Creating ${root} on ${target.host}…` });
      const mkdir = await run(`mkdir -p ${shellQuote(`${root}`)} ${shellQuote(`${root}/logs`)} && echo ok`, { timeoutMs: 60_000 });
      if (mkdir.code !== 0) throw new Error(`Could not create ${root}: ${mkdir.output.trim().slice(0, 300)}`);

      const exists = await run(`test -d ${shellQuote(`${repo}/.git`)} && echo yes || echo no`, { timeoutMs: 60_000 });
      if (!exists.output.includes("yes")) {
        emit({ type: "preparing", detail: `Cloning ${branch || "the default branch"} into ${repo}…` });
        const cloneArgs = ["clone", "--depth", "1"];
        if (branch) cloneArgs.push("--branch", branch);
        cloneArgs.push(repoUrl, repo);
        const clone = await run(`git ${cloneArgs.map(shellQuote).join(" ")}`, { timeoutMs: 15 * 60 * 1_000, onData: (chunk) => emit({ type: "output", chunk }) });
        if (clone.code !== 0) throw new Error(`Could not clone the repository: ${clone.output.trim().slice(0, 300)}`);
      }

      const rev = await run(`git -C ${shellQuote(repo)} rev-parse HEAD`, { timeoutMs: 60_000 });
      const commit = rev.output.trim().slice(0, 40);
      // A marker so a later run knows this directory is ours, and which contract
      // it belongs to.
      await run(`printf '%s' ${shellQuote(JSON.stringify({ repoUrl, branch, commit, createdAt: new Date().toISOString() }))} > ${shellQuote(`${root}/${MARKER_FILE}`)}`, { timeoutMs: 60_000 });
      prepared = true;
      emit({ type: "started", detail: `${target.user}@${target.host} · ${commit.slice(0, 7)}` });
      return { root, repo, commit, branch, host: target.host, user: target.user };
    },

    async exec(command, { timeoutMs, onData, signal } = {}) {
      const result = await run(`cd ${shellQuote(repo)} && ${command}`, { timeoutMs, onData, signal });
      return { exitCode: result.code, timedOut: Boolean(result.timedOut), error: result.error };
    },

    async readFile(relativePath) {
      const target_ = path.posix.join(repo, String(relativePath || ""));
      if (target_.includes("..")) throw new Error("The checked path is outside the checkout.");
      const result = await run(`cat -- ${shellQuote(target_)}`, { timeoutMs: 60_000 });
      if (result.code !== 0) {
        // A missing file is an answer, not a crash: the checkpoint reports it.
        if (/No such file|Not a directory|cannot open/i.test(result.output)) return null;
        throw new Error(result.output.trim().slice(0, 300) || "The file could not be read.");
      }
      return result.output;
    },

    async httpStatus(url) {
      const result = await run(`python3 -c ${shellQuote(PY_PROBE)} ${shellQuote(url)}`, { timeoutMs: 30_000 });
      const status = Number(result.output.trim().split("\n").pop());
      return Number.isFinite(status) && status >= 100 ? status : null;
    },

    async dispose() {
      // Nothing to tear down: the container backend owns a process, this one owns
      // a directory that holds the logs someone will want to read.
      prepared = false;
    },
  };
}

module.exports = { MARKER_FILE, createSshBackend, parseProbe, probeCommand, remoteRoot, shellQuote };
