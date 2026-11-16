/**
 * Docker execution backend.
 *
 * One long-lived container per run, with the checkout mounted read-write at
 * /workspace. Each step is a `docker exec`, so the environment the steps share
 * is the environment they build — that is the point of a runbook.
 *
 * The container is disposable: stopping a run, timing out, or quitting the app
 * removes it. Nothing survives on the host except the checkout itself.
 */

const { randomUUID } = require("node:crypto");
const { runProcess } = require("./process-runner.cjs");
const structuredPaths = require("./structured-paths.cjs");
const { loggedCommand, writeOutputCommand } = require("./target-log.cjs");
const { outputPathFor } = require("./paths.cjs");
const path = require("node:path");
const { isOutputPath } = require("./paths.cjs");
const { envFileContent, envPrelude } = require("./env-file.cjs");

const MOUNT = "/workspace";
const DOCKER_TIMEOUT_MS = 20_000;

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

const NODE_PROBE = [
  "const http=require('http'),https=require('https'),u=new URL(process.argv[1]);",
  "const m=u.protocol==='https:'?https:http;",
  "const r=m.get(u,res=>{console.log(res.statusCode);res.destroy();process.exit(0)});",
  "r.on('error',()=>{console.log(0);process.exit(0)});",
  "r.setTimeout(8000,()=>{console.log(0);process.exit(0)});",
].join("");


/**
 * Docker images are chosen from what the contract says the paper needs, never
 * from what a command happens to mention in passing.
 */
function imageFor(environment = {}) {
  const declared = String(environment.python || "").match(/\d+\.\d+/);
  if (declared) return `python:${declared[0]}-slim`;
  const hint = [...(environment.install || []), ...(environment.system || [])].join(" ").toLowerCase();
  if (/\b(npm|yarn|pnpm|node)\b/.test(hint)) return "node:20";
  return "python:3.11-slim";
}

function quotePath(value) {
  return `'${String(value || "").replace(/'/g, `'"'"'`)}'`;
}

async function dockerVersion({ signal, execute = runProcess } = {}) {
  const result = await execute("docker", ["info", "--format", "{{.ServerVersion}}"], { signal, timeoutMs: DOCKER_TIMEOUT_MS });
  if (result.exitCode !== 0) {
    const hint = String(result.output || "").trim().split("\n").slice(-1)[0] || "Docker did not answer.";
    throw new Error(`Docker is not available: ${hint}. Start Docker Desktop and run this again.`);
  }
  return String(result.output || "").trim();
}

function createDockerBackend({ checkoutDir, dataRoot = checkoutDir, environment = {}, name, secrets = {}, signal, runId = randomUUID(), ownerToken = randomUUID(), execute = runProcess, limits = {} } = {}) {
  if (!checkoutDir) throw new Error("A Docker backend needs a checkout directory.");
  const image = imageFor(environment);
  const container = name || `archimedes-repro-${runId}`;
  const run = (command, args, options = {}) => execute(command, args, { signal, ...options });
  const logRelative = `.archimedes/reproduction-logs/${runId}`;
  const logDirectory = path.join(dataRoot, logRelative);
  const targetLogDirectory = path.posix.dirname(outputPathFor(runId, 1));
  let commandIndex = 0, disposed = false, disposal;
  const envPath = Object.keys(secrets || {}).length
    ? `/tmp/archimedes/${Math.random().toString(36).slice(2, 10)}/env`
    : "";


  /** Keeps a command's full output from being lost. */
  const writeFile = async (absolutePath, content) => {
    if (!isOutputPath(absolutePath)) throw new Error("Refusing to write outside the output directory.");
    const result = await run("docker", [
      "exec", "-i", container, "sh", "-c",
      writeOutputCommand(absolutePath),
    ], { stdin: String(content || ""), timeoutMs: 60_000 });
    if (result.exitCode !== 0) {
      throw new Error(`Could not write ${absolutePath}: ${String(result.output || "").trim().slice(0, 200)}`);
    }
    return absolutePath;
  };

  const exec = async (command, { timeoutMs, onData, signal: commandSignal = signal, outputPath = outputPathFor(runId, ++commandIndex) } = {}) => {
    if (path.posix.dirname(outputPath) !== targetLogDirectory) throw new Error("The log path belongs to a different run.");
    // Pre-create as the desktop user. A root process in Linux Docker can append
    // without making the persisted log unreadable to that user after disposal.
    await structuredPaths.writeRepoFile(dataRoot, `${logRelative}/${path.posix.basename(outputPath)}`, "", { mode: 0o600 });
    // The keys are sourced, not passed on the command line: they never appear in
    // the journal, the log, or the process list.
    const result = await run("docker", ["exec", container, "sh", "-lc", `${envPrelude(envPath)}${loggedCommand(command, outputPath)}`], { onData, signal: commandSignal, timeoutMs });
    return { ...result, outputPath, logReference: { storage: "local", path: `${logRelative}/${path.posix.basename(outputPath)}` } };
  };

  const httpStatus = async (url) => {
    const probes = [
      ["python3", ["-c", PY_PROBE, url]],
      ["curl", ["-sS", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "10", url]],
      ["node", ["-e", NODE_PROBE, url]],
    ];
    for (const [program, args] of probes) {
      const result = await run("docker", ["exec", container, program, ...args], { timeoutMs: DOCKER_TIMEOUT_MS });
      const status = Number(String(result.output || "").trim().split("\n").pop());
      if (Number.isFinite(status) && status >= 100) return status;
    }
    return null;
  };

  return {
    kind: "docker",
    image,
    container,
    describe: () => `Docker · ${image}`,

    resource: () => ({ kind: "docker", container, runId, ownerToken }),

    async prepare() {
      if (disposed) throw new Error("This run has been disposed.");
      await structuredPaths.writeRepoFile(dataRoot, `${logRelative}/.run`, runId);
      await dockerVersion({ signal, execute });
      if (disposed || signal?.aborted) throw new Error("This run was stopped before container creation.");
      const created = await run("docker", [
        "run", "-d", "--rm",
        "--name", container,
        "--label", `com.archimedes.reproduction.run=${runId}`,
        "--label", `com.archimedes.reproduction.owner=${ownerToken}`,
        ...(limits.cpus ? ["--cpus", String(limits.cpus)] : []),
        ...(limits.memory ? ["--memory", String(limits.memory)] : []),
        ...(limits.pids ? ["--pids-limit", String(limits.pids)] : []),
        "-v", `${checkoutDir}:${MOUNT}`,
        "-v", `${logDirectory}:${targetLogDirectory}`,
        "-w", MOUNT,
        image, "sleep", "infinity",
      ], { timeoutMs: 120_000 });
      if (created.exitCode !== 0) {
        throw new Error(`Could not start the ${image} container: ${String(created.output || "").trim().slice(0, 400)}`);
      }
      if (envPath) await writeFile(envPath, envFileContent(secrets));
      return { image, container };
    },

    exec,
    httpStatus,

    writeFile,

    /** Structured writes do not inherit shell access to mounted host data. */
    writeRepoFile: (relativePath, content) => structuredPaths.writeRepoFile(checkoutDir, relativePath, content),
    readFile: relativePath => structuredPaths.readRepoFile(checkoutDir, relativePath),

    async dispose() {
      if (disposal) return disposal;
      disposed = true;
      disposal = (async () => {
        // A failed/pending docker run can already have created its named resource.
        // Inspect exact labels before removing; never sweep by a name prefix.
        const cleanupSignal = AbortSignal.timeout(10_000);
        const inspected = await execute("docker", ["inspect", "--format", "{{json .Config.Labels}}", container], { signal: cleanupSignal, timeoutMs: 10_000 });
        if (inspected.exitCode !== 0) {
          if (/No such (?:object|container)/i.test(inspected.output || "")) return;
          throw new Error(`Could not inspect this run's container for cleanup: ${String(inspected.output || inspected.error || "Docker unavailable").slice(-300)}`);
        }
        let labels;
        try { labels = JSON.parse(inspected.output.trim()); } catch { throw new Error("Docker ownership labels could not be read. The container was left untouched."); }
        if (labels?.["com.archimedes.reproduction.run"] !== runId || labels?.["com.archimedes.reproduction.owner"] !== ownerToken) throw new Error("The container belongs to a different run and was left untouched.");
        const removed = await execute("docker", ["rm", "-f", container], { signal: cleanupSignal, timeoutMs: 10_000 });
        if (removed.exitCode !== 0 && !/No such (?:object|container)/i.test(removed.output || "")) throw new Error("This run's container could not be removed.");
      })();
      return disposal;
    },
  };
}

module.exports = { createDockerBackend, dockerVersion, imageFor };
