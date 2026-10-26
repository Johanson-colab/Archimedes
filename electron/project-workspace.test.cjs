const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const store = require("./store.cjs");

function closeStore() {
  // Windows keeps SQLite handles open, so release the test workspace first.
  const idle = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-project-idle-"));
  store.openWorkspace(idle);
  return idle;
}

function makeRoots() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-project-"));
  const primary = path.join(root, "primary");
  const projectFolder = path.join(root, "project");
  const nextFolder = path.join(root, "next");
  for (const folder of [primary, projectFolder, nextFolder]) fs.mkdirSync(folder, { recursive: true });
  return { root, primary, projectFolder, nextFolder };
}

test("projects bind directories and new sessions inherit the project folder", () => {
  const { root, primary, projectFolder, nextFolder } = makeRoots();
  try {
    store.openWorkspace(primary);
    const project = store.createResearchProject({ name: "Bound project", workspacePath: projectFolder });
    assert.equal(project.workspace_path, path.resolve(projectFolder));

    const thread = store.createResearchThread({ prompt: "First bound chat", mode: "idea-spark", projectId: project.id });
    assert.equal(thread.workspace_path, path.resolve(projectFolder));
    assert.equal(store.getResearchThread(thread.id).workspace_path, path.resolve(projectFolder));

    // Rebinding a project changes the default for new chats without silently
    // moving work that already ran in the previous folder.
    const updated = store.setResearchProjectWorkspace(project.id, nextFolder);
    assert.equal(updated.workspace_path, path.resolve(nextFolder));
    const nextThread = store.createResearchThread({ prompt: "Second bound chat", mode: "idea-spark", projectId: project.id });
    assert.equal(nextThread.workspace_path, path.resolve(nextFolder));
    assert.equal(store.getResearchThread(thread.id).workspace_path, path.resolve(projectFolder));
  } finally {
    closeStore();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("legacy projects adopt the primary workspace and reject missing folders", () => {
  const { root, primary } = makeRoots();
  try {
    store.openWorkspace(primary);
    const project = store.createResearchProject({ name: "Legacy project" });
    assert.equal(project.workspace_path, path.resolve(primary));
    assert.throws(() => store.createResearchProject({ name: "Missing", workspacePath: path.join(root, "missing") }), /project folder/i);
    assert.throws(() => store.setResearchProjectWorkspace(project.id, path.join(root, "missing")), /project folder/i);
  } finally {
    closeStore();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("thread summaries expose pending approvals for the review filter", () => {
  const { root, primary } = makeRoots();
  try {
    store.openWorkspace(primary);
    const project = store.createResearchProject({ name: "Review queue" });
    const thread = store.createResearchThread({ prompt: "Draft a note", mode: "paper-generation", projectId: project.id });
    const task = store.startTask({ prompt: "Draft a note" });
    store.startResearchTurn({ threadId: thread.id, taskId: task.id, prompt: "Draft a note", mode: "paper-generation" });
    const action = store.createAction({ taskId: task.id, kind: "write", payload: { path: "notes/draft.md", content: "# Draft\n" } });

    const pending = store.listResearchThreads().find((candidate) => candidate.id === thread.id);
    assert.equal(pending.pending_actions, 1);
    assert.equal(store.getResearchThread(thread.id).pending_actions, 1);

    store.resolveAction(action.id, "approved");
    const resolved = store.listResearchThreads().find((candidate) => candidate.id === thread.id);
    assert.equal(resolved.pending_actions, 0);
    assert.equal(store.getResearchThread(thread.id).pending_actions, 0);
  } finally {
    closeStore();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
