const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const store = require("./store.cjs");
const graph = require("./research-graph/service.cjs");
const runner = require("./research-graph/experiment-runner.cjs");

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function eventually(check, message) {
  const deadline = Date.now() + 6_000;
  while (Date.now() < deadline) {
    if (check()) return;
    await pause(25);
  }
  assert.fail(message);
}

function alive(pid) {
  // Linux containers may leave an orphaned zombie until their init reaps it.
  // A zombie cannot execute or hold a log pipe open.
  if (process.platform === "linux") {
    try { if (/^\d+ \(.*\) Z /.test(fs.readFileSync(`/proc/${pid}/stat`, "utf8"))) return false; }
    catch (error) { if (error.code === "ENOENT") return false; throw error; }
  }
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === "ESRCH") return false; throw error; }
}

for (const { name, ignoreTerm, stdio, shutdown, stopThenShutdown } of [
  { name: "cancel stops a run's descendant process", ignoreTerm: false, stdio: "inherit" },
  { name: "cancel escalates when a descendant ignores SIGTERM and holds log pipes", ignoreTerm: true, stdio: "inherit" },
  { name: "cancel kills a stubborn descendant after the shell and log pipes close", ignoreTerm: true, stdio: "ignore" },
  { name: "shutdown immediately kills a stubborn descendant", ignoreTerm: true, stdio: "ignore", shutdown: true },
  { name: "shutdown flushes pending cleanup after a cancelled shell closes", ignoreTerm: true, stdio: "ignore", stopThenShutdown: true },
]) {
  test(name, { skip: process.platform === "win32" ? "POSIX process-group regression" : false }, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-run-cancel-"));
    let started;
    let workerPid;
    let final;
    try {
      store.openWorkspace(root);
      const project = store.createResearchProject({ name: "Cancellation audit" });
      const thread = store.createResearchThread({ projectId: project.id, prompt: "Cancel a training process", mode: "research" });
      const question = graph.createNode({ projectId: project.id, threadId: thread.id, kind: "question", title: "Can training be stopped?", content: {} });
      const idea = graph.createNode({ projectId: project.id, threadId: thread.id, kind: "idea", title: "Managed cancellation stops workers", content: {}, parents: [{ nodeId: question.id }] });
      const experiment = graph.createNode({ projectId: project.id, threadId: thread.id, kind: "experiment", title: "Training worker lifecycle", content: {}, parents: [{ nodeId: idea.id }] });
      fs.writeFileSync(path.join(root, "worker.cjs"), [
        'const fs = require("node:fs");',
        ignoreTerm ? 'process.on("SIGTERM", () => {});' : "",
        'fs.writeFileSync("worker.pid", String(process.pid));',
        'console.log("worker-ready");',
        'setInterval(() => {}, 1000);',
      ].join("\n"));
      fs.writeFileSync(path.join(root, "train.cjs"), `require("node:child_process").spawn(process.execPath, ["worker.cjs"], { stdio: ${JSON.stringify(stdio)} });\n`);
      started = await runner.startExperimentRun({ projectId: project.id, threadId: thread.id, nodeId: experiment.id, workspace: root, cwd: root,
        command: `'${process.execPath.replaceAll("'", "'\\''")}' train.cjs` });
      started.completion.then((run) => { final = run; });
      await eventually(() => fs.existsSync(path.join(root, "worker.pid")), "worker never started");
      workerPid = Number(fs.readFileSync(path.join(root, "worker.pid"), "utf8"));
      assert.ok(alive(workerPid));
      if (shutdown) runner.shutdownExperimentRuns();
      else {
        runner.cancelExperimentRun(started.run.id);
        runner.cancelExperimentRun(started.run.id); // Repeated Stop must be harmless.
      }
      if (stopThenShutdown) {
        await eventually(() => final, "shell never closed before shutdown");
        assert.ok(alive(workerPid), "fixture must exercise pending descendant cleanup");
        runner.shutdownExperimentRuns();
      }
      await eventually(() => !alive(workerPid), "cancel left a training worker running");
      await eventually(() => final, "cancel never completed the run");
      assert.equal(final.status, "cancelled");
      assert.ok(final.ended_at);
      assert.equal(store.getExperimentRun(final.id).status, "cancelled");
      assert.match(fs.readFileSync(final.log_path, "utf8"), /process exited/);
      assert.equal(runner.cancelExperimentRun(final.id).status, "cancelled");
    } finally {
      // Clean up only PIDs created by this fixture, even against the broken runner.
      if (workerPid) { try { process.kill(workerPid, "SIGKILL"); } catch {} }
      if (started) {
        const run = store.getExperimentRun(started.run.id);
        if (run?.pid) { try { process.kill(run.pid, "SIGKILL"); } catch {} }
        await started.completion;
      }
      const idle = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-cancel-idle-"));
      store.openWorkspace(idle);
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(idle, { recursive: true, force: true });
    }
  });
}
