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
const { createHash } = require("node:crypto");
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

/** POSIX single-quote escaping for a command that goes through a remote shell. */
function shellQuote(value) {
  return `'${String(value ?? "").replace(/'/g, `'\\''`)}'`;
}

/**
 * Quotes a remote path so the server expands `~`. Single quotes would stop the
 * expansion and create a directory literally named "~" in the home folder.
 */
function quoteRemotePath(value) {
  const text = String(value ?? "");
  if (text === "~") return '"$HOME"';
  if (text.startsWith("~/")) return `"$HOME"/${shellQuote(text.slice(2))}`;
  return shellQuote(text);
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

function createSshBackend({ server, workspace = "~/.archimedes", repoUrl = "", branch = "", copyFrom = "", emit = () => {}, secrets = {} }) {
  const { target, password, env } = authFor(server);
  const root = remoteRoot(target.workspace || workspace, repoUrl, branch);
  const repo = `${root}/repo`;
  const envPath = Object.keys(secrets || {}).length
    ? `/tmp/archimedes/${Math.random().toString(36).slice(2, 10)}/env`
    : "";
  let prepared = false;

  /** Keeps a command's full output where the agent can grep it later. */
  const writeFile = async (absolutePath, content) => {
    if (!isOutputPath(absolutePath)) throw new Error("Refusing to write outside the output directory.");
    const dir = absolutePath.replace(/\/[^/]+$/, "");
    const result = await run(
      `umask 077; mkdir -p ${quoteRemotePath(dir)} && cat > ${quoteRemotePath(absolutePath)}`,
      { timeoutMs: 120_000, login: false, stdin: content },
    );
    if (result.code !== 0) {
      throw new Error(`Could not write ${absolutePath}: ${String(result.output || "").trim().slice(0, 200)}`);
    }
    return absolutePath;
  };

  const run = (command, { timeoutMs = 15 * 60 * 1_000, onData = null, signal = null, login = true, stdin } = {}) => new Promise((resolve) => {
    const args = connectionArgs(target, login ? loginCommand(command) : command, { allowPassword: Boolean(password) });
    const child = spawn("ssh", args, { windowsHide: true, env: { ...process.env, ...env } });
    const out = [];
    if (stdin !== undefined) {
      // ssh forwards stdin over the channel; a command that exits early closes it.
      child.stdin.on("error", () => {});
      child.stdin.end(String(stdin));
    }
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

  /** Ships a checkout that already exists here instead of cloning it there. */
  const copyLocalCheckout = (localDir) => new Promise((resolve, reject) => {
    emit({ type: "preparing", detail: `Copying the checkout to ${target.host}…` });
    const remoteCommand = `mkdir -p ${quoteRemotePath(repo)} && tar -xzf - -C ${quoteRemotePath(repo)}`;
    const sshArgs = connectionArgs(target, remoteCommand, { allowPassword: Boolean(password) });
    const pack = spawn("tar", ["-czf", "-", "-C", localDir, "."]);
    const pipe = spawn("ssh", sshArgs, { windowsHide: true, env: { ...process.env, ...env } });
    let stderr = "";
    let sent = 0;
    pack.stdout.on("data", (chunk) => { sent += chunk.length; });
    pack.stdout.pipe(pipe.stdin);
    pack.once("error", reject);
    pipe.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    pipe.once("error", reject);
    pipe.once("close", (code) => {
      if (code === 0) resolve({ bytes: sent });
      else reject(new Error(stderr.trim().slice(0, 300) || `tar exited with ${code}`));
    });
  });

  return {
    kind: "ssh",
    image: "",
    container: "",
    describe: () => `SSH · ${target.user}@${target.host}`,
    remoteRoot: root,
    copyCheckout: copyLocalCheckout,

    /** What the machine can offer, before anything is cloned. */
    async probe() {
      const result = await run(probeCommand(), { timeoutMs: 60_000 });
      return { ...parseProbe(result.output), ok: result.code === 0 };
    },

    async prepare() {
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
      await run(`printf '%s' ${shellQuote(JSON.stringify({ repoUrl, branch, commit, createdAt: new Date().toISOString() }))} > ${quoteRemotePath(`${root}/${MARKER_FILE}`)}`, { timeoutMs: 60_000 });
      prepared = true;
      if (envPath) await writeFile(envPath, envFileContent(secrets));
      emit({ type: "started", detail: `${target.user}@${target.host} · ${commit.slice(0, 7)}` });
      return { root, repo, commit, branch, host: target.host, user: target.user };
    },

    async exec(command, { timeoutMs, onData, signal } = {}) {
      // `cd ... || exit 1` keeps the working directory from silently falling back
      // to $HOME; the keys are sourced, so they never enter the command line.
      const result = await run(`cd ${quoteRemotePath(repo)} || exit 1; ${envPrelude(envPath)}${command}`, { timeoutMs, onData, signal });
      return { exitCode: result.code, timedOut: Boolean(result.timedOut), error: result.error };
    },

    writeFile,

    /** Writes a file inside the checkout. Used by the structured write/edit actions. */
    async writeRepoFile(relativePath, content) {
      const relative = String(relativePath || "");
      const absolute = path.posix.join(repo, relative);
      if (absolute.includes("..") || absolute.split("/").includes(".git")) {
        throw new Error("The path is outside the checkout.");
      }
      const dir = path.posix.dirname(absolute);
      const payload = String(content ?? "");
      const result = await run(
        `umask 022; mkdir -p ${quoteRemotePath(dir)} && cat > ${quoteRemotePath(absolute)}`,
        { timeoutMs: 120_000, login: false, stdin: payload },
      );
      if (result.code !== 0) {
        throw new Error(`Could not write ${relative}: ${String(result.output || "").trim().slice(0, 200)}`);
      }
      return { path: relative, bytes: Buffer.byteLength(payload, "utf8") };
    },

    async readFile(relativePath) {
      const absolute = path.posix.join(repo, String(relativePath || ""));
      if (absolute.includes("..")) throw new Error("The checked path is outside the checkout.");
      const result = await run(`cat -- ${quoteRemotePath(absolute)}`, { timeoutMs: 60_000, login: false });
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
      // The checkout and its logs are the point; the key file is not.
      if (envPath) await run(`rm -f ${quoteRemotePath(envPath)}`, { timeoutMs: 30_000 }).catch(() => {});
      prepared = false;
    },
  };
}

module.exports = { MARKER_FILE, createSshBackend, loginCommand, parseProbe, probeCommand, quoteRemotePath, remoteRoot, shellQuote };
