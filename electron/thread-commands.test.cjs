const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const store = require("./store.cjs");
const { conversationMarkdown, registerThreadCommands, summarizeConversation, workspaceInstructions } = require("./thread-commands.cjs");

const idle = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-commands-idle-"));
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-commands-"));
  store.openWorkspace(root);
  t.after(() => { store.openWorkspace(idle); fs.rmSync(root, { recursive: true, force: true }); });
  const thread = store.createResearchThread({ prompt: "Research notes", mode: "free-chat", visibility: "private" });
  return { root, thread };
}
function addTurn(threadId, prompt, response) {
  const task = store.startTask({ prompt });
  const turn = store.startResearchTurn({ threadId, taskId: task.id, prompt, mode: "free-chat" });
  store.finishTask(task.id, { response, status: "completed" });
  store.finishResearchTurn(turn.id, { response });
  return turn;
}

test("fork persists a separate history with remapped events, visibility and compaction boundary", (t) => {
  const { root, thread } = fixture(t);
  const first = addTurn(thread.id, "Use dataset A", "Measured accuracy: 0.85");
  store.compactResearchThread(thread.id, "Dataset A: accuracy 0.85", first.id);
  addTurn(thread.id, "Try dataset B", "Pending experiment");
  const fork = store.forkResearchThread(thread.id);
  assert.notEqual(fork.id, thread.id);
  assert.equal(fork.visibility, "private");
  assert.equal(fork.workspace_path, root);
  assert.equal(fork.turns.length, 2);
  assert.ok(fork.turns.every((turn) => turn.task_id === null));
  assert.notEqual(fork.turns[0].id, first.id);
  assert.equal(fork.context_summary_through_turn_id, fork.turns[0].id);
  assert.ok(fork.events.every((event) => fork.turns.some((turn) => turn.id === event.turn_id)));
  addTurn(fork.id, "Only in fork", "Separate answer");
  assert.equal(store.getResearchThread(thread.id).turns.length, 2);
  store.openWorkspace(idle);
  store.openWorkspace(root);
  assert.equal(store.getResearchThread(fork.id).turns.length, 3);
  assert.equal(store.getResearchThreadContext(fork.id).turns.length, 2);
});

test("undo persists the shortened thread and a private recoverable backup without touching files", (t) => {
  const { root, thread } = fixture(t);
  addTurn(thread.id, "First", "First answer");
  const last = addTurn(thread.id, "Revise this", "Last answer");
  store.compactResearchThread(thread.id, "Last answer", last.id);
  fs.writeFileSync(path.join(root, "result.txt"), "keep this file");
  const result = store.undoResearchTurn(thread.id);
  assert.equal(result.prompt, "Revise this");
  assert.equal(result.thread.turns.length, 1);
  assert.equal(result.thread.context_summary, "");
  assert.equal(result.thread.events.some((event) => event.turn_id === last.id), false);
  const backup = store.getResearchThread(result.backupThreadId);
  assert.ok(backup.archived_at);
  assert.equal(backup.visibility, "private");
  assert.deepEqual(backup.turns.map((turn) => turn.user_message), ["First", "Revise this"]);
  assert.equal(fs.readFileSync(path.join(root, "result.txt"), "utf8"), "keep this file");
  store.openWorkspace(idle);
  store.openWorkspace(root);
  assert.equal(store.getResearchThread(thread.id).turns.length, 1);
  assert.equal(store.getResearchThread(result.backupThreadId).turns.length, 2);
});

test("manual compaction replaces only model context and includes future turns exactly once", (t) => {
  const { thread } = fixture(t);
  const first = addTurn(thread.id, "Old context", "Old answer");
  store.compactResearchThread(thread.id, "Durable summary", first.id);
  assert.equal(store.getResearchThread(thread.id).messages.length, 2);
  assert.deepEqual(store.getResearchThreadContext(thread.id).turns, []);
  const next = addTurn(thread.id, "New context", "New answer");
  assert.equal(store.getResearchThreadContext(thread.id).turns[0].id, next.id);
  assert.throws(() => store.compactResearchThread(thread.id, "Stale summary", first.id), /changed during compaction/);
  assert.equal(store.getResearchThread(thread.id).context_summary, "Durable summary");
});

test("running turns and empty history cannot be undone or compacted", (t) => {
  const { thread } = fixture(t);
  assert.throws(() => store.undoResearchTurn(thread.id), /no turn/);
  const task = store.startTask({ prompt: "Running" });
  store.startResearchTurn({ threadId: thread.id, taskId: task.id, prompt: "Running", mode: "free-chat" });
  assert.throws(() => store.undoResearchTurn(thread.id), /running/);
  assert.throws(() => store.forkResearchThread(thread.id), /running/);
  assert.throws(() => store.compactResearchThread(thread.id, "Summary", "invalid"), /running/);
});

test("compaction summarizes all chunks and preserves the previous summary", async () => {
  const inputs = [];
  const result = await summarizeConversation({ context_summary: "existing decisions", turns: [{ user_message: "x".repeat(45_000), assistant_message: "TAIL_EVIDENCE" }] }, async (_config, messages, options) => {
    inputs.push(messages[1].content);
    assert.equal(options.allowTools, false);
    return { content: `summary ${inputs.length}` };
  }, { apiKey: "test" });
  assert.match(inputs[0], /existing decisions/);
  assert.ok(inputs.some((input) => input.includes("TAIL_EVIDENCE")));
  assert.equal(inputs.length, 3);
  assert.equal(result, "summary 3");
  await assert.rejects(summarizeConversation({ turns: [{}] }, async () => ({ content: "" }), { apiKey: "test" }), /empty or oversized/);
  await assert.rejects(summarizeConversation({ turns: [] }, async () => ({}), { apiKey: "test" }), /no new/);
});

test("Init loads workspace instructions and rejects an AGENTS.md symlink escaping the project", (t) => {
  const { root } = fixture(t);
  assert.equal(workspaceInstructions(root), "");
  fs.writeFileSync(path.join(root, "AGENTS.md"), "Use npm test. Preserve drafts.");
  assert.equal(workspaceInstructions(root), "Use npm test. Preserve drafts.");
  const external = path.join(idle, "instructions.md");
  fs.writeFileSync(external, "external instructions");
  fs.unlinkSync(path.join(root, "AGENTS.md"));
  fs.symlinkSync(external, path.join(root, "AGENTS.md"));
  assert.throws(() => workspaceInstructions(root), /outside/);
});

test("Markdown export includes full messages and source URLs", () => {
  const markdown = conversationMarkdown({ title: "Results", turns: [{ id: "t1", created_at: "2026-11-02", user_message: "Question", assistant_message: "Answer" }], messages: [{ turn_id: "t1", role: "assistant", sources: [{ title: "Source", url: "https://example.com/paper" }] }] });
  for (const text of ["# Results", "Question", "Answer", "https://example.com/paper"]) assert.ok(markdown.includes(text));
});

test("IPC exports Markdown or JSON and canceling the dialog writes nothing", async (t) => {
  const { root, thread } = fixture(t);
  addTurn(thread.id, "Keep this question", "Keep this answer");
  const handlers = new Map();
  let destination = { canceled: true };
  registerThreadCommands({ ipcMain: { handle: (name, handler) => handlers.set(name, handler) }, store, agent: {}, modelConfig: {}, dialog: { showSaveDialog: async () => destination }, BrowserWindow: { fromWebContents: () => undefined }, dataWorkspace: () => root });
  const input = { threadId: thread.id };
  assert.deepEqual(await handlers.get("research-thread:export")({ sender: {} }, input), { canceled: true });
  for (const extension of ["md", "json"]) {
    const filePath = path.join(root, `export.${extension}`);
    destination = { canceled: false, filePath };
    const result = await handlers.get("research-thread:export")({ sender: {} }, input);
    assert.equal(result.path, filePath);
    const text = fs.readFileSync(filePath, "utf8");
    assert.match(text, /Keep this question/);
    if (extension === "json") assert.equal(JSON.parse(text).thread.id, thread.id);
  }
});

test("a rejected or stale model summary never replaces stored history", async (t) => {
  const { root, thread } = fixture(t);
  addTurn(thread.id, "Original", "Original answer");
  const handlers = new Map();
  registerThreadCommands({ ipcMain: { handle: (name, handler) => handlers.set(name, handler) }, store, agent: { complete: async () => { addTurn(thread.id, "Arrived while summarizing", "New answer"); return { content: "Summary" }; } }, modelConfig: { getActiveModelConfig: () => ({ apiKey: "test" }) }, dataWorkspace: () => root });
  await assert.rejects(handlers.get("research-thread:compact")({}, { threadId: thread.id }), /changed during compaction/);
  assert.equal(store.getResearchThread(thread.id).context_summary, "");
  assert.equal(store.getResearchThread(thread.id).turns.length, 2);
});
