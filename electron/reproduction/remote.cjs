/**
 * Remote (SSH) execution backend.
 *
 * Same five methods as the Docker backend, so the runner never learns where the
 * work happens:
 *
 *   prepare()            create a per-reproduction directory and clone into it
 *   exec(command)         run one step inside that directory
 *   readFile(path)        read a checkpoint's file
 *   writeFile(path)       keep a long command's output for later grep
 *   httpStatus(url)       ask the service from the server's side of the network
 *   dispose()             leave the directory alone; logs and artifacts are the point
 *
 * Nothing outside the reproduction directory is touched, nothing is deleted that
 * this process did not create, and no command runs with sudo.
 */

const { spawn } = require("node:child_process");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const { runProcess, terminateProcess } = require("./process-runner.cjs");
const { remotePathChecks } = require("./structured-paths.cjs");
const { loggedCommand, writeOutputCommand } = require("./target-log.cjs");
const { outputPathFor } = require("./paths.cjs");
const { ownedCommand, cleanupCommand } = require("./remote-owner.cjs");
const { shellQuote, quoteRemotePath } = require("./remote-quotes.cjs");
const { isOutputPath } = require("./paths.cjs");
const { envFileContent, envPrelude } = require("./env-file.cjs");

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

/**
 * Runs a command through a login shell.
 *
 * `ssh host 'cmd'` starts a non-interactive shell, which does not read the
 * profile where proxy settings, PATH additions and conda live. A machine whose
 * network only works through a proxy looks offline from there while working
 * perfectly in a normal terminal.
 */
function loginCommand(command) {
  return `bash -lc ${shellQuote(command)}`;
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

function createSshBackend({ server, workspace = "~/.archimedes", repoUrl = "", branch = "", copyFrom = "", emit = () => {}, secrets = {}, signal, runId = randomUUID(), ownerToken = randomUUID(), execute = runProcess, resourceRoot, resourceEnvPath }) {
  const { target, password, env } = authFor(server);
  const root = resourceRoot || remoteRoot(target.workspace || workspace, repoUrl, branch);
  const repo = `${root}/repo`;
  const expectedEnvPath = `/tmp/archimedes/${runId.replace(/[^a-z0-9]/gi, "").slice(0, 32)}/env`;
  const envPath = resourceEnvPath === undefined ? Object.keys(secrets || {}).length ? expectedEnvPath : "" : resourceEnvPath;
  if (envPath && envPath !== expectedEnvPath) throw new Error("The environment file does not belong to this run.");
  let disposed = false, disposal, commandIndex = 0;

  /** Keeps a command's full output where the agent can grep it later. */
  const writeFile = async (absolutePath, content) => {
    if (!isOutputPath(absolutePath)) throw new Error("Refusing to write outside the output directory.");
    const result = await run(
      writeOutputCommand(absolutePath),
      { timeoutMs: 120_000, login: false, stdin: content },
    );
    if (result.code !== 0) {
      throw new Error(`Could not write ${absolutePath}: ${String(result.output || "").trim().slice(0, 200)}`);
    }
    return absolutePath;
  };

  const run = async (command, { timeoutMs = 15 * 60 * 1_000, onData = null, signal: operationSignal = signal, login = true, stdin, stdinStream, owned = true, captureChars } = {}) => {
    const managed = owned ? ownedCommand(command, { root, runId, ownerToken }) : command;
    const args = connectionArgs(target, login ? loginCommand(managed) : `bash -c ${shellQuote(managed)}`, { allowPassword: Boolean(password) });
    const result = await execute("ssh", args, { env: { ...process.env, ...env }, timeoutMs, onData, signal: operationSignal, stdin, stdinStream, captureChars });
    return { ...result, code: result.exitCode };
  };
  let processControlChecked = false;
  const requireProcessControl = async () => {
    if (processControlChecked) return;
    const check = await run("command -v bash >/dev/null 2>&1 && command -v ps >/dev/null 2>&1", { owned: false, login: false, timeoutMs: 10_000 });
    if (check.code !== 0) throw new Error("The SSH target needs bash and ps to start and safely stop managed runs. No remote tools were installed.");
    processControlChecked = true;
  };

  /** Ships a checkout that already exists here instead of cloning it there. */
  const copyLocalCheckout = async (localDir) => {
    emit({ type: "preparing", detail: `Copying the checkout to ${target.host}…` });
    if (signal?.aborted) throw new Error("Stopped before copying the checkout.");
    const pack = spawn("tar", ["-czf", "-", "-C", localDir, "."], { detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
    let bytes = 0, packError = "";
    pack.stdout.on("data", chunk => { bytes += chunk.length; });
    pack.stderr.on("data", chunk => { packError = (packError + chunk.toString()).slice(-1000); });
    pack.on("error", error => { packError = error.message; });
    const abort = () => terminateProcess(pack, "SIGKILL");
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const result = await run(`mkdir -p ${quoteRemotePath(repo)} && tar -xzf - -C ${quoteRemotePath(repo)}`, { stdinStream: pack.stdout });
      if (result.code !== 0 || signal?.aborted) throw new Error(packError || result.error || result.output.trim().slice(-300) || "Checkout copying stopped.");
      return { bytes };
    } finally { signal?.removeEventListener("abort", abort); abort(); }
  };

  return {
    kind: "ssh",
    image: "",
    container: "",
    describe: () => `SSH · ${target.user}@${target.host}`,
    remoteRoot: root,
    resource: () => ({ kind: "ssh", serverId: target.id || server.id, host: target.host, user: target.user, port: target.port, root, runId, ownerToken, envPath }),
    copyCheckout: copyLocalCheckout,

    /** What the machine can offer, before anything is cloned. */
    async probe() {
      await requireProcessControl();
      const result = await run(probeCommand(), { timeoutMs: 60_000 });
      return { ...parseProbe(result.output), ok: result.code === 0 };
    },

    async prepare() {
      if (disposed || signal?.aborted) throw new Error("This run was stopped before preparation.");
      await requireProcessControl();
      emit({ type: "preparing", detail: `Creating ${root} on ${target.host}…` });
      const mkdir = await run(`mkdir -p ${quoteRemotePath(root)} ${quoteRemotePath(`${root}/logs`)} && echo ok`, { timeoutMs: 60_000 });
      if (mkdir.code !== 0) throw new Error(`Could not create ${root}: ${mkdir.output.trim().slice(0, 300)}`);

      const exists = await run(`test -d ${quoteRemotePath(`${repo}/.git`)} && echo yes || echo no`, { timeoutMs: 60_000 });
      if (!exists.output.includes("yes")) {
        emit({ type: "preparing", detail: `Cloning ${branch || "the default branch"} into ${repo}…` });
        // git prints no progress without a terminal unless told to; the bar uses
        // \r, which becomes a newline so the log shows one line per update.
        const clone = await run(
          `git clone --progress --depth 1${branch ? ` --branch ${shellQuote(branch)}` : ""} ${shellQuote(repoUrl)} ${quoteRemotePath(repo)}`,
          { timeoutMs: 15 * 60 * 1_000, onData: (chunk) => emit({ type: "output", chunk: chunk.replace(/\r/g, "\n") }) },
        );
        if (clone.code !== 0) {
          const host = clone.output.match(/Could not resolve host: (\S+)/)?.[1];
          if (!copyFrom) {
            throw new Error(host
              ? `This server cannot reach ${host} (DNS), and no local checkout exists to copy. Clone the repository on this Mac first.`
              : `Could not clone the repository: ${clone.output.trim().slice(0, 300)}`);
          }
          emit({ type: "preparing", detail: `Cannot reach GitHub from ${target.host}; copying the checkout instead…` });
          await run(`rm -rf ${quoteRemotePath(repo)}`, { timeoutMs: 60_000 });
          try {
            await copyLocalCheckout(copyFrom);
          } catch (error) {
            throw new Error(`Could not copy the checkout: ${String(error?.message || error).slice(0, 300)}`);
          }
        }
      }

      const rev = await run(`git -C ${quoteRemotePath(repo)} rev-parse HEAD`, { timeoutMs: 60_000 });
      const commit = rev.output.trim().slice(0, 40);
      const status = await run(`git -C ${quoteRemotePath(repo)} status --porcelain --untracked-files=normal`, { timeoutMs: 10_000 });
      await run(`printf '%s' ${shellQuote(JSON.stringify({ repoUrl, branch, commit, createdAt: new Date().toISOString() }))} > ${quoteRemotePath(`${root}/${MARKER_FILE}`)}`, { timeoutMs: 60_000 });
      if (envPath) await writeFile(envPath, envFileContent(secrets));
      emit({ type: "started", detail: `${target.user}@${target.host} · ${commit.slice(0, 7)}` });
      return { root, repo, commit, branch, dirty: status.code === 0 ? Boolean(status.output.trim()) : null, host: target.host, user: target.user };
    },

    async exec(command, { timeoutMs, onData, signal: commandSignal = signal, outputPath = outputPathFor(runId, ++commandIndex) } = {}) {
      // `cd ... || exit 1` keeps the working directory from silently falling back
      // to $HOME; the keys are sourced, so they never enter the command line.
      const log = remotePathChecks(root, `logs/${runId}/${path.posix.basename(outputPath)}`, { quote: quoteRemotePath, write: true });
      const logged = loggedCommand(command, outputPath, { mirrorPath: log.path, mirrorQuote: quoteRemotePath, mirrorChecks: log.commands });
      const result = await run(`cd ${quoteRemotePath(repo)} || exit 1; ${envPrelude(envPath)}${logged}`, { timeoutMs, onData, signal: commandSignal });
      return { ...result, outputPath, logReference: { storage: "ssh", serverId: target.id || server.id, path: log.path } };
    },

    writeFile,

    /** Structured file methods refuse links rather than inherit arbitrary shell access. */
    async writeRepoFile(relativePath, content) {
      const checked = remotePathChecks(repo, relativePath, { quote: quoteRemotePath, write: true });
      const payload = String(content ?? "");
      const result = await run(`${checked.commands}; cat > ${quoteRemotePath(checked.path)}`, { timeoutMs: 120_000, login: false, stdin: payload });
      if (result.code !== 0) throw new Error(`Could not write ${relativePath}: ${String(result.output || result.error || "Operation stopped").trim().slice(-300)}`);
      return { path: String(relativePath), bytes: Buffer.byteLength(payload) };
    },

    async readFile(relativePath) {
      const checked = remotePathChecks(repo, relativePath, { quote: quoteRemotePath });
      const result = await run(`${checked.commands}; cat -- ${quoteRemotePath(checked.path)}`, { timeoutMs: 60_000, login: false, captureChars: 2 * 1024 * 1024 });
      if (result.code !== 0) {
        if (/No such file|Not a directory|cannot open/i.test(result.output)) return null;
        throw new Error(result.output.trim().slice(-300) || result.error || "The file could not be read.");
      }
      if (result.outputTruncated) throw new Error("The file exceeds the complete structured-read limit. Use a paged shell command for large data.");
      return result.output;
    },

    async httpStatus(url) {
      const result = await run(`python3 -c ${shellQuote(PY_PROBE)} ${shellQuote(url)}`, { timeoutMs: 30_000 });
      const status = Number(result.output.trim().split("\n").pop());
      return Number.isFinite(status) && status >= 100 ? status : null;
    },

    async dispose() {
      if (disposal) return disposal;
      disposed = true;
      disposal = (async () => {
        // Use a fresh signal: the run's signal is normally already cancelled.
        const result = await run(cleanupCommand({ root, runId, ownerToken, envPath }), { timeoutMs: 10_000, signal: AbortSignal.timeout(10_000), login: false, owned: false });
        if (result.code !== 0) throw new Error(result.output.trim().slice(-300) || result.error || "Owned remote resources could not be cleaned up.");
      })();
      return disposal;
    },
  };
}

module.exports = { MARKER_FILE, createSshBackend, loginCommand, parseProbe, probeCommand, quoteRemotePath, remoteRoot, shellQuote };
