const { getSharedEnvironment } = require("../environment-vault.cjs");
const { spawn, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const store = require("../store.cjs");
const { localIdentity } = require("../local-identity.cjs");
const { findActiveRun, listActiveRuns, registerActiveRun } = require("../runtime/active-runs.cjs");
const { inspectCodeState, createCodeSnapshot } = require("./code-snapshot.cjs");

const pendingCleanup = new Set();
const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);

function runScope(id) {
  return { workspace: store.currentStore().workspace, ownerId: localIdentity().userId, domain: "graph", id };
}

function shellFor(command) {
  if (process.platform === "win32") {
    return { shell: "cmd.exe", args: ["/d", "/s", "/c", command] };
  }
  return { shell: process.env.SHELL || (process.platform === "darwin" ? "/bin/zsh" : "/bin/sh"), args: ["-lc", command] };
}

function readCommit(cwd) {
  try {
    const value = execFileSync("git", ["-C", cwd, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return value || null;
  } catch {
    return null;
  }
}

function runDirectory(workspace, runId) {
  return path.join(workspace, ".archimedes", "experiment-runs", runId);
}

/**
 * Start a local experiment run.
 *
 * The run command is fixed once an experiment has a successful run: changing
 * the command would silently break comparability with the earlier result. A
 * failed-only experiment stays provisional and may be repaired with a new
 * command.
 */
function startExperimentRun(options) {
  const owner = store.captureStore();
  try {
    const started = owner.store.run(() => startInWorkspace(options));
    return { ...started, completion: started.completion.finally(owner.release) };
  } catch (error) {
    owner.release();
    throw error;
  }
}

function startInWorkspace({
  projectId,
  threadId,
  nodeId,
  command,
  cwd,
  workspace,
  experimentWorkspaceId = null,
  onUpdate = () => {},
} = {}) {
  const text = String(command || "").trim();
  if (!text) throw new Error("An experiment run requires a command.");
  if (text.length > 4_000) throw new Error("The experiment command is too long.");
  if (!workspace) throw new Error("A workspace is required to start an experiment run.");
  const runWorkspace = path.resolve(String(workspace));
  if (!fs.existsSync(runWorkspace) || !fs.statSync(runWorkspace).isDirectory()) {
    throw new Error("The workspace folder is no longer available.");
  }
  const runCwd = path.resolve(String(cwd || runWorkspace));
  if (!fs.existsSync(runCwd) || !fs.statSync(runCwd).isDirectory()) {
    throw new Error("The run folder is no longer available.");
  }

  const node = store.getResearchNode(nodeId);
  if (!node) throw new Error("Research node not found.");
  if (node.kind !== "experiment") throw new Error("Only an experiment node can start a run.");
  if (node.project_id !== projectId || node.thread_id !== threadId) {
    throw new Error("The experiment does not belong to this session.");
  }
  if (node.archived || node.status === "retracted") throw new Error("Restore the experiment before starting a run.");

  const existing = store.listExperimentRuns({ nodeId });
  if (existing.some((run) => !TERMINAL.has(run.status))) {
    throw new Error("This experiment already has a run in progress.");
  }
  const answered = existing.find((run) => run.status === "succeeded");
  if (answered && answered.command !== text) {
    throw new Error("The run command is fixed after a successful run. Create a next round to change it.");
  }

  if (experimentWorkspaceId) inspectCodeState(runWorkspace);

  const runId = randomUUID();
  const directory = runDirectory(runWorkspace, runId);
  fs.mkdirSync(directory, { recursive: true });
  const logPath = path.join(directory, "run.log");
  fs.writeFileSync(logPath, `$ ${text}\n\n`);

  let run;
  try {
    const codeSnapshot = experimentWorkspaceId ? createCodeSnapshot(runWorkspace, directory) : null;
    run = store.createExperimentRun({
      id: runId,
      projectId,
      threadId,
      nodeId,
      status: "starting",
      backend: "local",
      command: text,
      cwd: runCwd,
      commitSha: codeSnapshot?.commit || readCommit(runCwd),
      experimentWorkspaceId,
      codeSnapshot,
      logPath,
    });
  } catch (error) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  }
  onUpdate(run);

  const stream = fs.createWriteStream(logPath, { flags: "a" });
  let settled = false;
  let cancelled = false;
  let releaseRun;
  let finish;
  const completion = new Promise((resolve) => { finish = resolve; });

  const complete = (status, exitCode, error = "") => {
    if (settled) return;
    settled = true;
    stream.end(() => {
      let final = run;
      try {
        final = store.updateExperimentRun({
          runId,
          status,
          exitCode: exitCode == null ? null : exitCode,
          error,
        });
      } catch (cause) {
        console.warn("[experiment-run] could not record final status:", cause?.message || String(cause));
      }
      releaseRun?.();
      onUpdate(final);
      finish(final);
    });
  };

  const { shell, args } = shellFor(text);
  let child;
  try {
    child = spawn(shell, args, {
      cwd: runCwd,
      env: { ...process.env, ...getSharedEnvironment() },
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
      windowsHide: true,
    });
  } catch (error) {
    stream.write(`\n[process error] ${error.message}\n`);
    complete("failed", null, error.message);
    return { run, completion };
  }

  child.stdout.on("data", (chunk) => stream.write(chunk));
  child.stderr.on("data", (chunk) => stream.write(chunk));
  child.on("error", (error) => {
    stream.write(`\n[process error] ${error.message}\n`);
    complete("failed", null, error.message);
  });
  child.on("close", (code, signal) => {
    stream.write(`\n[process exited with code ${code ?? "unknown"}${signal ? `, signal ${signal}` : ""}]\n`);
    if (cancelled) complete("cancelled", code);
    else complete(code === 0 ? "succeeded" : "failed", code);
  });

  try {
    run = store.updateExperimentRun({ runId, status: "running", pid: child.pid ?? null });
    onUpdate(run);
  } catch (error) {
    complete("failed", null, error.message);
    return { run, completion };
  }

  releaseRun = registerActiveRun(runScope(runId), {
    completion,
    cancel: (force = false) => {
      if ((cancelled || settled) && !force) return;
      cancelled = true;
      if (!child.pid) return;
      if (process.platform === "win32") {
        const fallback = () => { try { child.kill("SIGKILL"); } catch { /* already exited */ } };
        try {
          const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
          const timer = setTimeout(() => { try { killer.kill(); } catch { /* already exited */ } fallback(); }, 2_000);
          timer.unref();
          killer.once("error", () => { clearTimeout(timer); fallback(); });
          killer.once("close", (code) => { clearTimeout(timer); if (code !== 0) fallback(); });
        } catch { fallback(); }
      } else {
        const killGroup = (signal) => {
          try { process.kill(-child.pid, signal); }
          catch { try { child.kill(signal); } catch { /* already exited */ } }
        };
        killGroup(force ? "SIGKILL" : "SIGTERM");
        if (force) return;
        // Workers may ignore SIGTERM or close their log pipes before exiting.
        // Keep escalation even after the shell's close event settles the run.
        const killRemaining = () => {
          clearTimeout(timer);
          killGroup("SIGKILL");
          pendingCleanup.delete(killRemaining);
        };
        const timer = setTimeout(killRemaining, 2_000);
        pendingCleanup.add(killRemaining);
        timer.unref();
      }
    },
  });
  return { run, completion };
}

function cancelExperimentRun(runId) {
  if (!runId) throw new Error("An experiment run id is required.");
  const run = store.getExperimentRun(runId);
  if (!run) throw new Error("Experiment run not found.");
  if (store.canAccessProject(run.project_id, "editor")) findActiveRun(runScope(runId))?.cancel();
  return run;
}

function shutdownExperimentRuns() {
  const activeRuns = listActiveRuns("graph");
  for (const active of activeRuns) {
    try {
      // The app may exit immediately; a delayed escalation would never fire.
      active.cancel(true);
    } catch {
      // The process may already be gone during app shutdown.
    }
  }
  // A cancelled shell may already have closed while a worker awaits escalation.
  for (const cleanup of pendingCleanup) cleanup();
  return Promise.allSettled(activeRuns.map(run => run.completion));
}

module.exports = {
  startExperimentRun,
  cancelExperimentRun,
  shutdownExperimentRuns,
  runDirectory,
};
