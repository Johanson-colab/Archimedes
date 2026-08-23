const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const librarySeeds = require("../shared/library-seeds.json");

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

    CREATE TABLE IF NOT EXISTS research_threads (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      context_summary TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS research_turns (
      id TEXT PRIMARY KEY NOT NULL,
      thread_id TEXT NOT NULL REFERENCES research_threads(id) ON DELETE CASCADE,
      task_id TEXT UNIQUE REFERENCES task_runs(id) ON DELETE SET NULL,
      mode TEXT NOT NULL,
      user_message TEXT NOT NULL,
      assistant_message TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      completed_at TEXT
    ) STRICT;

    CREATE TABLE IF NOT EXISTS research_events (
      id TEXT PRIMARY KEY NOT NULL,
      thread_id TEXT NOT NULL REFERENCES research_threads(id) ON DELETE CASCADE,
      turn_id TEXT NOT NULL REFERENCES research_turns(id) ON DELETE CASCADE,
      sequence INTEGER NOT NULL,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(turn_id, sequence)
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

    CREATE TABLE IF NOT EXISTS libraries (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '#3973c8',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS papers (
      id TEXT PRIMARY KEY NOT NULL,
      canonical_key TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      authors_json TEXT NOT NULL DEFAULT '[]',
      year INTEGER,
      venue TEXT NOT NULL DEFAULT '',
      abstract TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      pdf_url TEXT NOT NULL DEFAULT '',
      doi TEXT NOT NULL DEFAULT '',
      arxiv_id TEXT NOT NULL DEFAULT '',
      s2_id TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'manual',
      citation_count INTEGER NOT NULL DEFAULT 0,
      reading_status TEXT NOT NULL DEFAULT 'unread',
      starred INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      tags_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS library_papers (
      library_id TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
      paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
      added_at TEXT NOT NULL,
      PRIMARY KEY (library_id, paper_id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS daily_feed_cache (
      cache_key TEXT PRIMARY KEY NOT NULL,
      response_json TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    ) STRICT;

    CREATE INDEX IF NOT EXISTS idx_library_papers_library ON library_papers(library_id, added_at DESC);
    CREATE INDEX IF NOT EXISTS idx_papers_title ON papers(title);
    CREATE INDEX IF NOT EXISTS idx_research_threads_updated ON research_threads(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_research_turns_thread ON research_turns(thread_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_research_events_turn ON research_events(turn_id, sequence ASC);
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
  migrateLegacyTasks(database);
  seedLibraries(database);

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
    threads: listResearchThreads(),
    commands: db.prepare("SELECT id, command, cwd, status, output, exit_code, created_at, completed_at FROM command_runs ORDER BY created_at DESC LIMIT 24").all(),
    actions: db.prepare("SELECT id, task_id, kind, payload_json, status, created_at, resolved_at FROM agent_actions ORDER BY created_at DESC LIMIT 24").all().map(hydrateAction),
  };
}

function threadTitle(prompt) {
  const normalized = String(prompt || "").replace(/\s+/g, " ").trim();
  return normalized.slice(0, 72) || "New research task";
}

function migrateLegacyTasks(db) {
  const legacyTasks = db.prepare(`
    SELECT task_runs.* FROM task_runs
    LEFT JOIN research_turns ON research_turns.task_id = task_runs.id
    WHERE research_turns.id IS NULL AND task_runs.status != 'running'
    ORDER BY task_runs.created_at ASC
  `).all();
  if (!legacyTasks.length) return;

  const insertThread = db.prepare(`
    INSERT INTO research_threads (id, title, mode, status, context_summary, created_at, updated_at)
    VALUES (?, ?, 'idea-spark', ?, '', ?, ?)
  `);
  const insertTurn = db.prepare(`
    INSERT INTO research_turns (id, thread_id, task_id, mode, user_message, assistant_message, status, created_at, completed_at)
    VALUES (?, ?, ?, 'idea-spark', ?, ?, ?, ?, ?)
  `);
  for (const task of legacyTasks) {
    const threadId = randomUUID();
    insertThread.run(threadId, threadTitle(task.prompt), task.status, task.created_at, task.created_at);
    insertTurn.run(randomUUID(), threadId, task.id, task.prompt, task.response, task.status, task.created_at, task.created_at);
  }
}

function hydrateAction(row) {
  return { ...row, payload: JSON.parse(row.payload_json) };
}

function canonicalPaperKey(paper) {
  if (paper.s2_id) return `s2:${paper.s2_id}`;
  if (paper.arxiv_id) return `arxiv:${paper.arxiv_id.toLowerCase()}`;
  if (paper.doi) return `doi:${paper.doi.toLowerCase()}`;
  const normalizedTitle = String(paper.title || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return `title:${normalizedTitle}`;
}

function seedLibraries(db) {
  const seeded = db.prepare("SELECT value FROM workspace_meta WHERE key = 'library_seed_version'").get();
  if (seeded) return;

  const insertLibrary = db.prepare("INSERT OR IGNORE INTO libraries (id, name, description, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)");
  const insertPaper = db.prepare(`
    INSERT OR IGNORE INTO papers (
      id, canonical_key, title, authors_json, year, venue, abstract, url, pdf_url, doi, arxiv_id, s2_id,
      source, citation_count, reading_status, starred, notes, tags_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unread', 0, '', '[]', ?, ?)
  `);
  const linkPaper = db.prepare("INSERT OR IGNORE INTO library_papers (library_id, paper_id, added_at) VALUES (?, ?, ?)");
  const createdAt = timestamp();

  db.exec("BEGIN");
  try {
    for (const library of librarySeeds.libraries) {
      insertLibrary.run(library.id, library.name, library.description, library.color, createdAt, createdAt);
      for (const paper of library.papers) {
        insertPaper.run(
          paper.id,
          canonicalPaperKey(paper),
          paper.title,
          JSON.stringify(paper.authors || []),
          paper.year || null,
          paper.venue || "",
          paper.abstract || "",
          paper.url || "",
          paper.pdf_url || "",
          paper.doi || "",
          paper.arxiv_id || "",
          paper.s2_id || "",
          paper.source || "seed",
          paper.citation_count || 0,
          createdAt,
          createdAt,
        );
        linkPaper.run(library.id, paper.id, createdAt);
      }
    }
    db.prepare("INSERT INTO workspace_meta (key, value, updated_at) VALUES ('library_seed_version', '1', ?)").run(createdAt);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function hydratePaper(row) {
  return {
    ...row,
    authors: JSON.parse(row.authors_json || "[]"),
    tags: JSON.parse(row.tags_json || "[]"),
    starred: Boolean(row.starred),
  };
}

function listLibraries() {
  const db = requireDatabase();
  return db.prepare(`
    SELECT libraries.id, libraries.name, libraries.description, libraries.color,
      libraries.created_at, libraries.updated_at, COUNT(library_papers.paper_id) AS paper_count
    FROM libraries
    LEFT JOIN library_papers ON library_papers.library_id = libraries.id
    GROUP BY libraries.id
    ORDER BY libraries.updated_at DESC, libraries.name ASC
  `).all();
}

function createLibrary({ name, description = "", color = "#3973c8" }) {
  const db = requireDatabase();
  const createdAt = timestamp();
  const library = { id: randomUUID(), name: name.trim(), description: description.trim(), color, created_at: createdAt, updated_at: createdAt, paper_count: 0 };
  db.prepare("INSERT INTO libraries (id, name, description, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(library.id, library.name, library.description, library.color, library.created_at, library.updated_at);
  return library;
}

function updateLibrary(id, patch) {
  const db = requireDatabase();
  const current = db.prepare("SELECT id, name, description, color, created_at, updated_at FROM libraries WHERE id = ?").get(id);
  if (!current) throw new Error("Library not found.");
  const next = {
    name: typeof patch.name === "string" ? patch.name.trim() : current.name,
    description: typeof patch.description === "string" ? patch.description.trim() : current.description,
    color: typeof patch.color === "string" ? patch.color : current.color,
    updated_at: timestamp(),
  };
  db.prepare("UPDATE libraries SET name = ?, description = ?, color = ?, updated_at = ? WHERE id = ?")
    .run(next.name, next.description, next.color, next.updated_at, id);
  return listLibraries().find((library) => library.id === id);
}

function deleteLibrary(id) {
  const db = requireDatabase();
  const result = db.prepare("DELETE FROM libraries WHERE id = ?").run(id);
  db.prepare("DELETE FROM papers WHERE id NOT IN (SELECT paper_id FROM library_papers)").run();
  return { deleted: result.changes > 0 };
}

function listPapers(libraryId, query = "") {
  const db = requireDatabase();
  const pattern = `%${query.trim()}%`;
  return db.prepare(`
    SELECT papers.* FROM papers
    INNER JOIN library_papers ON library_papers.paper_id = papers.id
    WHERE library_papers.library_id = ?
      AND (? = '' OR papers.title LIKE ? OR papers.abstract LIKE ? OR papers.authors_json LIKE ? OR papers.venue LIKE ?)
    ORDER BY papers.starred DESC, papers.year DESC, library_papers.added_at DESC
  `).all(libraryId, query.trim(), pattern, pattern, pattern, pattern).map(hydratePaper);
}

function addPaper(libraryId, paper) {
  const db = requireDatabase();
  const library = db.prepare("SELECT id FROM libraries WHERE id = ?").get(libraryId);
  if (!library) throw new Error("Choose a valid library before importing a paper.");
  const now = timestamp();
  const key = canonicalPaperKey(paper);
  const existing = db.prepare("SELECT id FROM papers WHERE canonical_key = ?").get(key);
  const paperId = existing?.id || randomUUID();

  if (!existing) {
    db.prepare(`
      INSERT INTO papers (
        id, canonical_key, title, authors_json, year, venue, abstract, url, pdf_url, doi, arxiv_id, s2_id,
        source, citation_count, reading_status, starred, notes, tags_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unread', 0, '', '[]', ?, ?)
    `).run(
      paperId, key, paper.title.trim(), JSON.stringify(paper.authors || []), paper.year || null,
      paper.venue || "", paper.abstract || "", paper.url || "", paper.pdf_url || "", paper.doi || "",
      paper.arxiv_id || "", paper.s2_id || "", paper.source || "manual", paper.citation_count || 0, now, now,
    );
  }
  db.prepare("INSERT OR IGNORE INTO library_papers (library_id, paper_id, added_at) VALUES (?, ?, ?)").run(libraryId, paperId, now);
  db.prepare("UPDATE libraries SET updated_at = ? WHERE id = ?").run(now, libraryId);
  return hydratePaper(db.prepare("SELECT * FROM papers WHERE id = ?").get(paperId));
}

function updatePaper(id, patch) {
  const db = requireDatabase();
  const current = db.prepare("SELECT * FROM papers WHERE id = ?").get(id);
  if (!current) throw new Error("Paper not found.");
  const next = {
    title: typeof patch.title === "string" ? patch.title.trim() : current.title,
    reading_status: ["unread", "reading", "read"].includes(patch.reading_status) ? patch.reading_status : current.reading_status,
    starred: typeof patch.starred === "boolean" ? Number(patch.starred) : current.starred,
    notes: typeof patch.notes === "string" ? patch.notes : current.notes,
    tags_json: Array.isArray(patch.tags) ? JSON.stringify(patch.tags) : current.tags_json,
    updated_at: timestamp(),
  };
  db.prepare("UPDATE papers SET title = ?, reading_status = ?, starred = ?, notes = ?, tags_json = ?, updated_at = ? WHERE id = ?")
    .run(next.title, next.reading_status, next.starred, next.notes, next.tags_json, next.updated_at, id);
  return hydratePaper(db.prepare("SELECT * FROM papers WHERE id = ?").get(id));
}

function removePaper(libraryId, paperId) {
  const db = requireDatabase();
  const result = db.prepare("DELETE FROM library_papers WHERE library_id = ? AND paper_id = ?").run(libraryId, paperId);
  db.prepare("DELETE FROM papers WHERE id = ? AND id NOT IN (SELECT paper_id FROM library_papers)").run(paperId);
  db.prepare("UPDATE libraries SET updated_at = ? WHERE id = ?").run(timestamp(), libraryId);
  return { removed: result.changes > 0 };
}

function getDailyFeedCache(cacheKey, maxAgeMs = Number.POSITIVE_INFINITY) {
  const db = requireDatabase();
  const row = db.prepare("SELECT response_json, fetched_at FROM daily_feed_cache WHERE cache_key = ?").get(cacheKey);
  if (!row) return null;
  const age = Date.now() - new Date(row.fetched_at).getTime();
  if (!Number.isFinite(age) || age > maxAgeMs) return null;
  return { ...JSON.parse(row.response_json), fetched_at: row.fetched_at };
}

function setDailyFeedCache(cacheKey, response) {
  const db = requireDatabase();
  const fetchedAt = timestamp();
  db.prepare(`
    INSERT INTO daily_feed_cache (cache_key, response_json, fetched_at) VALUES (?, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET response_json = excluded.response_json, fetched_at = excluded.fetched_at
  `).run(cacheKey, JSON.stringify(response), fetchedAt);
  db.prepare("DELETE FROM daily_feed_cache WHERE fetched_at < ?").run(new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString());
  return { ...response, fetched_at: fetchedAt };
}

function listResearchThreads() {
  const db = requireDatabase();
  return db.prepare(`
    SELECT research_threads.*,
      COUNT(research_turns.id) AS turn_count,
      COALESCE(MAX(research_turns.created_at), research_threads.created_at) AS last_turn_at
    FROM research_threads
    LEFT JOIN research_turns ON research_turns.thread_id = research_threads.id
    GROUP BY research_threads.id
    ORDER BY research_threads.updated_at DESC
    LIMIT 48
  `).all();
}

function createResearchThread({ prompt, mode }) {
  const db = requireDatabase();
  const now = timestamp();
  const thread = {
    id: randomUUID(),
    title: threadTitle(prompt),
    mode,
    status: "idle",
    context_summary: "",
    created_at: now,
    updated_at: now,
  };
  db.prepare(`
    INSERT INTO research_threads (id, title, mode, status, context_summary, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(thread.id, thread.title, thread.mode, thread.status, thread.context_summary, thread.created_at, thread.updated_at);
  return { ...thread, turn_count: 0, last_turn_at: now };
}

function getResearchThread(id) {
  const db = requireDatabase();
  const thread = db.prepare("SELECT * FROM research_threads WHERE id = ?").get(id);
  if (!thread) throw new Error("Research thread not found.");
  const turns = db.prepare(`
    SELECT id, thread_id, task_id, mode, user_message, assistant_message, status, created_at, completed_at
    FROM research_turns WHERE thread_id = ? ORDER BY created_at ASC
  `).all(id);
  return {
    ...thread,
    turn_count: turns.length,
    last_turn_at: turns.at(-1)?.created_at || thread.created_at,
    turns,
    messages: turns.flatMap((turn) => {
      const items = [{ id: `${turn.id}:user`, turn_id: turn.id, role: "user", text: turn.user_message, created_at: turn.created_at }];
      if (turn.assistant_message) {
        items.push({ id: `${turn.id}:assistant`, turn_id: turn.id, role: "assistant", text: turn.assistant_message, created_at: turn.completed_at || turn.created_at });
      }
      return items;
    }),
  };
}

function getResearchThreadContext(id) {
  const thread = getResearchThread(id);
  return {
    id: thread.id,
    title: thread.title,
    mode: thread.mode,
    context_summary: thread.context_summary,
    turns: thread.turns,
  };
}

function startResearchTurn({ threadId, taskId, prompt, mode }) {
  const db = requireDatabase();
  const thread = db.prepare("SELECT id FROM research_threads WHERE id = ?").get(threadId);
  if (!thread) throw new Error("Research thread not found.");
  const turn = {
    id: randomUUID(),
    thread_id: threadId,
    task_id: taskId,
    mode,
    user_message: prompt,
    assistant_message: "",
    status: "running",
    created_at: timestamp(),
    completed_at: null,
  };
  db.prepare(`
    INSERT INTO research_turns (id, thread_id, task_id, mode, user_message, assistant_message, status, created_at, completed_at)
    VALUES (?, ?, ?, ?, ?, '', 'running', ?, NULL)
  `).run(turn.id, turn.thread_id, turn.task_id, turn.mode, turn.user_message, turn.created_at);
  db.prepare("UPDATE research_threads SET mode = ?, status = 'running', updated_at = ? WHERE id = ?")
    .run(mode, turn.created_at, threadId);
  appendResearchEvent({ threadId, turnId: turn.id, type: "user_message", payload: { text: prompt, mode } });
  return turn;
}

function appendResearchEvent({ threadId, turnId, type, payload }) {
  const db = requireDatabase();
  const sequence = db.prepare("SELECT COALESCE(MAX(sequence), 0) + 1 AS value FROM research_events WHERE turn_id = ?").get(turnId).value;
  const event = { id: randomUUID(), thread_id: threadId, turn_id: turnId, sequence, type, payload, created_at: timestamp() };
  db.prepare(`
    INSERT INTO research_events (id, thread_id, turn_id, sequence, type, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(event.id, event.thread_id, event.turn_id, event.sequence, event.type, JSON.stringify(payload), event.created_at);
  return event;
}

function finishResearchTurn(id, { response, status = "completed" }) {
  const db = requireDatabase();
  const completedAt = timestamp();
  const turn = db.prepare("SELECT thread_id FROM research_turns WHERE id = ?").get(id);
  if (!turn) throw new Error("Research turn not found.");
  db.prepare("UPDATE research_turns SET assistant_message = ?, status = ?, completed_at = ? WHERE id = ?")
    .run(response, status, completedAt, id);
  const threadStatus = status === "failed" ? "error" : "idle";
  db.prepare("UPDATE research_threads SET status = ?, updated_at = ? WHERE id = ?")
    .run(threadStatus, completedAt, turn.thread_id);
  appendResearchEvent({ threadId: turn.thread_id, turnId: id, type: "assistant_message", payload: { text: response, status } });
  return db.prepare("SELECT * FROM research_turns WHERE id = ?").get(id);
}

function updateResearchThreadSummary(id, summary) {
  const db = requireDatabase();
  db.prepare("UPDATE research_threads SET context_summary = ?, updated_at = ? WHERE id = ?")
    .run(String(summary || "").slice(0, 32_000), timestamp(), id);
  return getResearchThread(id);
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
  addPaper,
  appendCommandOutput,
  appendResearchEvent,
  approveAction,
  createLibrary,
  createAction,
  createResearchThread,
  deleteLibrary,
  finishCommand,
  finishResearchTurn,
  finishTask,
  getDailyFeedCache,
  getAction,
  getResearchThread,
  getResearchThreadContext,
  getSnapshot,
  listLibraries,
  listPapers,
  listResearchThreads,
  openWorkspace,
  removePaper,
  resolveAction,
  saveTask,
  setDailyFeedCache,
  startCommand,
  startResearchTurn,
  startTask,
  updateLibrary,
  updatePaper,
  updateResearchThreadSummary,
};
