const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { spawnSync } = require("node:child_process");
const store = require("./store.cjs");
const nameLibrary = require("../shared/workspace-names.json");

function closeStore() {
  const idle = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-model-idle-"));
  store.openWorkspace(idle);
  return idle;
}

function makeRoots(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `archimedes-model-${name}-`));
  const primary = path.join(root, "primary");
  const projectFolder = path.join(root, "project");
  for (const folder of [primary, projectFolder]) fs.mkdirSync(folder, { recursive: true });
  return { root, primary, projectFolder };
}

function runGit(root, ...args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
}

function initRepo(folder) {
  runGit(folder, "init");
  runGit(folder, "config", "user.email", "test@example.com");
  runGit(folder, "config", "user.name", "Test");
  fs.writeFileSync(path.join(folder, "README.md"), "# Project\n");
  runGit(folder, "add", "README.md");
  runGit(folder, "commit", "-m", "Initial commit");
}

test("opening an existing database attaches projects and sessions to a shared workspace", () => {
  const { root, primary, projectFolder } = makeRoots("migrate");
  try {
    store.openWorkspace(primary);
    const project = store.createResearchProject({ name: "Migrated project", workspacePath: projectFolder });
    const thread = store.createResearchThread({ prompt: "Old session", mode: "free-chat", projectId: project.id });
    const shared = store.defaultProjectWorkspace(project.id);
    assert.ok(shared);
    assert.equal(shared.kind, "shared");
    assert.ok(nameLibrary.some((entry) => entry.name === shared.name));
    assert.equal(shared.root, path.resolve(projectFolder));
    assert.equal(shared.is_default, true);
    assert.equal(store.getResearchThread(thread.id).workspace_id, shared.id);

    // Simulate a pre-naming database, then verify reopening backfills only the
    // blank default name without detaching sessions or duplicating the row.
    const idle = path.join(root, "idle");
    fs.mkdirSync(idle);
    store.openWorkspace(idle);
    const legacyDb = new DatabaseSync(path.join(primary, ".archimedes", "archimedes.db"));
    legacyDb.prepare("UPDATE project_workspaces SET name = '' WHERE id = ?").run(shared.id);
    legacyDb.close();
    store.openWorkspace(primary);
    const renamedShared = store.defaultProjectWorkspace(project.id);
    assert.ok(nameLibrary.some((entry) => entry.name === renamedShared.name));
    assert.equal(store.getResearchThread(thread.id).workspace_id, shared.id);
    store.openWorkspace(root);
    store.openWorkspace(primary);
    const workspaces = store.listProjectWorkspaces(project.id);
    assert.equal(workspaces.filter((item) => item.kind === "shared").length, 1);
    assert.equal(store.defaultProjectWorkspace(project.id).name, renamedShared.name);
    assert.equal(store.getResearchThread(thread.id).workspace_id, shared.id);
  } finally {
    closeStore();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("sessions are filtered by workspace and can be pinned and marked viewed", () => {
  const { root, primary, projectFolder } = makeRoots("filter");
  try {
    store.openWorkspace(primary);
    const project = store.createResearchProject({ name: "Workspace filter", workspacePath: projectFolder });
    const shared = store.defaultProjectWorkspace(project.id);
    assert.ok(nameLibrary.some((entry) => entry.name === shared.name));
    const sandbox = store.createProjectWorkspace({ projectId: project.id, kind: "sandbox" });
    assert.ok(nameLibrary.some((entry) => entry.name === sandbox.name));
    assert.notEqual(sandbox.name, shared.name);
    const secondSandbox = store.createProjectWorkspace({ projectId: project.id, kind: "sandbox" });
    assert.ok(nameLibrary.some((entry) => entry.name === secondSandbox.name));
    assert.notEqual(secondSandbox.name, sandbox.name);
    store.deleteProjectWorkspace(secondSandbox.id);
    const sharedThread = store.createResearchThread({ prompt: "Shared work", mode: "free-chat", projectId: project.id });
    const sandboxThread = store.createResearchThread({
      prompt: "Sandbox work",
      mode: "free-chat",
      projectId: project.id,
      workspaceId: sandbox.id,
    });
    assert.equal(sandboxThread.workspace_path, sandbox.root);
    assert.deepEqual(
      store.listResearchThreads({ projectId: project.id, workspaceId: shared.id }).map((item) => item.id),
      [sharedThread.id],
    );
    assert.deepEqual(
      store.listResearchThreads({ projectId: project.id, workspaceId: sandbox.id }).map((item) => item.id),
      [sandboxThread.id],
    );

    const pinned = store.pinResearchThread(sharedThread.id, true);
    assert.equal(Number(pinned.pinned), 1);
    assert.equal(Number(store.pinResearchThread(sharedThread.id, false).pinned), 0);

    const viewed = store.markResearchThreadViewed(sharedThread.id);
    assert.equal(viewed.unread_count, 0);
    assert.ok(viewed.last_viewed_at);
    assert.equal(store.getResearchThread(sharedThread.id).last_viewed_at, viewed.last_viewed_at);
  } finally {
    closeStore();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("sandboxes copy project files without caches or app data", () => {
  const { root, primary, projectFolder } = makeRoots("sandbox");
  try {
    fs.writeFileSync(path.join(projectFolder, "notes.md"), "# Notes\n");
    fs.mkdirSync(path.join(projectFolder, "node_modules"), { recursive: true });
    fs.writeFileSync(path.join(projectFolder, "node_modules", "ignored.js"), "ignored");
    fs.mkdirSync(path.join(projectFolder, ".archimedes"), { recursive: true });
    fs.writeFileSync(path.join(projectFolder, ".archimedes", "archimedes.db"), "db");
    store.openWorkspace(primary);
    const project = store.createResearchProject({ name: "Sandbox project", workspacePath: projectFolder });
    const sandbox = store.createProjectWorkspace({ projectId: project.id, kind: "sandbox" });
    assert.equal(sandbox.kind, "sandbox");
    assert.equal(fs.existsSync(path.join(sandbox.root, "notes.md")), true);
    assert.equal(fs.existsSync(path.join(sandbox.root, "node_modules")), false);
    assert.equal(fs.existsSync(path.join(sandbox.root, ".archimedes")), false);

    const thread = store.createResearchThread({
      prompt: "Isolated work",
      mode: "free-chat",
      projectId: project.id,
      workspaceId: sandbox.id,
    });
    assert.equal(thread.workspace_path, sandbox.root);
    const deleted = store.deleteProjectWorkspace(sandbox.id);
    assert.equal(deleted.deleted, true);
    assert.equal(fs.existsSync(sandbox.root), false);
    assert.equal(store.getResearchThread(thread.id).workspace_id, store.defaultProjectWorkspace(project.id).id);
  } finally {
    closeStore();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("workspaces accept a user name and can be renamed later", () => {
  const { root, primary, projectFolder } = makeRoots("rename");
  try {
    store.openWorkspace(primary);
    const project = store.createResearchProject({ name: "Named project", workspacePath: projectFolder });
    const named = store.createProjectWorkspace({ projectId: project.id, kind: "sandbox", name: "Quiet Room" });
    assert.equal(named.name, "Quiet Room");
    assert.throws(
      () => store.createProjectWorkspace({ projectId: project.id, kind: "sandbox", name: "quiet room" }),
      /already exists/i,
    );
    const other = store.createProjectWorkspace({ projectId: project.id, kind: "sandbox", name: "Other Room" });
    const renamed = store.renameProjectWorkspace(named.id, "Reading Room");
    assert.equal(renamed.name, "Reading Room");
    assert.equal(store.renameProjectWorkspace(named.id, "Reading Room").name, "Reading Room");
    assert.throws(() => store.renameProjectWorkspace(named.id, other.name), /already exists/i);
    assert.throws(() => store.renameProjectWorkspace(named.id, "  "), /name is required/i);
  } finally {
    closeStore();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("git projects can open and remove a worktree workspace", () => {
  const { root, primary, projectFolder } = makeRoots("worktree");
  try {
    initRepo(projectFolder);
    store.openWorkspace(primary);
    const project = store.createResearchProject({ name: "Git project", workspacePath: projectFolder });
    assert.equal(store.getResearchProject(project.id).git_state, "ready");
    const worktree = store.createProjectWorkspace({ projectId: project.id, kind: "worktree" });
    assert.equal(worktree.kind, "worktree");
    assert.equal(worktree.name, nameLibrary[0].name);
    assert.equal(fs.existsSync(path.join(worktree.root, "README.md")), true);
    assert.ok(worktree.base_ref);

    const thread = store.createResearchThread({
      prompt: "Branch work",
      mode: "free-chat",
      projectId: project.id,
      workspaceId: worktree.id,
    });
    assert.equal(thread.workspace_path, worktree.root);

    store.deleteProjectWorkspace(worktree.id);
    assert.equal(fs.existsSync(worktree.root), false);
    assert.equal(store.getResearchThread(thread.id).workspace_id, store.defaultProjectWorkspace(project.id).id);
  } finally {
    closeStore();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("projects without git cannot create a worktree", () => {
  const { root, primary, projectFolder } = makeRoots("no-git");
  try {
    store.openWorkspace(primary);
    const project = store.createResearchProject({ name: "No git", workspacePath: projectFolder });
    assert.equal(store.getResearchProject(project.id).git_state, "none");
    assert.throws(() => store.createProjectWorkspace({ projectId: project.id, kind: "worktree" }), /commit/i);
  } finally {
    closeStore();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
