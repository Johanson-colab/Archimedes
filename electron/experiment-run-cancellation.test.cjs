const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const test = require("node:test");
const store = require("./store.cjs");
const graph = require("./research-graph/service.cjs");
const runner = require("./research-graph/experiment-runner.cjs");
const { findActiveRun, hasActiveRun, installQuitGuard, registerActiveRun } = require("./runtime/active-runs.cjs");

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

test("run ownership distinguishes data directories, domains, and principals", () => {
  const scope = { workspace: "/fixture/a", store: {}, domain: "graph", id: "same", ownerId: "owner" };
  const first = { cancel() {} }, replacement = { cancel() {} };
  const release = registerActiveRun(scope, first);
  try {
    assert.equal(findActiveRun(scope), first);
    assert.equal(findActiveRun({ ...scope, workspace: "/fixture/b" }), undefined);
    assert.equal(findActiveRun({ ...scope, store: {} }), undefined);
    assert.equal(findActiveRun({ ...scope, ownerId: "viewer" }), undefined);
    assert.equal(findActiveRun({ ...scope, domain: "reproduction" }), undefined);
    assert.equal(hasActiveRun({ ...scope, ownerId: "viewer" }), true);
    release();
    const releaseReplacement = registerActiveRun(scope, replacement);
    try {
      release();
      assert.equal(findActiveRun(scope), replacement);
    } finally { releaseReplacement(); }
  } finally { release(); }
});

test("a Graph run still preparing Git metadata cannot start after accepted quit", async () => {
  const source = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
  const start = source.indexOf('  ipcMain.handle("experiment-run:start",');
  const end = source.indexOf('  ipcMain.handle("experiment-run:cancel",', start);
  let handler, startProcess = 0, completeGit;
  const gitProbe = new Promise(resolve => { completeGit = resolve; });
  const scope = {
    ipcMain: { handle: (_channel, callback) => { handler = callback; } },
    stoppingResearch: false,
    resolveWorkspace: value => value,
    experimentRunner: {
      async startExperimentRun(input) {
        await gitProbe;
        input.verifyStart?.();
        startProcess++;
        return { run: { id: "fixture" } };
      },
    },
  };
  new Function("scope", `with (scope) { ${source.slice(start, end)} }`)(scope);
  const pending = handler({ sender: { isDestroyed: () => false } }, { workspace: "/fixture" });
  scope.stoppingResearch = true;
  completeGit();
  await assert.rejects(pending, /Archimedes is quitting/);
  assert.equal(startProcess, 0);
});

test("native quit confirmation keeps work on cancel and exits once after confirmed cleanup", async () => {
  const app = new EventEmitter();
  let dialogs = 0, stopped = 0, quit = 0, work = true, windowCanClose = false, respond;
  const beforeQuit = () => {
    const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    app.emit("before-quit", event);
    if (event.defaultPrevented || !windowCanClose) return;
    app.emit("will-quit", event);
    if (!event.defaultPrevented) quit++;
  };
  app.quit = beforeQuit;
  const dialog = { showMessageBox: ({ buttons }) => {
    assert.deepEqual(buttons, ["Keep running", "Stop and quit"]);
    dialogs++;
    return new Promise(resolve => { respond = response => resolve({ response }); });
  } };
  installQuitGuard({ app, dialog, hasWork: () => work, stopWork: () => { stopped++; work = false; } });
  beforeQuit(); beforeQuit();
  assert.equal(dialogs, 1);
  respond(0);
  await pause(0);
  assert.deepEqual({ stopped, quit, work }, { stopped: 0, quit: 0, work: true });
  beforeQuit(); beforeQuit();
  respond(1);
  await pause(0);
  assert.deepEqual({ stopped, quit, work }, { stopped: 0, quit: 0, work: true });
  windowCanClose = true;
  beforeQuit(); beforeQuit();
  respond(1);
  await eventually(() => quit === 1, "quit did not finish");
  assert.deepEqual({ dialogs, stopped, quit, work }, { dialogs: 3, stopped: 1, quit: 1, work: false });
});

test("main quit guard localizes cancellation, restores the window and awaits App-only validation", async () => {
  const source = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
  const start = source.indexOf("const QUIT_DIALOG_COPY");
  const guard = source.indexOf("installQuitGuard({ app, dialog,", start);
  const end = source.indexOf("\n});", guard) + 4;
  assert.ok(start >= 0 && guard > start && end > guard, "quit guard wiring was not found");
  const app = new EventEmitter();
  let response = 0, validation = true, windowCount = 0, restored = 0, dialogs = 0, shutdownStarted = 0, quits = 0, releaseValidation;
  let dialogOptions;
  const beforeQuit = () => {
    const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    app.emit("before-quit", event);
    if (event.defaultPrevented) return;
    app.emit("will-quit", event);
    if (!event.defaultPrevented) quits++;
  };
  app.quit = beforeQuit;
  const dialog = { showMessageBox: async options => { dialogs++; dialogOptions = options; return { response }; } };
  const researchAppDelivery = {
    hasActiveValidation: () => validation,
    shutdown: async () => { shutdownStarted++; await new Promise(resolve => { releaseValidation = resolve; }); validation = false; },
  };
  new Function("installQuitGuard", "app", "dialog", "uiLanguage", "BrowserWindow", "createWindow", "startupWorkspace",
    "listActiveRuns", "agent", "store", "researchAppRuntime", "researchAppDelivery", "experimentRunner", "stoppingResearch", source.slice(start, end))(
    installQuitGuard, app, dialog, "zh", { getAllWindows: () => Array.from({ length: windowCount }) },
    () => { windowCount++; restored++; }, () => null, () => [],
    { hasActiveAgentRuns: () => false, shutdownAgentRuns: async () => {} }, { hasPendingWorkspaceMutations: () => false },
    { hasRunningApps: () => false, shutdown: async () => {} }, researchAppDelivery,
    { shutdownExperimentRuns: async () => {} }, false,
  );
  beforeQuit();
  await eventually(() => restored === 1, "cancelled quit did not restore a window");
  assert.deepEqual({ dialogs, shutdownStarted, quits, validation }, { dialogs: 1, shutdownStarted: 0, quits: 0, validation: true });
  assert.equal(dialogOptions.message, "研究任务仍在运行");
  assert.equal(dialogOptions.detail, "停止正在运行的工作并退出 Archimedes？");
  assert.deepEqual(dialogOptions.buttons, ["保持运行", "停止并退出"]);
  response = 1;
  beforeQuit();
  await eventually(() => shutdownStarted === 1, "App-only validation did not start shutdown");
  assert.equal(quits, 0, "quit completed before validation cleanup");
  releaseValidation();
  await eventually(() => quits === 1, "quit did not finish after validation cleanup");
  assert.equal(validation, false);
});

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
