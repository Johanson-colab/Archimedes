const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const OUTPUT_LIMIT = 200_000;
let database;
let activeWorkspace;

function timestamp() {
  return new Date().toISOString();
}

function schema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS workspace_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS task_runs (
      id TEXT PRIMARY KEY NOT NULL,
      prompt TEXT NOT NULL,
      response TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS command_runs (
      id TEXT PRIMARY KEY NOT NULL,
      command TEXT NOT NULL,
      cwd TEXT NOT NULL,
      status TEXT NOT NULL,
      output TEXT NOT NULL DEFAULT '',
      exit_code INTEGER,
      created_at TEXT NOT NULL,
      completed_at TEXT
    ) STRICT;

    CREATE TABLE IF NOT EXISTS agent_actions (
      id TEXT PRIMARY KEY NOT NULL,
      task_id TEXT NOT NULL REFERENCES task_runs(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    ) STRICT;
  `);
}

function requireDatabase() {
  if (!database) throw new Error("Open a workspace before accessing its research data.");
  return database;
}

function openWorkspace(workspacePath) {
  if (activeWorkspace === workspacePath && database) return getSnapshot();

  database?.close();
  const axiomDir = path.join(workspacePath, ".axiom");
  fs.mkdirSync(axiomDir, { recursive: true });
  database = new DatabaseSync(path.join(axiomDir, "axiom.db"));
  activeWorkspace = workspacePath;
  schema(database);

  const updatedAt = timestamp();
  database.prepare(`
    INSERT INTO workspace_meta (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run("workspace_path", workspacePath, updatedAt);

  return getSnapshot();
}

function getSnapshot() {
  const db = requireDatabase();
  return {
    workspace: activeWorkspace,
    tasks: db.prepare("SELECT id, prompt, response, status, created_at FROM task_runs ORDER BY created_at DESC LIMIT 24").all(),
    commands: db.prepare("SELECT id, command, cwd, status, output, exit_code, created_at, completed_at FROM command_runs ORDER BY created_at DESC LIMIT 24").all(),
    actions: db.prepare("SELECT id, task_id, kind, payload_json, status, created_at, resolved_at FROM agent_actions ORDER BY created_at DESC LIMIT 24").all().map(hydrateAction),
  };
}

function hydrateAction(row) {
  return { ...row, payload: JSON.parse(row.payload_json) };
}

function startTask({ prompt }) {
  const db = requireDatabase();
  const task = { id: randomUUID(), prompt, response: "", status: "running", created_at: timestamp() };
  db.prepare("INSERT INTO task_runs (id, prompt, response, status, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(task.id, task.prompt, task.response, task.status, task.created_at);
  return task;
}

function finishTask(id, { response, status = "completed" }) {
  const db = requireDatabase();
  db.prepare("UPDATE task_runs SET response = ?, status = ? WHERE id = ?").run(response, status, id);
  return db.prepare("SELECT id, prompt, response, status, created_at FROM task_runs WHERE id = ?").get(id);
}

function saveTask({ prompt, response, status = "completed" }) {
  const db = requireDatabase();
  const task = { id: randomUUID(), prompt, response, status, created_at: timestamp() };
  db.prepare("INSERT INTO task_runs (id, prompt, response, status, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(task.id, task.prompt, task.response, task.status, task.created_at);
  return task;
}

function createAction({ taskId, kind, payload }) {
  const db = requireDatabase();
  const action = { id: randomUUID(), task_id: taskId, kind, payload, status: "pending", created_at: timestamp(), resolved_at: null };
  db.prepare("INSERT INTO agent_actions (id, task_id, kind, payload_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(action.id, action.task_id, action.kind, JSON.stringify(action.payload), action.status, action.created_at);
  return action;
}

function getAction(id) {
  const db = requireDatabase();
  const row = db.prepare("SELECT id, task_id, kind, payload_json, status, created_at, resolved_at FROM agent_actions WHERE id = ?").get(id);
  if (!row) throw new Error("The requested Agent action does not exist.");
  return hydrateAction(row);
}

function resolveAction(id, status) {
  const db = requireDatabase();
  db.prepare("UPDATE agent_actions SET status = ?, resolved_at = ? WHERE id = ? AND status = 'pending'")
    .run(status, timestamp(), id);
  return getAction(id);
}

function approveAction(id) {
  const action = getAction(id);
  if (action.status !== "pending") throw new Error("Only pending Agent actions can be approved.");

  if (action.kind === "write") {
    const target = path.resolve(activeWorkspace, action.payload.path);
    if (target !== activeWorkspace && !target.startsWith(`${activeWorkspace}${path.sep}`)) {
      throw new Error("The write target is outside the active workspace.");
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, action.payload.content, "utf8");
  }
  return resolveAction(id, "approved");
}

function startCommand({ command, cwd }) {
  const db = requireDatabase();
  const run = { id: randomUUID(), command, cwd, status: "running", created_at: timestamp() };
  db.prepare("INSERT INTO command_runs (id, command, cwd, status, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(run.id, run.command, run.cwd, run.status, run.created_at);
  return run;
}

function appendCommandOutput(id, output) {
  const db = requireDatabase();
  db.prepare("UPDATE command_runs SET output = substr(output || ?, -?) WHERE id = ?")
    .run(output, OUTPUT_LIMIT, id);
}

function finishCommand(id, exitCode, status = "completed") {
  const db = requireDatabase();
  db.prepare("UPDATE command_runs SET status = ?, exit_code = ?, completed_at = ? WHERE id = ?")
    .run(status, exitCode, timestamp(), id);
}

module.exports = {
  appendCommandOutput,
  approveAction,
  createAction,
  finishCommand,
  finishTask,
  getAction,
  getSnapshot,
  openWorkspace,
  resolveAction,
  saveTask,
  startCommand,
  startTask,
};
