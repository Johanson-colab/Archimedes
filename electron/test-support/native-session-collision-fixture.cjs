const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const store = require("../store.cjs");
const agent = require("../agent.cjs");
const codex = require("../agent/codex-backend.cjs");

const warning = "Another workspace is using this Codex conversation. Wait for its active turn to finish.";
const nativeId = "fixture-session";

async function saveCollision(root) {
  const original = path.join(root, "Original");
  const copy = path.join(root, "Copy");
  const workspace = path.join(root, "Execution");
  for (const folder of [original, copy, workspace]) fs.mkdirSync(folder);
  const seed = store.createWorkspaceStore(original);
  const thread = seed.createResearchThread({ prompt: warning, title: "Native collision fixture", workspacePath: workspace, mode: "standard" });
  seed.renameProjectWorkspace(thread.workspace_id, "Execution");
  const task = seed.startTask({ prompt: warning });
  const turn = seed.startResearchTurn({ threadId: thread.id, taskId: task.id, prompt: warning, mode: "standard" });
  seed.finishTask(task.id, { response: warning, status: "completed" });
  seed.finishResearchTurn(turn.id, { response: warning, status: "completed" });
  seed.nativeAgentBindings(thread.id).save({ native_thread_id: nativeId, workspace, model: "", last_turn_id: turn.id });
  seed.close();
  fs.cpSync(path.join(original, ".archimedes"), path.join(copy, ".archimedes"), { recursive: true });

  let ready;
  const accepted = new Promise(resolve => { ready = resolve; });
  class Client extends EventEmitter {
    async start() {}
    async request(method) {
      if (method === "account/read") return { account: {} };
      if (method === "thread/resume") return { thread: { id: nativeId } };
      if (method === "turn/start") {
        setImmediate(() => ready(this));
        return { turn: { id: "fixture-turn" } };
      }
      return {};
    }
    close() {}
  }
  const originalRunCodex = codex.runCodex;
  codex.runCodex = (options) => originalRunCodex({ ...options, Client, timeoutMs: 5_000 });
  const controller = new AbortController();
  const run = (home) => agent.runAgent({
    prompt: "Continue in the copied session", workspace, threadId: thread.id, origin: "research",
    capabilities: { write: "ask", command: "ask" }, autoBuildGraph: false,
    externalBackend: { backend: "codex", binary: "fixture", model: "", permissionMode: "read-only" },
    externalSignal: controller.signal, dataStore: store.createWorkspaceStore(home),
  });
  const running = run(original);
  try {
    await Promise.race([accepted, running.then(({ response }) => { throw new Error(`The first fixture turn ended early: ${response}`); })]);
    return { copy, threadId: thread.id, failure: await run(copy) };
  } finally {
    controller.abort();
    try { await running; }
    finally { codex.runCodex = originalRunCodex; }
  }
}

module.exports = { saveCollision, warning };
