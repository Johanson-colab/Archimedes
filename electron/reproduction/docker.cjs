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

const { spawn } = require("node:child_process");
const fsp = require("node:fs/promises");
const path = require("node:path");

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

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

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

function runProcess(command, args, { cwd, onData, signal, timeoutMs } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    const collected = [];
    let timer = null;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ ...result, output: collected.join("") });
    };

    let child;
    try {
      child = spawn(command, args, { cwd, shell: false, windowsHide: true });
    } catch (error) {
      finish({ exitCode: null, error: error?.message || `${command} could not start`, timedOut: false });
      return;
    }

    const push = (chunk) => {
      const text = chunk.toString();
      collected.push(text);
      onData?.(text);
    };

    child.stdout.on("data", push);
    child.stderr.on("data", push);
    child.once("error", (error) => finish({ exitCode: null, error: error?.message || `${command} failed`, timedOut }));
    child.once("close", (code) => finish({ exitCode: code, timedOut }));

    if (signal) {
      if (signal.aborted) {
        child.kill("SIGKILL");
      } else {
        signal.addEventListener("abort", () => child.kill("SIGKILL"), { once: true });
      }
    }

    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, timeoutMs);
    }
  });
}

async function dockerVersion() {
  const result = await runProcess("docker", ["info", "--format", "{{.ServerVersion}}"], { timeoutMs: DOCKER_TIMEOUT_MS });
  if (result.exitCode !== 0) {
    const hint = String(result.output || "").trim().split("\n").slice(-1)[0] || "Docker did not answer.";
    throw new Error(`Docker is not available: ${hint}. Start Docker Desktop and run this again.`);
  }
  return String(result.output || "").trim();
}

function createDockerBackend({ checkoutDir, environment = {}, name } = {}) {
  if (!checkoutDir) throw new Error("A Docker backend needs a checkout directory.");
  const image = imageFor(environment);
  const container = name || `archimedes-repro-${Math.random().toString(36).slice(2, 10)}`;
  let prepared = false;

  const exec = async (command, { timeoutMs, onData, signal } = {}) => {
    const result = await runProcess("docker", ["exec", container, "sh", "-lc", command], { onData, signal, timeoutMs });
    return { exitCode: result.exitCode, timedOut: result.timedOut, error: result.error };
  };

  const httpStatus = async (url) => {
    const probes = [
      ["python3", ["-c", PY_PROBE, url]],
      ["curl", ["-sS", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "10", url]],
      ["node", ["-e", NODE_PROBE, url]],
    ];
    for (const [program, args] of probes) {
      const result = await runProcess("docker", ["exec", container, program, ...args], { timeoutMs: DOCKER_TIMEOUT_MS });
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

    async prepare() {
      await dockerVersion();
      const created = await runProcess("docker", [
        "run", "-d", "--rm",
        "--name", container,
        "-v", `${checkoutDir}:${MOUNT}`,
        "-w", MOUNT,
        image, "sleep", "infinity",
      ], { timeoutMs: 120_000 });
      if (created.exitCode !== 0) {
        throw new Error(`Could not start the ${image} container: ${String(created.output || "").trim().slice(0, 400)}`);
      }
      prepared = true;
      return { image, container };
    },

    exec,
    httpStatus,

    async readFile(relativePath) {
      const target = path.resolve(checkoutDir, String(relativePath || ""));
      if (!isWithin(checkoutDir, target)) throw new Error("The checked path is outside the checkout.");
      try {
        return await fsp.readFile(target, "utf8");
      } catch (error) {
        if (error?.code === "ENOENT" || error?.code === "EISDIR") return null;
        throw error;
      }
    },

    async dispose() {
      if (!prepared) return;
      prepared = false;
      await runProcess("docker", ["rm", "-f", container], { timeoutMs: 30_000 });
    },
  };
}

module.exports = { createDockerBackend, dockerVersion, imageFor };
