const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const librarySeeds = require("../shared/library-seeds.json");
const { presentStoredAssistantMessage } = require("./agent/model-response.cjs");
const { hasRole, isProjectRole, normalizeRole } = require("./collaboration/roles.cjs");

const OUTPUT_LIMIT = 200_000;
let database;
let activeWorkspace;
let localIdentity = {
  userId: "local-user",
  displayName: "Local user",
  deviceId: "local-device",
  deviceName: "This device",
};

function timestamp() {
  return new Date().toISOString();
}

function recordAuditEvent(db, { projectId = null, action, targetType, targetId, metadata = {}, actorType = "user" }) {
  try {
    db.prepare(`
      INSERT INTO audit_events (id, project_id, actor_id, actor_type, action, target_type, target_id, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), projectId, localIdentity.userId, actorType, action, targetType, targetId, JSON.stringify(metadata), timestamp());
  } catch {
    // Audit should not block the user's action if a legacy database is read-only.
  }
}

function assertCommentResource(projectId, resourceType, resourceId) {
  const db = requireDatabase();
  if (!projectId || !canAccessProject(projectId, "viewer")) throw new Error("You do not have access to this project.");
  if (!["thread", "paper", "review", "artifact"].includes(resourceType)) throw new Error("Unknown comment resource.");
  if (resourceType === "thread") {
    const thread = db.prepare("SELECT id, project_id, owner_id, visibility FROM research_threads WHERE id = ?").get(resourceId);
    if (!thread) throw new Error("Research thread not found.");
    if (thread.project_id !== projectId) throw new Error("This thread belongs to a different project.");
    if (thread.visibility === "private" && thread.owner_id !== localIdentity.userId) throw new Error("This research thread is a private draft.");
  }
  if (resourceType === "paper" && !db.prepare("SELECT 1 FROM papers WHERE id = ?").get(resourceId)) throw new Error("Paper not found.");
}

function listComments({ projectId, resourceType, resourceId, includeResolved = true } = {}) {
  const db = requireDatabase();
  assertCommentResource(projectId, resourceType, resourceId);
  return db.prepare(`
    SELECT comments.*, COALESCE(users.display_name, comments.author_id) AS author_name
    FROM comments
    LEFT JOIN users ON users.id = comments.author_id
    WHERE comments.project_id = ? AND comments.resource_type = ? AND comments.resource_id = ?
      AND (? = 1 OR comments.resolved_at IS NULL)
    ORDER BY comments.created_at ASC
  `).all(projectId, resourceType, resourceId, includeResolved ? 1 : 0).map((comment) => ({ ...comment, anchor: JSON.parse(comment.anchor_json || "{}") }));
}

function createComment({ projectId, resourceType, resourceId, body, parentId = null, anchor = {} } = {}) {
  const db = requireDatabase();
  assertCommentResource(projectId, resourceType, resourceId);
  if (!canAccessProject(projectId, "commenter")) throw new Error("You do not have permission to comment in this project.");
  const text = String(body || "").trim();
  if (!text || text.length > 10_000) throw new Error("Comments must be between 1 and 10000 characters.");
  if (parentId) {
    const parent = db.prepare("SELECT id FROM comments WHERE id = ? AND project_id = ? AND resource_type = ? AND resource_id = ?").get(parentId, projectId, resourceType, resourceId);
    if (!parent) throw new Error("The parent comment was not found.");
  }
  const now = timestamp();
  const id = randomUUID();
  db.prepare(`
    INSERT INTO comments (id, project_id, resource_type, resource_id, parent_id, anchor_json, body, author_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, projectId, resourceType, resourceId, parentId, JSON.stringify(anchor && typeof anchor === "object" ? anchor : {}), text, localIdentity.userId, now, now);
  recordAuditEvent(db, { projectId, action: "comment.created", targetType: resourceType, targetId: resourceId, metadata: { commentId: id, parentId } });
  return listComments({ projectId, resourceType, resourceId }).find((comment) => comment.id === id) || null;
}

function setCommentResolved(id, resolved = true) {
  const db = requireDatabase();
  const comment = db.prepare("SELECT * FROM comments WHERE id = ?").get(id);
  if (!comment) throw new Error("Comment not found.");
  if (!canAccessProject(comment.project_id, "commenter")) throw new Error("You do not have access to this comment.");
  if (comment.author_id !== localIdentity.userId && !canAccessProject(comment.project_id, "editor")) throw new Error("Only the author or an editor can resolve this comment.");
  const now = timestamp();
  db.prepare("UPDATE comments SET resolved_at = ?, updated_at = ? WHERE id = ?").run(resolved ? now : null, now, id);
  recordAuditEvent(db, { projectId: comment.project_id, action: resolved ? "comment.resolved" : "comment.reopened", targetType: comment.resource_type, targetId: comment.resource_id, metadata: { commentId: id } });
  return listComments({ projectId: comment.project_id, resourceType: comment.resource_type, resourceId: comment.resource_id }).find((item) => item.id === id) || null;
}

function deleteComment(id) {
  const db = requireDatabase();
  const comment = db.prepare("SELECT * FROM comments WHERE id = ?").get(id);
  if (!comment) return { deleted: false };
  if (comment.author_id !== localIdentity.userId && !canAccessProject(comment.project_id, "admin")) throw new Error("Only the author or an admin can delete this comment.");
  const result = db.prepare("DELETE FROM comments WHERE id = ?").run(id);
  recordAuditEvent(db, { projectId: comment.project_id, action: "comment.deleted", targetType: comment.resource_type, targetId: comment.resource_id, metadata: { commentId: id } });
  return { deleted: result.changes > 0 };
}

function listAuditEvents({ projectId = null, limit = 100 } = {}) {
  const db = requireDatabase();
  const safeLimit = Math.min(500, Math.max(1, Number(limit) || 100));
  return db.prepare(`
    SELECT * FROM audit_events
    WHERE (? IS NULL OR project_id = ?)
    ORDER BY created_at DESC LIMIT ?
  `).all(projectId, projectId, safeLimit).map((event) => ({ ...event, metadata: JSON.parse(event.metadata_json || "{}") }));
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

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      display_name TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      avatar_color TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS research_projects (
      id TEXT PRIMARY KEY NOT NULL,
      owner_id TEXT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      workspace_path TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT
    ) STRICT;

    CREATE TABLE IF NOT EXISTS project_members (
      project_id TEXT NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      joined_at TEXT NOT NULL,
      invited_by TEXT,
      PRIMARY KEY (project_id, user_id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS research_threads (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT REFERENCES research_projects(id) ON DELETE SET NULL,
      owner_id TEXT,
      visibility TEXT NOT NULL DEFAULT 'project',
      title TEXT NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      context_summary TEXT NOT NULL DEFAULT '',
      workspace_path TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT
    ) STRICT;

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      parent_id TEXT,
      anchor_json TEXT NOT NULL DEFAULT '{}',
      body TEXT NOT NULL,
      author_id TEXT NOT NULL,
      resolved_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT,
      actor_id TEXT NOT NULL,
      actor_type TEXT NOT NULL DEFAULT 'user',
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS thread_snapshots (
      id TEXT PRIMARY KEY NOT NULL,
      thread_id TEXT NOT NULL REFERENCES research_threads(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      sequence INTEGER NOT NULL DEFAULT 0,
      manifest_json TEXT NOT NULL,
      created_at TEXT NOT NULL
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
      project_id TEXT,
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
      github_url TEXT NOT NULL DEFAULT '',
      github_stars INTEGER NOT NULL DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS paper_reader_assets (
      paper_id TEXT PRIMARY KEY NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
      source_url TEXT NOT NULL DEFAULT '',
      relative_path TEXT NOT NULL DEFAULT '',
      sha256 TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'ready',
      error TEXT NOT NULL DEFAULT '',
      size_bytes INTEGER NOT NULL DEFAULT 0,
      page_count INTEGER NOT NULL DEFAULT 0,
      truncated INTEGER NOT NULL DEFAULT 0,
      warning TEXT NOT NULL DEFAULT '',
      indexed_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS paper_reader_pages (
      paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
      page_number INTEGER NOT NULL,
      text TEXT NOT NULL,
      PRIMARY KEY (paper_id, page_number)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS paper_highlights (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT,
      paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
      author_id TEXT,
      visibility TEXT NOT NULL DEFAULT 'project',
      page_number INTEGER NOT NULL,
      quote TEXT NOT NULL,
      start_offset INTEGER,
      end_offset INTEGER,
      note TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT 'green',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS paper_chat_threads (
      project_id TEXT NOT NULL,
      paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
      thread_id TEXT NOT NULL REFERENCES research_threads(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, paper_id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS paper_reviews (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
      owner_id TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'private',
      review_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (project_id, paper_id, owner_id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS paper_presentations (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
      owner_id TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'private',
      presentation_json TEXT NOT NULL,
      source_review_updated_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (project_id, paper_id, owner_id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS paper_user_state (
      paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      reading_status TEXT NOT NULL DEFAULT 'unread',
      starred INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      tags_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (paper_id, user_id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS reproductions (
      id TEXT PRIMARY KEY NOT NULL,
      paper_id TEXT REFERENCES papers(id) ON DELETE SET NULL,
      repo_url TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      source_json TEXT NOT NULL,
      contract_json TEXT,
      budget_json TEXT NOT NULL,
      error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS daily_feed_cache (
      cache_key TEXT PRIMARY KEY NOT NULL,
      response_json TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS research_artifacts (
      id TEXT PRIMARY KEY NOT NULL,
      thread_id TEXT NOT NULL REFERENCES research_threads(id) ON DELETE CASCADE,
      turn_id TEXT,
      path TEXT NOT NULL,
      title TEXT NOT NULL,
      kind TEXT NOT NULL,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      modified_at TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      source TEXT NOT NULL DEFAULT 'agent',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      seen INTEGER NOT NULL DEFAULT 0,
      UNIQUE (thread_id, path)
    ) STRICT;

    CREATE INDEX IF NOT EXISTS idx_library_papers_library ON library_papers(library_id, added_at DESC);
    CREATE INDEX IF NOT EXISTS idx_papers_title ON papers(title);
    CREATE INDEX IF NOT EXISTS idx_paper_reader_pages_paper ON paper_reader_pages(paper_id, page_number);

    CREATE INDEX IF NOT EXISTS idx_paper_user_state_user ON paper_user_state(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_paper_chat_threads_thread ON paper_chat_threads(thread_id);
    CREATE INDEX IF NOT EXISTS idx_paper_reviews_updated ON paper_reviews(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_paper_presentations_updated ON paper_presentations(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_reproductions_updated ON reproductions(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_research_threads_updated ON research_threads(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_research_turns_thread ON research_turns(thread_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_research_events_turn ON research_events(turn_id, sequence ASC);
    CREATE INDEX IF NOT EXISTS idx_research_artifacts_thread ON research_artifacts(thread_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_research_artifacts_unseen ON research_artifacts(thread_id, seen);
    CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id, project_id);
    CREATE INDEX IF NOT EXISTS idx_thread_snapshots_thread ON thread_snapshots(thread_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_events_project ON audit_events(project_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_comments_resource ON comments(project_id, resource_type, resource_id, created_at ASC);
  `);

  ensureColumn(db, "research_threads", "project_id", "TEXT");
  ensureColumn(db, "research_threads", "owner_id", "TEXT");
  ensureColumn(db, "research_threads", "visibility", "TEXT NOT NULL DEFAULT 'project'");
  ensureColumn(db, "research_threads", "archived_at", "TEXT");
  ensureColumn(db, "research_projects", "workspace_path", "TEXT");
  ensureColumn(db, "research_threads", "workspace_path", "TEXT");
  ensureColumn(db, "research_projects", "owner_id", "TEXT");
  ensureColumn(db, "research_projects", "cloud_project_id", "TEXT");
  ensureColumn(db, "project_members", "source", "TEXT NOT NULL DEFAULT 'local'");
  ensureColumn(db, "libraries", "project_id", "TEXT");
  ensureColumn(db, "libraries", "cloud_library_id", "TEXT");
  ensureColumn(db, "papers", "cloud_paper_id", "TEXT");
  ensureColumn(db, "paper_highlights", "project_id", "TEXT");
  ensureColumn(db, "paper_highlights", "author_id", "TEXT");
  ensureColumn(db, "paper_highlights", "visibility", "TEXT NOT NULL DEFAULT 'project'");
  ensureColumn(db, "papers", "conference_json", "TEXT NOT NULL DEFAULT 'null'");
  ensureColumn(db, "papers", "github_url", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "papers", "github_stars", "INTEGER NOT NULL DEFAULT 0");
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_research_projects_updated ON research_projects(updated_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_research_projects_cloud ON research_projects(cloud_project_id) WHERE cloud_project_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_research_threads_project ON research_threads(project_id, archived_at, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_libraries_project ON libraries(project_id, updated_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_libraries_cloud ON libraries(cloud_library_id) WHERE cloud_library_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_papers_cloud ON papers(cloud_paper_id) WHERE cloud_paper_id IS NOT NULL;
  `);
  ensureLocalUser(db);
  const projectId = ensureDefaultProject(db);
  ensureProjectOwnership(db);
  db.prepare("UPDATE research_threads SET project_id = ? WHERE project_id IS NULL").run(projectId);
  db.prepare("UPDATE research_threads SET owner_id = ? WHERE owner_id IS NULL").run(localIdentity.userId);
  db.prepare("UPDATE research_threads SET visibility = 'project' WHERE visibility IS NULL OR visibility NOT IN ('project', 'private')").run();
  db.prepare("UPDATE libraries SET project_id = ? WHERE project_id IS NULL").run(projectId);
  migrateProjectScopedPaperData(db, projectId);
}

function tableColumns(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
}

function createPaperReviewsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS paper_reviews (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
      owner_id TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'private',
      review_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (project_id, paper_id, owner_id)
    ) STRICT;
  `);
}

function createPaperPresentationsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS paper_presentations (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
      owner_id TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'private',
      presentation_json TEXT NOT NULL,
      source_review_updated_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (project_id, paper_id, owner_id)
    ) STRICT;
  `);
}

function createPaperChatThreadsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS paper_chat_threads (
      project_id TEXT NOT NULL,
      paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
      thread_id TEXT NOT NULL REFERENCES research_threads(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, paper_id)
    ) STRICT;
  `);
}

function migrateProjectScopedPaperData(db, projectId) {
  const now = timestamp();
  const ownerId = localIdentity.userId;
  db.prepare("UPDATE paper_highlights SET project_id = ? WHERE project_id IS NULL").run(projectId);
  db.prepare("UPDATE paper_highlights SET author_id = ? WHERE author_id IS NULL").run(ownerId);
  db.prepare(`
    INSERT OR IGNORE INTO paper_user_state (paper_id, user_id, reading_status, starred, notes, tags_json, created_at, updated_at)
    SELECT id, ?, reading_status, starred, notes, tags_json, created_at, updated_at FROM papers
  `).run(ownerId);

  if (!tableColumns(db, "paper_reviews").includes("project_id")) {
    db.exec("ALTER TABLE paper_reviews RENAME TO paper_reviews_legacy");
    createPaperReviewsTable(db);
    const legacyReviews = db.prepare("SELECT * FROM paper_reviews_legacy").all();
    for (const row of legacyReviews) {
      const reviewJson = typeof row.review_json === "string"
        ? row.review_json
        : JSON.stringify({ specialists: JSON.parse(row.specialists_json || "[]"), supervisor: { reason: row.audit || "" }, summary: { response: row.summary || "" } });
      db.prepare(`INSERT INTO paper_reviews (id, project_id, paper_id, owner_id, visibility, review_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'private', ?, ?, ?)`)
        .run(randomUUID(), projectId, row.paper_id, ownerId, reviewJson, row.created_at || now, row.updated_at || now);
    }
    db.exec("DROP TABLE paper_reviews_legacy");
  }

  if (!tableColumns(db, "paper_presentations").includes("project_id")) {
    db.exec("ALTER TABLE paper_presentations RENAME TO paper_presentations_legacy");
    createPaperPresentationsTable(db);
    const legacyPresentations = db.prepare("SELECT * FROM paper_presentations_legacy").all();
    for (const row of legacyPresentations) {
      db.prepare(`INSERT INTO paper_presentations (id, project_id, paper_id, owner_id, visibility, presentation_json, source_review_updated_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'private', ?, ?, ?, ?)`)
        .run(randomUUID(), projectId, row.paper_id, ownerId, row.presentation_json, row.source_review_updated_at || "", row.created_at || now, row.updated_at || now);
    }
    db.exec("DROP TABLE paper_presentations_legacy");
  }

  if (!tableColumns(db, "paper_chat_threads").includes("project_id")) {
    db.exec("ALTER TABLE paper_chat_threads RENAME TO paper_chat_threads_legacy");
    createPaperChatThreadsTable(db);
    const legacyThreads = db.prepare("SELECT * FROM paper_chat_threads_legacy").all();
    for (const row of legacyThreads) {
      db.prepare(`INSERT INTO paper_chat_threads (project_id, paper_id, thread_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)`)
        .run(projectId, row.paper_id, row.thread_id, row.created_at || now, row.updated_at || now);
    }
    db.exec("DROP TABLE paper_chat_threads_legacy");
  }
  db.prepare("UPDATE research_threads SET project_id = ? WHERE id IN (SELECT thread_id FROM paper_chat_threads WHERE project_id = ?)").run(projectId, projectId);

  db.exec(`
    DROP INDEX IF EXISTS idx_paper_highlights_paper;
    CREATE INDEX IF NOT EXISTS idx_paper_highlights_paper ON paper_highlights(project_id, paper_id, page_number, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_paper_reviews_project ON paper_reviews(project_id, paper_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_paper_presentations_project ON paper_presentations(project_id, paper_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_paper_chat_threads_thread ON paper_chat_threads(thread_id);
  `);
}

function ensureProjectLibraries(db) {
  const projects = db.prepare("SELECT id FROM research_projects").all();
  const now = timestamp();
  for (const project of projects) {
    const existing = db.prepare("SELECT id FROM libraries WHERE project_id = ? ORDER BY created_at ASC LIMIT 1").get(project.id);
    if (existing) continue;
    db.prepare(`
      INSERT INTO libraries (id, project_id, name, description, color, created_at, updated_at)
      VALUES (?, ?, 'Project library', 'Papers and sources for this project', '#3973c8', ?, ?)
    `).run(randomUUID(), project.id, now, now);
  }
}

function ensureColumn(db, table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((entry) => entry.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function ensureLocalUser(db) {
  const now = timestamp();
  db.prepare(`
    INSERT INTO users (id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, updated_at = excluded.updated_at
  `).run(localIdentity.userId, localIdentity.displayName, now, now);
}

function ensureProjectMember(db, projectId, userId, role, invitedBy = null) {
  if (!isProjectRole(role)) throw new Error("Unknown project role.");
  const now = timestamp();
  db.prepare(`
    INSERT INTO project_members (project_id, user_id, role, joined_at, invited_by) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(project_id, user_id) DO UPDATE SET role = excluded.role
  `).run(projectId, userId, role, now, invitedBy);
}

function ensureProjectOwnership(db) {
  const projects = db.prepare("SELECT id, owner_id FROM research_projects").all();
  for (const project of projects) {
    const ownerId = project.owner_id || localIdentity.userId;
    if (!project.owner_id) {
      db.prepare("UPDATE research_projects SET owner_id = ?, updated_at = ? WHERE id = ?").run(ownerId, timestamp(), project.id);
    }
    const member = db.prepare("SELECT role FROM project_members WHERE project_id = ? AND user_id = ?").get(project.id, ownerId);
    if (!member) ensureProjectMember(db, project.id, ownerId, "owner");
  }
}

function setLocalIdentity(identity) {
  if (!identity || typeof identity.userId !== "string" || !identity.userId.trim()) return localIdentity;
  localIdentity = {
    userId: identity.userId.trim(),
    displayName: String(identity.displayName || "Local user").trim() || "Local user",
    deviceId: String(identity.deviceId || ""),
    deviceName: String(identity.deviceName || ""),
  };
  if (database) ensureLocalUser(database);
  return localIdentity;
}

function updateProjectMemberRole(projectId, userId, role) {
  const db = requireDatabase();
  if (!canAccessProject(projectId, "admin")) throw new Error("You do not have permission to change project members.");
  if (!isProjectRole(role)) throw new Error("Unknown project role.");
  const current = db.prepare("SELECT role FROM project_members WHERE project_id = ? AND user_id = ?").get(projectId, userId);
  if (!current) throw new Error("Project member not found.");
  if (current.role === "owner" || role === "owner") throw new Error("Project ownership cannot be changed here.");
  db.prepare("UPDATE project_members SET role = ? WHERE project_id = ? AND user_id = ?").run(role, projectId, userId);
  recordAuditEvent(db, { projectId, action: "project.member_role_changed", targetType: "user", targetId: userId, metadata: { from: current.role, to: role } });
  return listProjectMembers(projectId).find((member) => member.user_id === userId) || null;
}

function removeProjectMember(projectId, userId) {
  const db = requireDatabase();
  if (!canAccessProject(projectId, "admin")) throw new Error("You do not have permission to remove project members.");
  const current = db.prepare("SELECT role FROM project_members WHERE project_id = ? AND user_id = ?").get(projectId, userId);
  if (!current) throw new Error("Project member not found.");
  if (current.role === "owner") throw new Error("The project owner cannot be removed.");
  const result = db.prepare("DELETE FROM project_members WHERE project_id = ? AND user_id = ?").run(projectId, userId);
  recordAuditEvent(db, { projectId, action: "project.member_removed", targetType: "user", targetId: userId });
  return { removed: result.changes > 0 };
}

function listProjectMembers(projectId) {
  const db = requireDatabase();
  return db.prepare(`
    SELECT project_members.project_id, project_members.user_id, project_members.role,
      project_members.joined_at, project_members.invited_by, project_members.source,
      COALESCE(users.display_name, project_members.user_id) AS display_name,
      COALESCE(users.email, '') AS email,
      COALESCE(users.avatar_color, '') AS avatar_color
    FROM project_members
    LEFT JOIN users ON users.id = project_members.user_id
    WHERE project_members.project_id = ?
    ORDER BY CASE project_members.role
      WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'editor' THEN 2
      WHEN 'commenter' THEN 3 ELSE 4 END, project_members.joined_at ASC
  `).all(projectId).map((member) => ({ ...member, role: normalizeRole(member.role) }));
}

function projectRoleForUser(projectId, userId = localIdentity.userId) {
  const db = requireDatabase();
  const row = db.prepare("SELECT role FROM project_members WHERE project_id = ? AND user_id = ?").get(projectId, userId);
  return row ? normalizeRole(row.role) : null;
}

function canAccessProject(projectId, requiredRole = "viewer", userId = localIdentity.userId) {
  return hasRole(projectRoleForUser(projectId, userId), requiredRole);
}

function addProjectMember({ projectId, userId, role = "viewer", displayName = "", email = "" } = {}) {
  const db = requireDatabase();
  if (typeof projectId !== "string" || !projectId) throw new Error("A project is required.");
  if (!canAccessProject(projectId, "admin")) throw new Error("You do not have permission to add project members.");
  if (typeof userId !== "string" || !userId.trim()) throw new Error("A user is required.");
  if (!isProjectRole(role)) throw new Error("Unknown project role.");
  const now = timestamp();
  db.prepare(`
    INSERT INTO users (id, display_name, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET display_name = CASE WHEN excluded.display_name = '' THEN users.display_name ELSE excluded.display_name END,
      email = CASE WHEN excluded.email = '' THEN users.email ELSE excluded.email END,
      updated_at = excluded.updated_at
  `).run(userId.trim(), String(displayName || userId), String(email || ""), now, now);
  ensureProjectMember(db, projectId, userId.trim(), role, localIdentity.userId);
  recordAuditEvent(db, { projectId, action: "project.member_added", targetType: "user", targetId: userId.trim(), metadata: { role } });
  return listProjectMembers(projectId).find((member) => member.user_id === userId.trim()) || null;
}

function ensureDefaultProject(db) {
  const existing = db.prepare("SELECT id FROM research_projects WHERE archived_at IS NULL ORDER BY created_at ASC LIMIT 1").get();
  if (existing) return existing.id;
  const id = randomUUID();
  const now = timestamp();
  db.prepare(`
    INSERT INTO research_projects (id, owner_id, name, description, workspace_path, created_at, updated_at)
    VALUES (?, ?, 'General', 'Default research project', ?, ?, ?)
  `).run(id, localIdentity.userId, activeWorkspace ?? null, now, now);
  ensureProjectMember(db, id, localIdentity.userId, "owner");
  return id;
}

function requireDatabase() {
  if (!database) throw new Error("Open a workspace before accessing its research data.");
  return database;
}

function normalizeWorkspacePath(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const resolved = path.resolve(value.trim());
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error("The project folder does not exist or is not a directory.");
  }
  return resolved;
}

function openWorkspace(workspacePath) {
  if (activeWorkspace === workspacePath && database) return getSnapshot();

  database?.close();
  const dataDir = path.join(workspacePath, ".archimedes");
  const databasePath = path.join(dataDir, "archimedes.db");
  const legacyName = ["ax", "iom"].join("");
  const legacyDir = path.join(workspacePath, `.${legacyName}`);
  const legacyDatabasePath = path.join(legacyDir, `${legacyName}.db`);
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(databasePath) && fs.existsSync(legacyDatabasePath)) {
    fs.renameSync(legacyDatabasePath, databasePath);
    for (const suffix of ["-wal", "-shm"]) {
      const legacySidecar = `${legacyDatabasePath}${suffix}`;
      if (fs.existsSync(legacySidecar)) fs.renameSync(legacySidecar, `${databasePath}${suffix}`);
    }
    try { fs.rmdirSync(legacyDir); } catch { /* Preserve non-database legacy files. */ }
  }
  database = new DatabaseSync(databasePath);
  activeWorkspace = workspacePath;
  schema(database);
  migrateLegacyTasks(database);
  seedLibraries(database);
  ensureProjectLibraries(database);

  const updatedAt = timestamp();
  database.prepare(`
    INSERT INTO workspace_meta (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run("workspace_path", workspacePath, updatedAt);

  // Legacy projects were implicit children of the workspace they lived in.
  // Bind them once so the new project-folder model has a stable default.
  database.prepare("UPDATE research_projects SET workspace_path = ? WHERE workspace_path IS NULL OR workspace_path = ''")
    .run(workspacePath);

  return getSnapshot();
}

function getSnapshot() {
  const db = requireDatabase();
  return {
    workspace: activeWorkspace,
    tasks: db.prepare("SELECT id, prompt, response, status, created_at FROM task_runs ORDER BY created_at DESC LIMIT 24").all(),
    projects: listResearchProjects(),
    archivedProjects: listResearchProjects({ archived: true }),
    threads: listResearchThreads(),
    archivedThreads: listResearchThreads({ archived: true }),
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

  const projectId = ensureDefaultProject(db);

  const insertThread = db.prepare(`
    INSERT INTO research_threads (id, project_id, owner_id, visibility, title, mode, status, context_summary, created_at, updated_at)
    VALUES (?, ?, ?, 'project', ?, 'idea-spark', ?, '', ?, ?)
  `);
  const insertTurn = db.prepare(`
    INSERT INTO research_turns (id, thread_id, task_id, mode, user_message, assistant_message, status, created_at, completed_at)
    VALUES (?, ?, ?, 'idea-spark', ?, ?, ?, ?, ?)
  `);
  for (const task of legacyTasks) {
    const threadId = randomUUID();
    insertThread.run(threadId, projectId, localIdentity.userId, threadTitle(task.prompt), task.status, task.created_at, task.created_at);
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

  const projectId = ensureDefaultProject(db);
  const insertLibrary = db.prepare("INSERT OR IGNORE INTO libraries (id, project_id, name, description, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
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
      insertLibrary.run(library.id, projectId, library.name, library.description, library.color, createdAt, createdAt);
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

function paperUserState(paperId, userId = localIdentity.userId) {
  const row = requireDatabase().prepare("SELECT * FROM paper_user_state WHERE paper_id = ? AND user_id = ?").get(paperId, userId);
  return row || null;
}

function hydratePaper(row) {
  const state = paperUserState(row.id);
  return {
    ...row,
    authors: JSON.parse(row.authors_json || "[]"),
    tags: JSON.parse(state?.tags_json ?? row.tags_json ?? "[]"),
    conference: JSON.parse(row.conference_json || "null") || undefined,
    reading_status: state?.reading_status ?? row.reading_status,
    starred: Boolean(state?.starred ?? row.starred),
    notes: state?.notes ?? row.notes,
    state_updated_at: state?.updated_at ?? null,
  };
}

function resolveLibraryProject(projectId) {
  const db = requireDatabase();
  return projectId || ensureDefaultProject(db);
}

function listLibraries(projectId = null) {
  const db = requireDatabase();
  const resolvedProject = resolveLibraryProject(projectId);
  if (!canAccessProject(resolvedProject, "viewer")) return [];
  return db.prepare(`
    SELECT libraries.id, libraries.project_id, libraries.name, libraries.description, libraries.color,
      libraries.cloud_library_id, libraries.created_at, libraries.updated_at, COUNT(library_papers.paper_id) AS paper_count
    FROM libraries
    LEFT JOIN library_papers ON library_papers.library_id = libraries.id
    WHERE libraries.project_id = ?
    GROUP BY libraries.id
    ORDER BY libraries.updated_at DESC, libraries.name ASC
  `).all(resolvedProject);
}

/**
 * Summarises which projects actually hold libraries. The library view is
 * project-scoped, so an empty project otherwise reads as "my data is gone".
 */
function listLibraryProjects() {
  const db = requireDatabase();
  return db.prepare(`
    SELECT research_projects.id AS project_id,
      research_projects.name AS name,
      COUNT(DISTINCT libraries.id) AS library_count,
      COUNT(library_papers.paper_id) AS paper_count
    FROM research_projects
    INNER JOIN libraries ON libraries.project_id = research_projects.id
    LEFT JOIN library_papers ON library_papers.library_id = libraries.id
    GROUP BY research_projects.id
    HAVING COUNT(DISTINCT libraries.id) > 0
    ORDER BY paper_count DESC, research_projects.updated_at DESC
  `).all().map((row) => ({
    project_id: row.project_id,
    name: row.name,
    library_count: Number(row.library_count) || 0,
    paper_count: Number(row.paper_count) || 0,
  }));
}

function createLibrary({ projectId = null, name, description = "", color = "#3973c8" }) {
  const db = requireDatabase();
  const resolvedProject = resolveLibraryProject(projectId);
  if (!canAccessProject(resolvedProject, "editor")) throw new Error("You do not have permission to add libraries to this project.");
  const createdAt = timestamp();
  const library = { id: randomUUID(), project_id: resolvedProject, name: name.trim(), description: description.trim(), color, cloud_library_id: null, created_at: createdAt, updated_at: createdAt, paper_count: 0 };
  db.prepare("INSERT INTO libraries (id, project_id, name, description, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(library.id, library.project_id, library.name, library.description, library.color, library.created_at, library.updated_at);
  recordAuditEvent(db, { projectId: resolvedProject, action: "library.created", targetType: "library", targetId: library.id, metadata: { name: library.name } });
  return library;
}

function updateLibrary(id, patch) {
  const db = requireDatabase();
  const current = db.prepare("SELECT id, project_id, name, description, color, created_at, updated_at FROM libraries WHERE id = ?").get(id);
  if (!current) throw new Error("Library not found.");
  if (!canAccessProject(current.project_id, "editor")) throw new Error("You do not have permission to edit this library.");
  const next = {
    name: typeof patch.name === "string" ? patch.name.trim() : current.name,
    description: typeof patch.description === "string" ? patch.description.trim() : current.description,
    color: typeof patch.color === "string" ? patch.color : current.color,
    updated_at: timestamp(),
  };
  db.prepare("UPDATE libraries SET name = ?, description = ?, color = ?, updated_at = ? WHERE id = ?")
    .run(next.name, next.description, next.color, next.updated_at, id);
  recordAuditEvent(db, { projectId: current.project_id, action: "library.updated", targetType: "library", targetId: id, metadata: { name: next.name } });
  return listLibraries(current.project_id).find((library) => library.id === id);
}

function deleteLibrary(id) {
  const db = requireDatabase();
  const current = db.prepare("SELECT project_id FROM libraries WHERE id = ?").get(id);
  if (!current) return { deleted: false };
  if (!canAccessProject(current.project_id, "editor")) throw new Error("You do not have permission to delete this library.");
  const count = db.prepare("SELECT COUNT(*) AS count FROM libraries WHERE project_id = ?").get(current.project_id);
  if (Number(count?.count) <= 1) throw new Error("A project needs at least one library.");
  const result = db.prepare("DELETE FROM libraries WHERE id = ?").run(id);
  db.prepare("DELETE FROM papers WHERE id NOT IN (SELECT paper_id FROM library_papers)").run();
  recordAuditEvent(db, { projectId: current.project_id, action: "library.deleted", targetType: "library", targetId: id });
  return { deleted: result.changes > 0 };
}

function listPapers(libraryId, query = "") {
  const db = requireDatabase();
  const library = db.prepare("SELECT project_id FROM libraries WHERE id = ?").get(libraryId);
  if (!library) throw new Error("Library not found.");
  if (!canAccessProject(library.project_id, "viewer")) throw new Error("You do not have access to this library.");
  const pattern = `%${query.trim()}%`;
  return db.prepare(`
    SELECT papers.* FROM papers
    INNER JOIN library_papers ON library_papers.paper_id = papers.id
    LEFT JOIN paper_user_state ON paper_user_state.paper_id = papers.id AND paper_user_state.user_id = ?
    WHERE library_papers.library_id = ?
      AND (? = '' OR papers.title LIKE ? OR papers.abstract LIKE ? OR papers.authors_json LIKE ? OR papers.venue LIKE ?)
    ORDER BY COALESCE(paper_user_state.starred, papers.starred) DESC, papers.year DESC, library_papers.added_at DESC
  `).all(localIdentity.userId, libraryId, query.trim(), pattern, pattern, pattern, pattern).map(hydratePaper);
}

function getPaper(id) {
  const db = requireDatabase();
  const paper = db.prepare("SELECT * FROM papers WHERE id = ?").get(id);
  return paper ? hydratePaper(paper) : null;
}

function getPaperReader(paperId, projectId = null) {
  const db = requireDatabase();
  const resolvedProject = resolveLibraryProject(projectId);
  if (!canAccessProject(resolvedProject, "viewer")) throw new Error("You do not have access to this paper in this project.");
  const asset = db.prepare("SELECT * FROM paper_reader_assets WHERE paper_id = ?").get(paperId);
  const pages = db.prepare("SELECT page_number, text FROM paper_reader_pages WHERE paper_id = ? ORDER BY page_number ASC").all(paperId);
  const highlights = db.prepare(`
    SELECT * FROM paper_highlights
    WHERE paper_id = ? AND project_id = ? AND (visibility = 'project' OR author_id = ?)
    ORDER BY page_number ASC, created_at DESC
  `).all(paperId, resolvedProject, localIdentity.userId);
  return { asset: asset ? { ...asset, truncated: Boolean(asset.truncated) } : null, pages, highlights };
}

const PAPER_REVIEWER_IDS = new Set(["related", "method", "experiments", "limitations"]);

function paperReviewText(value, limit = OUTPUT_LIMIT) {
  return String(value || "").slice(0, limit);
}

function normalizePaperReview(review) {
  if (!review || typeof review !== "object") throw new Error("A completed paper review is required.");
  const summary = paperReviewText(review.summary?.response);
  if (!summary.trim()) throw new Error("A completed research memorandum is required to save a paper review.");
  const specialists = Array.isArray(review.specialists) ? review.specialists
    .filter((report) => report && PAPER_REVIEWER_IDS.has(report.id))
    .map((report) => ({
      id: report.id,
      title: paperReviewText(report.title, 500),
      status: report.status === "complete" ? "complete" : "error",
      response: paperReviewText(report.response),
      error: paperReviewText(report.error, 10_000),
      repaired: Boolean(report.repaired),
    })) : [];
  if (!specialists.length) throw new Error("At least one specialist reading is required to save a paper review.");
  return {
    specialists,
    audit: paperReviewText(review.supervisor?.reason, 20_000),
    summary,
  };
}

function getPaperReview(paperId, projectId = null) {
  const db = requireDatabase();
  const resolvedProject = resolveLibraryProject(projectId);
  if (!canAccessProject(resolvedProject, "viewer")) return null;
  let row = db.prepare("SELECT * FROM paper_reviews WHERE project_id = ? AND paper_id = ? AND owner_id = ?").get(resolvedProject, paperId, localIdentity.userId);
  if (!row) row = db.prepare("SELECT * FROM paper_reviews WHERE project_id = ? AND paper_id = ? AND visibility = 'project' ORDER BY updated_at DESC LIMIT 1").get(resolvedProject, paperId);
  if (!row) return null;
  try {
    // Version 0.1.0 originally stored the complete review as review_json.
    // Continue to read it so an upgrade never discards an already completed review.
    if (typeof row.review_json === "string") {
      const legacy = JSON.parse(row.review_json);
      const normalized = normalizePaperReview({
        specialists: legacy.specialists,
        supervisor: { reason: legacy.audit ?? legacy.supervisor?.reason },
        summary: { response: typeof legacy.summary === "string" ? legacy.summary : legacy.summary?.response },
      });
      return { ...normalized, created_at: row.created_at, updated_at: row.updated_at };
    }
    // Some short-lived development builds used split columns. Keep them readable
    // rather than making a workspace's existing reviews disappear on upgrade.
    const specialists = JSON.parse(row.specialists_json);
    if (!Array.isArray(specialists)) throw new Error("Invalid specialist review data.");
    return {
      specialists,
      audit: String(row.audit || ""),
      summary: String(row.summary || ""),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  } catch {
    // A malformed legacy row should not prevent opening the paper reader.
    return null;
  }
}

function savePaperReview(paperId, review, projectId = null) {
  const db = requireDatabase();
  const resolvedProject = resolveLibraryProject(projectId);
  if (!canAccessProject(resolvedProject, "editor")) throw new Error("You do not have permission to save a review in this project.");
  if (!db.prepare("SELECT 1 FROM papers WHERE id = ?").get(paperId)) throw new Error("Paper not found.");
  const normalized = normalizePaperReview(review);
  const now = timestamp();
  const serialized = JSON.stringify({
    specialists: normalized.specialists,
    supervisor: { reason: normalized.audit },
    summary: { response: normalized.summary },
  });
  db.prepare(`
    INSERT INTO paper_reviews (id, project_id, paper_id, owner_id, visibility, review_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'private', ?, ?, ?)
    ON CONFLICT(project_id, paper_id, owner_id) DO UPDATE SET review_json = excluded.review_json, updated_at = excluded.updated_at
  `).run(randomUUID(), resolvedProject, paperId, localIdentity.userId, serialized, now, now);
  recordAuditEvent(db, { projectId: resolvedProject, action: "review.saved", targetType: "paper", targetId: paperId });
  return getPaperReview(paperId, resolvedProject);
}

const PAPER_PRESENTATION_SECTIONS = ["background", "related_work", "method", "experiments", "limitations"];
const PAPER_PRESENTATION_LAYOUTS = new Set(["outline", "editorial", "figure-led", "table-led", "split", "process", "comparison", "metrics", "evidence-pair", "boundaries", "closing"]);
const PAPER_PRESENTATION_VISUAL_KINDS = new Set(["source", "outline", "process", "comparison", "metrics", "table-led", "evidence-pair", "boundaries", "closing"]);
const PAPER_PRESENTATION_SOURCE_KINDS = new Set(["figure", "table", "diagram", "text", "page"]);
const PAPER_PRESENTATION_SOURCE_FOCUS = new Set(["full", "top", "middle", "bottom", "left", "right"]);

function normalizedPresentationCrop(crop) {
  if (!crop || typeof crop !== "object") return null;
  const values = [crop.x, crop.y, crop.width, crop.height].map(Number);
  if (!values.every(Number.isFinite)) return null;
  const [x, y, width, height] = values;
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1 || y + height > 1) return null;
  return { x, y, width, height };
}

function normalizePaperPresentationSlide(slide, index) {
  const section = PAPER_PRESENTATION_SECTIONS.includes(slide?.section) ? slide.section : "";
  if (!section) throw new Error(`Slide ${index + 1} has an unsupported presentation section.`);
  const sourceInput = slide.source && typeof slide.source === "object" ? slide.source : null;
  const page = Math.max(1, Math.min(5_000, Number(sourceInput?.page ?? slide.page) || 1));
  const visualInput = slide.visual && typeof slide.visual === "object" ? slide.visual : null;
  const normalized = {
    id: paperReviewText(slide.id || `${section}-${index + 1}`, 200),
    section,
    title: paperReviewText(slide.title, 1_000),
    summary: paperReviewText(slide.summary, 4_000),
    lead: paperReviewText(slide.lead ?? slide.summary, 4_000),
    bullets: Array.isArray(slide.bullets)
      ? slide.bullets.map((bullet) => paperReviewText(bullet, 1_000)).filter(Boolean).slice(0, 5)
      : [],
    takeaway: paperReviewText(slide.takeaway, 2_000),
    speaker_notes: paperReviewText(slide.speaker_notes, 6_000),
    page,
  };
  if (PAPER_PRESENTATION_LAYOUTS.has(slide.layout)) normalized.layout = slide.layout;
  if (sourceInput) {
    normalized.source = {
      page,
      label: paperReviewText(sourceInput.label || `PDF p. ${page}`, 1_000),
      kind: PAPER_PRESENTATION_SOURCE_KINDS.has(sourceInput.kind) ? sourceInput.kind : "page",
      figure: paperReviewText(sourceInput.figure, 300),
      panel: paperReviewText(sourceInput.panel, 200),
      focus: PAPER_PRESENTATION_SOURCE_FOCUS.has(sourceInput.focus) ? sourceInput.focus : "full",
      crop: normalizedPresentationCrop(sourceInput.crop),
    };
  }
  if (visualInput) {
    normalized.visual = {
      kind: PAPER_PRESENTATION_VISUAL_KINDS.has(visualInput.kind) ? visualInput.kind : "source",
      items: Array.isArray(visualInput.items) ? visualInput.items.slice(0, 6).map((item) => ({
        label: paperReviewText(item?.label, 500),
        value: paperReviewText(item?.value, 500),
        detail: paperReviewText(item?.detail, 2_000),
      })).filter((item) => item.label || item.value || item.detail) : [],
    };
  }
  return normalized;
}

function normalizePaperPresentation(presentation) {
  if (!presentation || typeof presentation !== "object") throw new Error("A completed paper presentation is required.");
  const slides = Array.isArray(presentation.slides) ? presentation.slides : [];
  // Content slides plus the separately rendered cover may total 15–18 pages.
  // Do not truncate the final limitations/discussion pages before validation.
  const normalizedSlides = slides.slice(0, 17).map(normalizePaperPresentationSlide);
  for (const section of PAPER_PRESENTATION_SECTIONS) {
    if (!normalizedSlides.some((slide) => slide.section === section)) throw new Error(`The paper presentation is missing its ${section} section.`);
  }
  let artifact;
  if (["pptd", "pptx"].includes(presentation.artifact?.kind)) {
    const safePath = (value, extension) => {
      const text = String(value || "").replaceAll("\\", "/");
      if (!/^\.archimedes\/presentations\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9.-]+$/i.test(text) ||
          !text.endsWith(extension) || text.split("/").includes("..")) {
        throw new Error("The presentation artifact path is invalid.");
      }
      return text;
    };
    const pageCount = Number(presentation.artifact.page_count);
    const isPptd = presentation.artifact.kind === "pptd";
    const expectedValidation = isPptd ? "passed" : "rendered";
    if (pageCount !== normalizedSlides.length + 1 || presentation.artifact.validation !== expectedValidation) {
      throw new Error("The presentation artifact is not a complete rendered deck.");
    }
    artifact = {
      kind: presentation.artifact.kind,
      pptx_path: safePath(presentation.artifact.pptx_path, ".pptx"),
      pdf_path: safePath(presentation.artifact.pdf_path, ".pdf"),
      page_count: pageCount,
      validation: expectedValidation,
      ...(isPptd ? { pptd_path: safePath(presentation.artifact.pptd_path, ".pptd") } : { renderer: "native-pptx" }),
    };
  }
  return {
    skill: {
      id: paperReviewText(presentation.skill?.id || "paper-presentation", 200),
      name: paperReviewText(presentation.skill?.name || "Paper presentation", 500),
      description: paperReviewText(presentation.skill?.description, 2_000),
      version: Math.max(1, Number(presentation.skill?.version) || 1),
    },
    title: paperReviewText(presentation.title, 2_000),
    subtitle: paperReviewText(presentation.subtitle, 4_000),
    source_sufficiency: ["full-paper", "partial-paper", "review-grounded"].includes(presentation.source_sufficiency)
      ? presentation.source_sufficiency
      : "review-grounded",
    generation_mode: presentation.generation_mode === "paper" ? "paper" : "review",
    slides: normalizedSlides,
    ...(artifact ? { artifact } : {}),
  };
}

function getPaperPresentation(paperId, projectId = null) {
  const db = requireDatabase();
  const resolvedProject = resolveLibraryProject(projectId);
  if (!canAccessProject(resolvedProject, "viewer")) return null;
  let row = db.prepare("SELECT * FROM paper_presentations WHERE project_id = ? AND paper_id = ? AND owner_id = ?").get(resolvedProject, paperId, localIdentity.userId);
  if (!row) row = db.prepare("SELECT * FROM paper_presentations WHERE project_id = ? AND paper_id = ? AND visibility = 'project' ORDER BY updated_at DESC LIMIT 1").get(resolvedProject, paperId);
  if (!row) return null;
  try {
    return {
      ...normalizePaperPresentation(JSON.parse(row.presentation_json)),
      source_review_updated_at: row.source_review_updated_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  } catch {
    return null;
  }
}

function savePaperPresentation(paperId, presentation, sourceReviewUpdatedAt, projectId = null) {
  const db = requireDatabase();
  const resolvedProject = resolveLibraryProject(projectId);
  if (!canAccessProject(resolvedProject, "editor")) throw new Error("You do not have permission to save a presentation in this project.");
  if (!db.prepare("SELECT 1 FROM papers WHERE id = ?").get(paperId)) throw new Error("Paper not found.");
  if (!String(sourceReviewUpdatedAt || "").trim()) throw new Error("The source review timestamp is required.");
  const normalized = normalizePaperPresentation(presentation);
  const now = timestamp();
  db.prepare(`
    INSERT INTO paper_presentations (id, project_id, paper_id, owner_id, visibility, presentation_json, source_review_updated_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'private', ?, ?, ?, ?)
    ON CONFLICT(project_id, paper_id, owner_id) DO UPDATE SET presentation_json = excluded.presentation_json,
      source_review_updated_at = excluded.source_review_updated_at, updated_at = excluded.updated_at
  `).run(randomUUID(), resolvedProject, paperId, localIdentity.userId, JSON.stringify(normalized), sourceReviewUpdatedAt, now, now);
  recordAuditEvent(db, { projectId: resolvedProject, action: "presentation.saved", targetType: "paper", targetId: paperId });
  return getPaperPresentation(paperId, resolvedProject);
}

function replacePaperReaderAsset(paperId, asset) {
  const db = requireDatabase();
  if (!db.prepare("SELECT 1 FROM papers WHERE id = ?").get(paperId)) throw new Error("Paper not found.");
  const now = timestamp();
  const insertPage = db.prepare("INSERT INTO paper_reader_pages (paper_id, page_number, text) VALUES (?, ?, ?)");
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM paper_reader_pages WHERE paper_id = ?").run(paperId);
    for (const page of asset.pages || []) insertPage.run(paperId, page.page_number, page.text || "");
    db.prepare(`
      INSERT INTO paper_reader_assets (paper_id, source_url, relative_path, sha256, status, error, size_bytes, page_count, truncated, warning, indexed_at, updated_at)
      VALUES (?, ?, ?, ?, 'ready', '', ?, ?, ?, ?, ?, ?)
      ON CONFLICT(paper_id) DO UPDATE SET source_url = excluded.source_url, relative_path = excluded.relative_path,
        sha256 = excluded.sha256, status = excluded.status, error = excluded.error, size_bytes = excluded.size_bytes,
        page_count = excluded.page_count, truncated = excluded.truncated, warning = excluded.warning,
        indexed_at = excluded.indexed_at, updated_at = excluded.updated_at
    `).run(paperId, asset.source_url || "", asset.relative_path, asset.sha256, asset.size_bytes, asset.page_count,
      Number(Boolean(asset.truncated)), asset.warning || "", now, now);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return getPaperReader(paperId);
}

function setPaperReaderFailed(paperId, error) {
  const db = requireDatabase();
  const now = timestamp();
  db.prepare(`
    INSERT INTO paper_reader_assets (paper_id, status, error, indexed_at, updated_at)
    VALUES (?, 'failed', ?, ?, ?)
    ON CONFLICT(paper_id) DO UPDATE SET status = 'failed', error = excluded.error, updated_at = excluded.updated_at
  `).run(paperId, String(error || "Unable to prepare the PDF."), now, now);
}

function findPaperPassages(paperId, query) {
  const db = requireDatabase();
  const needle = String(query || "").trim();
  if (!needle || needle.length > 200) throw new Error("Enter a search phrase of at most 200 characters.");
  // PDF extraction commonly inserts newlines, soft hyphens, or non-breaking
  // spaces inside one visible phrase. Build a normalized string while keeping
  // an index back to the stored page text for excerpts and highlights.
  const normalize = (value) => String(value || "").normalize("NFKC").toLocaleLowerCase()
    .replace(/[\u00ad\u200b]/g, "").replace(/[‐‑‒–—]/g, "-").replace(/-\s+/g, "-").replace(/\s+/g, " ").trim();
  const normalizedNeedle = normalize(needle);
  const rows = db.prepare("SELECT page_number, text FROM paper_reader_pages WHERE paper_id = ? ORDER BY page_number ASC")
    .all(paperId);
  const hits = [];
  for (const row of rows) {
    const source = String(row.text || "");
    const compact = [];
    const positions = [];
    for (let index = 0; index < source.length; index += 1) {
      const character = source[index].normalize("NFKC").toLocaleLowerCase();
      if (/[\u00ad\u200b]/.test(character)) continue;
      const value = /[‐‑‒–—]/.test(character) ? "-" : /\s/.test(character) ? " " : character;
      // A line ending hyphen is a PDF layout artefact, not a word boundary.
      if (value === " " && (compact.at(-1) === " " || compact.at(-1) === "-")) continue;
      compact.push(value); positions.push(index);
    }
    while (compact[0] === " ") { compact.shift(); positions.shift(); }
    while (compact.at(-1) === " ") { compact.pop(); positions.pop(); }
    const normalizedText = compact.join("");
    const index = normalizedText.indexOf(normalizedNeedle);
    if (index < 0) continue;
    const start = positions[index] ?? 0;
    const end = (positions[index + normalizedNeedle.length - 1] ?? start) + 1;
    hits.push({ page_number: row.page_number, start_offset: start, end_offset: end,
      excerpt: source.slice(Math.max(0, start - 180), Math.min(source.length, end + 220)).replace(/\s+/g, " ") });
    if (hits.length >= 24) break;
  }
  return hits;
}

function createPaperHighlight(paperId, input, projectId = null) {
  const db = requireDatabase();
  const resolvedProject = resolveLibraryProject(projectId);
  if (!canAccessProject(resolvedProject, "commenter")) throw new Error("You do not have permission to annotate this project.");
  const pageNumber = Number(input?.page_number);
  const quote = String(input?.quote || "").trim();
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || !quote || quote.length > 5_000) throw new Error("Choose a valid page and a short text selection.");
  if (!db.prepare("SELECT 1 FROM paper_reader_pages WHERE paper_id = ? AND page_number = ?").get(paperId, pageNumber)) throw new Error("That page has not been indexed yet.");
  const now = timestamp();
  const id = randomUUID();
  const visibility = input?.visibility === "private" ? "private" : "project";
  db.prepare(`INSERT INTO paper_highlights (id, project_id, paper_id, author_id, visibility, page_number, quote, start_offset, end_offset, note, color, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, resolvedProject, paperId, localIdentity.userId, visibility, pageNumber, quote,
      Number.isInteger(input.start_offset) ? input.start_offset : null,
      Number.isInteger(input.end_offset) ? input.end_offset : null, String(input.note || "").slice(0, 5_000),
      ["green", "yellow", "blue", "pink", "red"].includes(input.color) ? input.color : "green", now, now);
  return db.prepare("SELECT * FROM paper_highlights WHERE id = ?").get(id);
}

function deletePaperHighlight(id, projectId = null) {
  const db = requireDatabase();
  const highlight = db.prepare("SELECT id, project_id, author_id FROM paper_highlights WHERE id = ?").get(id);
  if (!highlight) return { deleted: false };
  if (projectId && highlight.project_id && projectId !== highlight.project_id) throw new Error("This annotation belongs to a different project.");
  const resolvedProject = projectId || highlight.project_id || ensureDefaultProject(db);
  if (!canAccessProject(resolvedProject, "commenter")) throw new Error("You do not have permission to remove this annotation.");
  if (highlight.author_id !== localIdentity.userId && !canAccessProject(resolvedProject, "editor")) throw new Error("You can only remove your own annotations.");
  return { deleted: db.prepare("DELETE FROM paper_highlights WHERE id = ?").run(id).changes > 0 };
}

function getPaperChatThread(paperId, projectId = null) {
  const db = requireDatabase();
  const resolvedProject = resolveLibraryProject(projectId);
  if (!canAccessProject(resolvedProject, "viewer")) return null;
  const row = db.prepare("SELECT thread_id FROM paper_chat_threads WHERE project_id = ? AND paper_id = ?").get(resolvedProject, paperId);
  if (!row) return null;
  try { return getResearchThread(row.thread_id); }
  catch {
    db.prepare("DELETE FROM paper_chat_threads WHERE project_id = ? AND paper_id = ?").run(resolvedProject, paperId);
    return null;
  }
}

function setPaperChatThread(paperId, threadId, projectId = null) {
  const db = requireDatabase();
  const resolvedProject = resolveLibraryProject(projectId);
  if (!canAccessProject(resolvedProject, "editor")) throw new Error("You do not have permission to save a paper chat in this project.");
  if (!db.prepare("SELECT 1 FROM papers WHERE id = ?").get(paperId)) throw new Error("Paper not found.");
  if (!db.prepare("SELECT 1 FROM research_threads WHERE id = ?").get(threadId)) throw new Error("Research thread not found.");
  const now = timestamp();
  db.prepare(`INSERT INTO paper_chat_threads (project_id, paper_id, thread_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(project_id, paper_id) DO UPDATE SET thread_id = excluded.thread_id, updated_at = excluded.updated_at`).run(resolvedProject, paperId, threadId, now, now);
  db.prepare("UPDATE research_threads SET project_id = ?, updated_at = ? WHERE id = ?").run(resolvedProject, now, threadId);
  return getPaperChatThread(paperId, resolvedProject);
}

function addPaper(libraryId, paper) {
  const db = requireDatabase();
  const library = db.prepare("SELECT id, project_id FROM libraries WHERE id = ?").get(libraryId);
  if (!library) throw new Error("Choose a valid library before importing a paper.");
  if (!canAccessProject(library.project_id, "editor")) throw new Error("You do not have permission to add papers to this library.");
  const conferenceJson = paper.conference && typeof paper.conference === "object" ? JSON.stringify(paper.conference) : null;
  if (conferenceJson && conferenceJson.length > 10000) throw new Error("Conference metadata is too large.");
  const now = timestamp();
  const key = String(paper.canonical_key || "").trim() || canonicalPaperKey(paper);
  const existing = db.prepare("SELECT id FROM papers WHERE canonical_key = ?").get(key);
  const paperId = existing?.id || randomUUID();

  if (!existing) {
    db.prepare(`
      INSERT INTO papers (
        id, canonical_key, title, authors_json, year, venue, abstract, url, pdf_url, doi, arxiv_id, s2_id,
        source, citation_count, github_url, github_stars, reading_status, starred, notes, tags_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unread', 0, '', '[]', ?, ?)
    `).run(
      paperId, key, paper.title.trim(), JSON.stringify(paper.authors || []), paper.year || null,
      paper.venue || "", paper.abstract || "", paper.url || "", paper.pdf_url || "", paper.doi || "",
      paper.arxiv_id || "", paper.s2_id || "", paper.source || "manual", paper.citation_count || 0,
      paper.github_url || "", Number(paper.github_stars) || 0, now, now,
    );
  }
  db.prepare(`
    INSERT OR IGNORE INTO paper_user_state (paper_id, user_id, reading_status, starred, notes, tags_json, created_at, updated_at)
    VALUES (?, ?, 'unread', 0, '', '[]', ?, ?)
  `).run(paperId, localIdentity.userId, now, now);
  if (paper.github_url) {
    db.prepare("UPDATE papers SET github_url = CASE WHEN github_url = '' THEN ? ELSE github_url END, github_stars = MAX(github_stars, ?), updated_at = ? WHERE id = ?")
      .run(paper.github_url, Number(paper.github_stars) || 0, now, paperId);
  }
  if (conferenceJson) {
    db.prepare(`UPDATE papers SET conference_json = ?, venue = ?, year = ?,
      pdf_url = CASE WHEN pdf_url = '' THEN ? ELSE pdf_url END, updated_at = ? WHERE id = ?`)
      .run(conferenceJson, paper.venue || "", paper.year || null, paper.pdf_url || "", now, paperId);
  }
  db.prepare("INSERT OR IGNORE INTO library_papers (library_id, paper_id, added_at) VALUES (?, ?, ?)").run(libraryId, paperId, now);
  db.prepare("UPDATE libraries SET updated_at = ? WHERE id = ?").run(now, libraryId);
  return hydratePaper(db.prepare("SELECT * FROM papers WHERE id = ?").get(paperId));
}

function linkLibraryToCloud(libraryId, cloudLibraryId) {
  const db = requireDatabase();
  const library = db.prepare("SELECT project_id FROM libraries WHERE id = ?").get(libraryId);
  if (!library) throw new Error("Library not found.");
  if (!canAccessProject(library.project_id, "editor")) throw new Error("You do not have permission to share this library.");
  const normalized = String(cloudLibraryId || "").trim();
  if (!normalized) throw new Error("A cloud library is required.");
  db.prepare("UPDATE libraries SET cloud_library_id = ?, updated_at = ? WHERE id = ?").run(normalized, timestamp(), libraryId);
  return listLibraries(library.project_id).find((candidate) => candidate.id === libraryId) || null;
}

function importCloudLibrary(projectId, { cloudLibraryId, name, description = "", color = "#3973c8" } = {}) {
  const db = requireDatabase();
  const normalized = String(cloudLibraryId || "").trim();
  if (!normalized) throw new Error("A cloud library is required.");
  const existing = db.prepare("SELECT id, project_id FROM libraries WHERE cloud_library_id = ?").get(normalized);
  if (existing) {
    return listLibraries(existing.project_id).find((candidate) => candidate.id === existing.id) || null;
  }
  const library = createLibrary({ projectId, name: String(name || "Shared library"), description, color });
  return linkLibraryToCloud(library.id, normalized);
}

function linkPaperToCloud(paperId, cloudPaperId) {
  const db = requireDatabase();
  const normalized = String(cloudPaperId || "").trim();
  if (!normalized) throw new Error("A cloud paper is required.");
  db.prepare("UPDATE papers SET cloud_paper_id = ?, updated_at = ? WHERE id = ?").run(normalized, timestamp(), paperId);
  return getPaper(paperId);
}

function syncPaperFromCloud(libraryId, cloudPaper) {
  const db = requireDatabase();
  const library = db.prepare("SELECT id, project_id FROM libraries WHERE id = ?").get(libraryId);
  if (!library) throw new Error("Library not found.");
  if (!canAccessProject(library.project_id, "editor")) throw new Error("You do not have permission to add papers to this library.");
  const cloudPaperId = String(cloudPaper.id || "").trim();
  const canonicalKey = String(cloudPaper.canonical_key || "").trim() || canonicalPaperKey(cloudPaper);
  let existing = cloudPaperId
    ? db.prepare("SELECT * FROM papers WHERE cloud_paper_id = ?").get(cloudPaperId)
    : null;
  if (!existing) existing = db.prepare("SELECT * FROM papers WHERE canonical_key = ?").get(canonicalKey);
  if (!existing) {
    const local = addPaper(libraryId, {
      ...cloudPaper,
      canonical_key: canonicalKey,
      authors: Array.isArray(cloudPaper.authors) ? cloudPaper.authors : [],
      conference: cloudPaper.conference || undefined,
    });
    const linked = linkPaperToCloud(local.id, cloudPaperId || local.id);
    return applyCloudPaperState(local.id, cloudPaper) || linked;
  }
  if (cloudPaperId) db.prepare("UPDATE papers SET cloud_paper_id = COALESCE(cloud_paper_id, ?) WHERE id = ?").run(cloudPaperId, existing.id);
  db.prepare("INSERT OR IGNORE INTO library_papers (library_id, paper_id, added_at) VALUES (?, ?, ?)").run(libraryId, existing.id, timestamp());
  db.prepare("UPDATE libraries SET updated_at = ? WHERE id = ?").run(timestamp(), libraryId);
  return getPaper(existing.id);
}

function applyCloudPaperState(paperId, state) {
  if (!state) return getPaper(paperId);
  const db = requireDatabase();
  const now = timestamp();
  db.prepare(`
    INSERT INTO paper_user_state (paper_id, user_id, reading_status, starred, notes, tags_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(paper_id, user_id) DO UPDATE SET reading_status = excluded.reading_status, starred = excluded.starred,
      notes = excluded.notes, tags_json = excluded.tags_json, updated_at = excluded.updated_at
  `).run(
    paperId,
    localIdentity.userId,
    ["unread", "reading", "read"].includes(state.reading_status) ? state.reading_status : "unread",
    state.starred ? 1 : 0,
    String(state.notes || ""),
    JSON.stringify(Array.isArray(state.tags) ? state.tags : (Array.isArray(state.tags_json) ? state.tags_json : [])),
    String(state.created_at || state.state_updated_at || now),
    String(state.state_updated_at || now),
  );
  return getPaper(paperId);
}

function updatePaper(id, patch) {
  const db = requireDatabase();
  const current = db.prepare("SELECT * FROM papers WHERE id = ?").get(id);
  if (!current) throw new Error("Paper not found.");
  const state = paperUserState(id) || {
    reading_status: current.reading_status,
    starred: current.starred,
    notes: current.notes,
    tags_json: current.tags_json,
    created_at: current.created_at,
  };
  const next = {
    title: typeof patch.title === "string" ? patch.title.trim() : current.title,
    reading_status: ["unread", "reading", "read"].includes(patch.reading_status) ? patch.reading_status : state.reading_status,
    starred: typeof patch.starred === "boolean" ? Number(patch.starred) : state.starred,
    notes: typeof patch.notes === "string" ? patch.notes : state.notes,
    tags_json: Array.isArray(patch.tags) ? JSON.stringify(patch.tags) : state.tags_json,
    updated_at: timestamp(),
  };
  db.prepare("UPDATE papers SET title = ?, updated_at = ? WHERE id = ?").run(next.title, next.updated_at, id);
  db.prepare(`
    INSERT INTO paper_user_state (paper_id, user_id, reading_status, starred, notes, tags_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(paper_id, user_id) DO UPDATE SET reading_status = excluded.reading_status, starred = excluded.starred,
      notes = excluded.notes, tags_json = excluded.tags_json, updated_at = excluded.updated_at
  `).run(id, localIdentity.userId, next.reading_status, next.starred, next.notes, next.tags_json, state.created_at || next.updated_at, next.updated_at);
  return hydratePaper(db.prepare("SELECT * FROM papers WHERE id = ?").get(id));
}

function removePaper(libraryId, paperId) {
  const db = requireDatabase();
  const library = db.prepare("SELECT project_id FROM libraries WHERE id = ?").get(libraryId);
  if (!library) throw new Error("Library not found.");
  if (!canAccessProject(library.project_id, "editor")) throw new Error("You do not have permission to remove papers from this library.");
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

function listResearchProjects({ archived = false } = {}) {
  const db = requireDatabase();
  return db.prepare(`
    SELECT research_projects.*,
      COUNT(CASE WHEN research_threads.id IS NOT NULL
        AND paper_chat_threads.thread_id IS NULL
        AND (CASE WHEN ? = 1 THEN research_threads.archived_at IS NOT NULL ELSE research_threads.archived_at IS NULL END)
        THEN 1 END) AS chat_count,
      MAX(CASE WHEN paper_chat_threads.thread_id IS NULL THEN research_threads.updated_at END) AS last_chat_at
    FROM research_projects
    LEFT JOIN research_threads ON research_threads.project_id = research_projects.id
    LEFT JOIN paper_chat_threads ON paper_chat_threads.thread_id = research_threads.id
    WHERE CASE WHEN ? = 1 THEN research_projects.archived_at IS NOT NULL ELSE research_projects.archived_at IS NULL END
      AND EXISTS (SELECT 1 FROM project_members WHERE project_members.project_id = research_projects.id AND project_members.user_id = ?)
    GROUP BY research_projects.id
    ORDER BY COALESCE(MAX(research_threads.updated_at), research_projects.updated_at) DESC
  `).all(archived ? 1 : 0, archived ? 1 : 0, localIdentity.userId);
}

function createResearchProject({ name, description = "", workspacePath = "" }) {
  const db = requireDatabase();
  const normalizedName = String(name || "").replace(/\s+/g, " ").trim();
  if (!normalizedName || normalizedName.length > 100) throw new Error("A project name of at most 100 characters is required.");
  const now = timestamp();
  const resolvedWorkspace = normalizeWorkspacePath(workspacePath) || activeWorkspace;
  const project = {
    id: randomUUID(),
    owner_id: localIdentity.userId,
    name: normalizedName,
    description: String(description || "").slice(0, 500),
    workspace_path: resolvedWorkspace,
    cloud_project_id: null,
    created_at: now,
    updated_at: now,
    archived_at: null,
    chat_count: 0,
    last_chat_at: null,
  };
  db.prepare(`
    INSERT INTO research_projects (id, owner_id, name, description, workspace_path, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(project.id, project.owner_id, project.name, project.description, project.workspace_path, project.created_at, project.updated_at);
  ensureProjectMember(db, project.id, project.owner_id, "owner");
  ensureProjectLibraries(db);
  return project;
}

function getResearchProject(id) {
  const db = requireDatabase();
  return db.prepare("SELECT * FROM research_projects WHERE id = ?").get(id) || null;
}

function linkResearchProjectToCloud(id, cloudProjectId) {
  const db = requireDatabase();
  if (!canAccessProject(id, "admin")) throw new Error("You do not have permission to share this project.");
  const normalized = String(cloudProjectId || "").trim();
  if (!normalized) throw new Error("A cloud project is required.");
  const existing = db.prepare("SELECT id FROM research_projects WHERE cloud_project_id = ? AND id <> ?").get(normalized, id);
  if (existing) throw new Error("That cloud project is already linked to another local project.");
  db.prepare("UPDATE research_projects SET cloud_project_id = ?, updated_at = ? WHERE id = ?").run(normalized, timestamp(), id);
  recordAuditEvent(db, { projectId: id, action: "project.cloud_linked", targetType: "project", targetId: normalized });
  return getResearchProject(id);
}

function importCloudProject({ cloudProjectId, name, description = "" } = {}) {
  const db = requireDatabase();
  const normalized = String(cloudProjectId || "").trim();
  if (!normalized) throw new Error("A cloud project is required.");
  const existing = db.prepare("SELECT * FROM research_projects WHERE cloud_project_id = ?").get(normalized);
  if (existing) return existing;
  const project = createResearchProject({ name, description });
  return linkResearchProjectToCloud(project.id, normalized);
}

function syncProjectMembersFromCloud(projectId, members = [], { currentEmail = "" } = {}) {
  const db = requireDatabase();
  if (!canAccessProject(projectId, "viewer")) throw new Error("You do not have access to this project.");
  const email = String(currentEmail || "").trim().toLowerCase();
  const now = timestamp();
  const remoteIds = [];
  db.exec("BEGIN");
  try {
    for (const member of Array.isArray(members) ? members : []) {
      const remoteId = String(member?.user_id || "").trim();
      if (!remoteId) continue;
      const memberEmail = String(member.email || "").trim().toLowerCase();
      if (email && memberEmail === email) continue;
      let memberRole = normalizeRole(member.role);
      if (memberRole === "owner") memberRole = "admin";
      const userId = remoteId;
      db.prepare(`
        INSERT INTO users (id, display_name, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET display_name = CASE WHEN excluded.display_name = '' THEN users.display_name ELSE excluded.display_name END,
          email = CASE WHEN excluded.email = '' THEN users.email ELSE excluded.email END,
          updated_at = excluded.updated_at
      `).run(userId, String(member.display_name || memberEmail || remoteId), memberEmail, now, now);
      db.prepare(`
        INSERT INTO project_members (project_id, user_id, role, joined_at, invited_by, source) VALUES (?, ?, ?, ?, NULL, 'cloud')
        ON CONFLICT(project_id, user_id) DO UPDATE SET role = excluded.role, source = 'cloud'
      `).run(projectId, userId, memberRole, String(member.joined_at || now));
      remoteIds.push(userId);
    }
    if (remoteIds.length) {
      const placeholders = remoteIds.map(() => "?").join(", ");
      db.prepare(`DELETE FROM project_members WHERE project_id = ? AND source = 'cloud' AND user_id NOT IN (${placeholders})`).run(projectId, ...remoteIds);
    } else {
      db.prepare("DELETE FROM project_members WHERE project_id = ? AND source = 'cloud'").run(projectId);
    }
    db.prepare("UPDATE research_projects SET updated_at = ? WHERE id = ?").run(now, projectId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return listProjectMembers(projectId);
}

function setResearchProjectWorkspace(id, workspacePath) {
  const db = requireDatabase();
  const resolvedWorkspace = normalizeWorkspacePath(workspacePath);
  if (!resolvedWorkspace) throw new Error("A project folder is required.");
  const now = timestamp();
  const result = db.prepare("UPDATE research_projects SET workspace_path = ?, updated_at = ? WHERE id = ?")
    .run(resolvedWorkspace, now, id);
  if (!result.changes) throw new Error("Research project not found.");
  return listResearchProjects().find((project) => project.id === id)
    || listResearchProjects({ archived: true }).find((project) => project.id === id);
}

function renameResearchProject(id, name) {
  const db = requireDatabase();
  const normalizedName = String(name || "").replace(/\s+/g, " ").trim();
  if (!normalizedName || normalizedName.length > 100) throw new Error("A project name of at most 100 characters is required.");
  const now = timestamp();
  const result = db.prepare("UPDATE research_projects SET name = ?, updated_at = ? WHERE id = ?").run(normalizedName, now, id);
  if (!result.changes) throw new Error("Research project not found.");
  return listResearchProjects().find((project) => project.id === id);
}

function archiveResearchProject(id, archived = true) {
  const db = requireDatabase();
  const project = db.prepare("SELECT id FROM research_projects WHERE id = ?").get(id);
  if (!project) throw new Error("Research project not found.");
  const now = timestamp();
  db.exec("BEGIN");
  try {
    db.prepare("UPDATE research_projects SET archived_at = ?, updated_at = ? WHERE id = ?").run(archived ? now : null, now, id);
    db.prepare("UPDATE research_threads SET archived_at = ?, updated_at = ? WHERE project_id = ?").run(archived ? now : null, now, id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { archived };
}

function deleteResearchProject(id) {
  const db = requireDatabase();
  const project = db.prepare("SELECT id FROM research_projects WHERE id = ?").get(id);
  if (!project) throw new Error("Research project not found.");
  const runningThread = db.prepare("SELECT id FROM research_threads WHERE project_id = ? AND status = 'running' LIMIT 1").get(id);
  if (runningThread) throw new Error("Stop the running research turn before removing this project.");

  db.exec("BEGIN");
  try {
    db.prepare(`
      DELETE FROM task_runs
      WHERE id IN (
        SELECT task_id FROM research_turns
        WHERE thread_id IN (SELECT id FROM research_threads WHERE project_id = ?)
          AND task_id IS NOT NULL
      )
    `).run(id);
    db.prepare("DELETE FROM research_threads WHERE project_id = ?").run(id);
    db.prepare("DELETE FROM libraries WHERE project_id = ?").run(id);
    db.prepare("DELETE FROM papers WHERE id NOT IN (SELECT paper_id FROM library_papers)").run();
    db.prepare("DELETE FROM research_projects WHERE id = ?").run(id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { deleted: true };
}

function listResearchThreads({ archived = false, projectId = null } = {}) {
  const db = requireDatabase();
  return db.prepare(`
    SELECT research_threads.*,
      COUNT(research_turns.id) AS turn_count,
      COALESCE(MAX(research_turns.created_at), research_threads.created_at) AS last_turn_at,
      (SELECT COUNT(*) FROM agent_actions
        JOIN research_turns pending_turn ON pending_turn.task_id = agent_actions.task_id
        WHERE pending_turn.thread_id = research_threads.id AND agent_actions.status = 'pending') AS pending_actions
    FROM research_threads
    LEFT JOIN research_turns ON research_turns.thread_id = research_threads.id
    LEFT JOIN paper_chat_threads ON paper_chat_threads.thread_id = research_threads.id
    WHERE CASE WHEN ? = 1 THEN research_threads.archived_at IS NOT NULL ELSE research_threads.archived_at IS NULL END
      AND (? IS NULL OR research_threads.project_id = ?)
      AND paper_chat_threads.thread_id IS NULL
      AND EXISTS (SELECT 1 FROM project_members WHERE project_members.project_id = research_threads.project_id AND project_members.user_id = ?)
      AND (research_threads.visibility = 'project' OR research_threads.owner_id = ?)
    GROUP BY research_threads.id
    ORDER BY research_threads.updated_at DESC
    LIMIT 120
  `).all(archived ? 1 : 0, projectId, projectId, localIdentity.userId, localIdentity.userId);
}

function createResearchThread({ prompt, mode, projectId, workspacePath = "", visibility = "project" }) {
  const db = requireDatabase();
  const selectedProject = projectId
    ? db.prepare("SELECT id, workspace_path FROM research_projects WHERE id = ? AND archived_at IS NULL").get(projectId)
    : null;
  if (projectId && (!selectedProject || !canAccessProject(projectId, "editor"))) throw new Error("You do not have access to create a thread in this project.");
  const resolvedProjectId = selectedProject?.id || ensureDefaultProject(db);
  const projectWorkspace = selectedProject?.workspace_path
    || db.prepare("SELECT workspace_path FROM research_projects WHERE id = ?").get(resolvedProjectId)?.workspace_path;
  // A session inherits its project's folder by default. Passing an explicit
  // path only snapshots that default; it is not a required binding step.
  const resolvedWorkspace = normalizeWorkspacePath(workspacePath)
    || projectWorkspace
    || activeWorkspace;
  const now = timestamp();
  const thread = {
    id: randomUUID(),
    project_id: resolvedProjectId,
    owner_id: localIdentity.userId,
    visibility: visibility === "private" ? "private" : "project",
    title: threadTitle(prompt),
    mode,
    status: "idle",
    context_summary: "",
    workspace_path: resolvedWorkspace,
    created_at: now,
    updated_at: now,
    archived_at: null,
  };
  db.prepare(`
    INSERT INTO research_threads (id, project_id, owner_id, visibility, title, mode, status, context_summary, workspace_path, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(thread.id, thread.project_id, thread.owner_id, thread.visibility, thread.title, thread.mode, thread.status, thread.context_summary, thread.workspace_path, thread.created_at, thread.updated_at);
  db.prepare("UPDATE research_projects SET updated_at = ? WHERE id = ?").run(now, resolvedProjectId);
  return { ...thread, turn_count: 0, last_turn_at: now };
}

function setResearchThreadVisibility(id, visibility) {
  const db = requireDatabase();
  const thread = db.prepare("SELECT id, project_id, owner_id, visibility FROM research_threads WHERE id = ?").get(id);
  if (!thread) throw new Error("Research thread not found.");
  if (!thread.project_id || !canAccessProject(thread.project_id, "editor")) throw new Error("You do not have permission to change this thread.");
  const nextVisibility = visibility === "private" ? "private" : "project";
  db.prepare("UPDATE research_threads SET visibility = ?, updated_at = ? WHERE id = ?").run(nextVisibility, timestamp(), id);
  recordAuditEvent(db, { projectId: thread.project_id, action: "thread.visibility_changed", targetType: "thread", targetId: id, metadata: { from: thread.visibility, to: nextVisibility } });
  return { visibility: nextVisibility };
}

function createThreadSnapshot(threadId) {
  const db = requireDatabase();
  const thread = db.prepare("SELECT * FROM research_threads WHERE id = ?").get(threadId);
  if (!thread) throw new Error("Research thread not found.");
  if (!canAccessProject(thread.project_id, "viewer")) throw new Error("You do not have access to this thread.");
  const turns = db.prepare(`
    SELECT id, mode, user_message, assistant_message, status, created_at, completed_at
    FROM research_turns WHERE thread_id = ? ORDER BY created_at ASC
  `).all(threadId);
  const events = db.prepare(`
    SELECT id, turn_id, sequence, type, payload_json, created_at
    FROM research_events WHERE thread_id = ? ORDER BY created_at ASC, sequence ASC
  `).all(threadId);
  const references = [];
  for (const event of events) {
    if (event.type !== "source_evidence" && event.type !== "tool_result") continue;
    try {
      const payload = JSON.parse(event.payload_json);
      if (payload.url && !references.some((item) => item.url === payload.url)) references.push({ url: payload.url, title: payload.title || "" });
    } catch {
      // A malformed historical event should not block the snapshot.
    }
  }
  const sequence = events.reduce((max, event) => Math.max(max, Number(event.sequence) || 0), 0);
  const manifest = {
    version: 1,
    thread: {
      id: thread.id,
      project_id: thread.project_id,
      owner_id: thread.owner_id,
      visibility: thread.visibility,
      title: thread.title,
      mode: thread.mode,
      created_at: thread.created_at,
      updated_at: thread.updated_at,
    },
    sequence,
    turns: turns.map((turn) => ({ ...turn, assistant_message: presentStoredAssistantMessage(turn.assistant_message) })),
    events: events.map((event) => ({ ...event, payload: JSON.parse(event.payload_json) })),
    references,
    artifacts: [],
  };
  const serialized = JSON.stringify(manifest);
  if (serialized.length > 5_000_000) throw new Error("This thread is too large to snapshot; archive or split it first.");
  const id = randomUUID();
  const now = timestamp();
  db.prepare(`INSERT INTO thread_snapshots (id, thread_id, project_id, owner_id, sequence, manifest_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, thread.id, thread.project_id, localIdentity.userId, sequence, serialized, now);
  recordAuditEvent(db, { projectId: thread.project_id, action: "thread.snapshot_created", targetType: "thread", targetId: thread.id, metadata: { snapshotId: id, sequence } });
  return { id, thread_id: thread.id, project_id: thread.project_id, sequence, created_at: now, manifest };
}

function listThreadSnapshots(threadId) {
  const db = requireDatabase();
  return db.prepare("SELECT id, thread_id, project_id, owner_id, sequence, created_at FROM thread_snapshots WHERE thread_id = ? ORDER BY created_at DESC").all(threadId);
}

function getThreadSnapshot(id) {
  const db = requireDatabase();
  const row = db.prepare("SELECT * FROM thread_snapshots WHERE id = ?").get(id);
  if (!row) return null;
  try { return { ...row, manifest: JSON.parse(row.manifest_json) }; }
  catch { return null; }
}

function archiveResearchThread(id, archived = true) {
  const db = requireDatabase();
  const thread = db.prepare("SELECT id, project_id, status FROM research_threads WHERE id = ?").get(id);
  if (!thread) throw new Error("Research thread not found.");
  if (thread.status === "running") throw new Error("Stop the running research turn before archiving this chat.");
  const now = timestamp();
  db.prepare("UPDATE research_threads SET archived_at = ?, updated_at = ? WHERE id = ?").run(archived ? now : null, now, id);
  if (thread.project_id) db.prepare("UPDATE research_projects SET updated_at = ? WHERE id = ?").run(now, thread.project_id);
  return getResearchThread(id);
}

function deleteResearchThread(id) {
  const db = requireDatabase();
  const thread = db.prepare("SELECT id, project_id, status FROM research_threads WHERE id = ?").get(id);
  if (!thread) throw new Error("Research thread not found.");
  if (thread.status === "running") throw new Error("Stop the running research turn before permanently deleting this chat.");

  db.exec("BEGIN");
  try {
    db.prepare(`
      DELETE FROM task_runs
      WHERE id IN (
        SELECT task_id FROM research_turns
        WHERE thread_id = ? AND task_id IS NOT NULL
      )
    `).run(id);
    db.prepare("DELETE FROM research_threads WHERE id = ?").run(id);
    if (thread.project_id) db.prepare("UPDATE research_projects SET updated_at = ? WHERE id = ?").run(timestamp(), thread.project_id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { deleted: true };
}

function deleteInternalPaperReviewThreads() {
  const db = requireDatabase();
  const rows = db.prepare(`
    SELECT DISTINCT research_threads.id
    FROM research_threads
    JOIN research_turns ON research_turns.thread_id = research_threads.id
    WHERE research_threads.archived_at IS NULL
      AND research_turns.mode = 'paper-review'
      AND (
        research_turns.user_message LIKE 'You are the % specialist in an evidence-first paper review of %'
        OR research_turns.user_message LIKE 'You are the Evidence Supervisor for a multi-agent review of %'
        OR research_turns.user_message LIKE 'You are revising the % report for % after an evidence audit.%'
        OR research_turns.user_message LIKE 'You are the Summary agent for an evidence-audited review of %'
      )
  `).all();
  const threadIds = rows.map((row) => row.id);
  for (const id of threadIds) deleteResearchThread(id);
  return { threadIds };
}

function getResearchThread(id) {
  const db = requireDatabase();
  const thread = db.prepare("SELECT * FROM research_threads WHERE id = ?").get(id);
  if (!thread) throw new Error("Research thread not found.");
  if (thread.project_id && !canAccessProject(thread.project_id, "viewer")) throw new Error("You do not have access to this research thread.");
  if (thread.visibility === "private" && thread.owner_id !== localIdentity.userId) throw new Error("This research thread is a private draft.");
  const turns = db.prepare(`
    SELECT id, thread_id, task_id, mode, user_message, assistant_message, status, created_at, completed_at
    FROM research_turns WHERE thread_id = ? ORDER BY created_at ASC
  `).all(id).map((turn) => ({
    ...turn,
    assistant_message: presentStoredAssistantMessage(turn.assistant_message),
  }));
  const sourcesByTurn = new Map();
  const sourceEvents = db.prepare(`
    SELECT turn_id, type, payload_json FROM research_events
    WHERE thread_id = ? AND type IN ('source_evidence', 'tool_result')
    ORDER BY CASE WHEN type = 'source_evidence' THEN 0 ELSE 1 END, created_at ASC, sequence ASC
  `).all(id);
  for (const event of sourceEvents) {
    try {
      const payload = JSON.parse(event.payload_json);
      if (event.type === "source_evidence") {
        if (payload.kind !== "read" || !payload.url) continue;
        const sources = sourcesByTurn.get(event.turn_id) || [];
        const previous = sources.find((item) => item.url === payload.url && item.endPage !== null && item.endPage + 1 === payload.page);
        if (previous) previous.endPage = payload.page;
        else if (!sources.some((item) => item.url === payload.url && item.startPage === (payload.page || null))) {
          sources.push({ url: payload.url, title: payload.title || new URL(payload.url).hostname,
            startPage: payload.page || null, endPage: payload.page || null,
            excerpt: payload.excerpt || "", query: payload.query || "", retrievedAt: payload.retrieved_at || "" });
        }
        sourcesByTurn.set(event.turn_id, sources);
        continue;
      }
      if (!["read_found_paper_pdf", "read_attached_paper_pdf", "open_web_page"].includes(payload.name)) continue;
      const result = JSON.parse(payload.content);
      const url = result.source_url || result.url;
      if (!url || !result.pages?.length && !result.text) continue;
      const sources = sourcesByTurn.get(event.turn_id) || [];
      if (sources.some((item) => item.url === url && item.retrievedAt)) continue;
      const source = {
        url,
        title: result.title || result.name || new URL(url).hostname,
        startPage: result.pages?.length ? result.start_page : null,
        endPage: result.pages?.length ? result.end_page : null,
      };
      if (!sources.some((item) => item.url === source.url && item.startPage === source.startPage && item.endPage === source.endPage)) {
        sources.push(source);
        sourcesByTurn.set(event.turn_id, sources);
      }
    } catch { /* Tool errors and older event formats do not contain source records. */ }
  }
  const events = db.prepare(`
    SELECT e.id, e.turn_id, e.sequence, e.type, e.payload_json, e.created_at
    FROM research_events e
    JOIN research_turns t ON t.id = e.turn_id
    WHERE e.thread_id = ?
    ORDER BY t.created_at ASC, t.rowid ASC, e.sequence ASC
  `).all(id).map((event, index) => {
    let payload;
    try {
      payload = JSON.parse(event.payload_json);
    } catch {
      payload = event.payload_json;
    }
    // `sequence` is scoped to a turn (every turn starts at 1). Journey,
    // Trajectory focus, summary coverage, and seen markers need one stable
    // order across the whole thread, so expose a thread-wide ordinal.
    return { id: event.id, turn_id: event.turn_id, sequence: event.sequence, ordinal: index + 1, type: event.type, payload, created_at: event.created_at };
  });
  const changeSets = db.prepare(`
    SELECT agent_actions.id, agent_actions.task_id, agent_actions.kind, agent_actions.payload_json,
      agent_actions.status, agent_actions.created_at, agent_actions.resolved_at, research_turns.id AS turn_id
    FROM agent_actions
    JOIN research_turns ON research_turns.task_id = agent_actions.task_id
    WHERE research_turns.thread_id = ? AND agent_actions.status = 'approved'
    ORDER BY agent_actions.created_at ASC
  `).all(id).flatMap((row) => {
    const action = hydrateAction(row);
    const changes = Array.isArray(action.payload.changes)
      ? action.payload.changes
      : action.payload.change ? [action.payload.change] : [];
    return changes.length ? [{
      id: action.id,
      actionId: action.id,
      taskId: action.task_id,
      threadId: id,
      turnId: row.turn_id,
      kind: action.kind,
      changes,
      createdAt: action.created_at,
    }] : [];
  });
  const pendingActions = db.prepare(`
    SELECT COUNT(*) AS count FROM agent_actions
    JOIN research_turns ON research_turns.task_id = agent_actions.task_id
    WHERE research_turns.thread_id = ? AND agent_actions.status = 'pending'
  `).get(id).count;
  return {
    ...thread,
    pending_actions: pendingActions,
    turn_count: turns.length,
    last_turn_at: turns.at(-1)?.created_at || thread.created_at,
    turns,
    changeSets,
    events,
    messages: turns.flatMap((turn) => {
      const items = [{ id: `${turn.id}:user`, turn_id: turn.id, role: "user", text: turn.user_message, created_at: turn.created_at }];
      if (turn.assistant_message) {
        items.push({ id: `${turn.id}:assistant`, turn_id: turn.id, role: "assistant", text: turn.assistant_message, created_at: turn.completed_at || turn.created_at, sources: sourcesByTurn.get(turn.id) || [] });
      }
      return items;
    }),
  };
}

function getResearchThreadIdForTask(taskId) {
  const db = requireDatabase();
  const turn = db.prepare(`
    SELECT thread_id FROM research_turns
    WHERE task_id = ? ORDER BY created_at DESC LIMIT 1
  `).get(taskId);
  return turn?.thread_id || null;
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

function updateActionPayload(id, patch) {
  const db = requireDatabase();
  const action = getAction(id);
  const payload = { ...action.payload, ...patch };
  db.prepare("UPDATE agent_actions SET payload_json = ? WHERE id = ?").run(JSON.stringify(payload), id);
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

function hydrateArtifact(row) {
  return {
    id: row.id,
    thread_id: row.thread_id,
    turn_id: row.turn_id || null,
    path: row.path,
    title: row.title,
    kind: row.kind,
    size_bytes: Number(row.size_bytes) || 0,
    modified_at: row.modified_at,
    version: Number(row.version) || 1,
    source: row.source,
    created_at: row.created_at,
    updated_at: row.updated_at,
    seen: Boolean(row.seen),
  };
}

function normalizeArtifactPath(value) {
  const normalized = String(value || "").replaceAll("\\", "/").replace(/^\/+/, "").trim();
  if (!normalized || normalized.split("/").includes("..")) throw new Error("Artifact path must stay inside the workspace.");
  return normalized;
}

function listArtifacts(threadId) {
  const db = requireDatabase();
  if (!threadId) return [];
  return db.prepare(`
    SELECT id, thread_id, turn_id, path, title, kind, size_bytes, modified_at, version, source, created_at, updated_at, seen
    FROM research_artifacts WHERE thread_id = ? ORDER BY updated_at DESC, created_at DESC
  `).all(threadId).map(hydrateArtifact);
}

function getArtifact(id) {
  const db = requireDatabase();
  const row = db.prepare(`
    SELECT id, thread_id, turn_id, path, title, kind, size_bytes, modified_at, version, source, created_at, updated_at, seen
    FROM research_artifacts WHERE id = ?
  `).get(id);
  return row ? hydrateArtifact(row) : null;
}

function upsertArtifact({ threadId, turnId = null, path: artifactPath, title = "", kind = "other", sizeBytes = 0, modifiedAt = timestamp(), source = "agent" } = {}) {
  const db = requireDatabase();
  if (!threadId) throw new Error("An artifact needs a research thread.");
  const thread = db.prepare("SELECT id FROM research_threads WHERE id = ?").get(threadId);
  if (!thread) throw new Error("Research thread not found.");
  const normalizedPath = normalizeArtifactPath(artifactPath);
  const now = timestamp();
  const existing = db.prepare("SELECT * FROM research_artifacts WHERE thread_id = ? AND path = ?").get(threadId, normalizedPath);
  const artifactTitle = String(title || existing?.title || normalizedPath.split("/").at(-1) || normalizedPath).trim();
  if (existing) {
    const version = Number(existing.version || 1) + 1;
    db.prepare(`
      UPDATE research_artifacts
      SET turn_id = ?, title = ?, kind = ?, size_bytes = ?, modified_at = ?, version = ?, source = ?, updated_at = ?, seen = 0
      WHERE id = ?
    `).run(turnId, artifactTitle, kind, Number(sizeBytes) || 0, modifiedAt, version, source, now, existing.id);
    return getArtifact(existing.id);
  }
  const id = randomUUID();
  db.prepare(`
    INSERT INTO research_artifacts (id, thread_id, turn_id, path, title, kind, size_bytes, modified_at, version, source, created_at, updated_at, seen)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 0)
  `).run(id, threadId, turnId, normalizedPath, artifactTitle, kind, Number(sizeBytes) || 0, modifiedAt, source, now, now);
  return getArtifact(id);
}

function markArtifactsSeen(threadId) {
  const db = requireDatabase();
  if (!threadId) return { marked: 0 };
  const result = db.prepare("UPDATE research_artifacts SET seen = 1 WHERE thread_id = ? AND seen = 0").run(threadId);
  return { marked: Number(result.changes) || 0 };
}

function countUnseenArtifacts(threadId) {
  const db = requireDatabase();
  if (!threadId) return 0;
  const row = db.prepare("SELECT COUNT(*) AS count FROM research_artifacts WHERE thread_id = ? AND seen = 0").get(threadId);
  return Number(row?.count) || 0;
}

function deleteArtifact(id) {
  const db = requireDatabase();
  return { deleted: Number(db.prepare("DELETE FROM research_artifacts WHERE id = ?").run(id).changes) > 0 };
}

const REPRODUCTION_STATUSES = new Set([
  "draft", "planned", "queued", "provisioning", "running",
  "diagnosing", "verified", "diverged", "blocked", "cancelled",
]);

const DEFAULT_REPRODUCTION_BUDGET = Object.freeze({ wallClockMin: 45, gpuHours: 2, maxFixAttempts: 3 });

function normalizeReproductionBudget(value) {
  const input = value && typeof value === "object" ? value : {};
  const bound = (raw, fallback, min, max) => {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
  };
  return {
    wallClockMin: bound(input.wallClockMin, DEFAULT_REPRODUCTION_BUDGET.wallClockMin, 1, 24 * 60),
    gpuHours: bound(input.gpuHours, DEFAULT_REPRODUCTION_BUDGET.gpuHours, 0, 24 * 30),
    maxFixAttempts: bound(input.maxFixAttempts, DEFAULT_REPRODUCTION_BUDGET.maxFixAttempts, 0, 10),
  };
}

function reproductionRow(row) {
  if (!row) return null;
  const parse = (value, fallback) => {
    if (!value) return fallback;
    try { return JSON.parse(value); } catch { return fallback; }
  };
  return {
    id: row.id,
    paper_id: row.paper_id || null,
    repo_url: row.repo_url || "",
    title: row.title,
    status: REPRODUCTION_STATUSES.has(row.status) ? row.status : "draft",
    source: parse(row.source_json, {}) || {},
    contract: parse(row.contract_json, null),
    budget: normalizeReproductionBudget(parse(row.budget_json, {})),
    error: row.error || "",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function createReproduction(input = {}) {
  const db = requireDatabase();
  const now = timestamp();
  const id = randomUUID();
  const paperId = typeof input.paperId === "string" && input.paperId ? input.paperId : null;
  const source = input.source && typeof input.source === "object" ? input.source : {};
  const paper = paperId ? db.prepare("SELECT title FROM papers WHERE id = ?").get(paperId) : null;
  const title = String(input.title || paper?.title || source.repo_url || "Untitled reproduction").slice(0, 300);
  const status = REPRODUCTION_STATUSES.has(input.status) ? input.status : "draft";
  db.prepare(`INSERT INTO reproductions
      (id, paper_id, repo_url, title, status, source_json, contract_json, budget_json, error, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL, ?, '', ?, ?)`).run(
    id, paperId, String(input.repoUrl || "").slice(0, 2_000), title, status,
    JSON.stringify(source), JSON.stringify(normalizeReproductionBudget(input.budget)), now, now,
  );
  return getReproduction(id);
}

function getReproduction(id) {
  const db = requireDatabase();
  return reproductionRow(db.prepare("SELECT * FROM reproductions WHERE id = ?").get(String(id || "")));
}

function listReproductions(limit = 100) {
  const db = requireDatabase();
  const bound = Math.min(500, Math.max(1, Math.trunc(Number(limit) || 100)));
  return db.prepare("SELECT * FROM reproductions ORDER BY updated_at DESC LIMIT ?").all(bound).map(reproductionRow);
}

function updateReproduction(id, patch = {}) {
  const db = requireDatabase();
  const current = getReproduction(id);
  if (!current) throw new Error("That reproduction does not exist.");
  const next = {
    title: typeof patch.title === "string" && patch.title.trim() ? patch.title.trim().slice(0, 300) : current.title,
    status: REPRODUCTION_STATUSES.has(patch.status) ? patch.status : current.status,
    repoUrl: typeof patch.repoUrl === "string" ? patch.repoUrl.slice(0, 2_000) : current.repo_url,
    source: patch.source && typeof patch.source === "object" ? patch.source : current.source,
    contract: "contract" in patch ? patch.contract : current.contract,
    budget: "budget" in patch ? normalizeReproductionBudget(patch.budget) : current.budget,
    error: typeof patch.error === "string" ? patch.error.slice(0, 4_000) : current.error,
  };
  db.prepare(`UPDATE reproductions
      SET title = ?, status = ?, repo_url = ?, source_json = ?, contract_json = ?, budget_json = ?, error = ?, updated_at = ?
      WHERE id = ?`).run(
    next.title, next.status, next.repoUrl, JSON.stringify(next.source),
    next.contract ? JSON.stringify(next.contract) : null, JSON.stringify(next.budget), next.error, timestamp(), String(id),
  );
  return getReproduction(id);
}

function deleteReproduction(id) {
  const db = requireDatabase();
  db.prepare("DELETE FROM reproductions WHERE id = ?").run(String(id || ""));
  return true;
}

module.exports = {
  addPaper,
  createComment,
  deleteComment,
  listComments,
  setCommentResolved,
  listAuditEvents,
  recordAuditEvent,
  addProjectMember,
  removeProjectMember,
  updateProjectMemberRole,
  canAccessProject,
  listProjectMembers,
  projectRoleForUser,
  setLocalIdentity,
  createReproduction,
  listLibraryProjects,
  deleteReproduction,
  getReproduction,
  listReproductions,
  updateReproduction,
  countUnseenArtifacts,
  deleteArtifact,
  getArtifact,
  listArtifacts,
  markArtifactsSeen,
  upsertArtifact,
  appendCommandOutput,
  appendResearchEvent,
  approveAction,
  createLibrary,
  createAction,
  createResearchProject,
  getResearchProject,
  linkResearchProjectToCloud,
  importCloudProject,
  syncProjectMembersFromCloud,
  linkLibraryToCloud,
  importCloudLibrary,
  linkPaperToCloud,
  syncPaperFromCloud,
  applyCloudPaperState,
  renameResearchProject,
  setResearchProjectWorkspace,
  createResearchThread,
  deleteLibrary,
  deleteInternalPaperReviewThreads,
  finishCommand,
  finishResearchTurn,
  finishTask,
  findPaperPassages,
  createPaperHighlight,
  deletePaperHighlight,
  getDailyFeedCache,
  getPaper,
  getPaperChatThread,
  getPaperReader,
  getPaperReview,
  getPaperPresentation,
  getAction,
  getResearchThread,
  getResearchThreadIdForTask,
  getResearchThreadContext,
  getSnapshot,
  archiveResearchProject,
  deleteResearchProject,
  archiveResearchThread,
  deleteResearchThread,
  listLibraries,
  listPapers,
  listResearchProjects,
  listResearchThreads,
  openWorkspace,
  removePaper,
  resolveAction,
  replacePaperReaderAsset,
  saveTask,
  savePaperReview,
  savePaperPresentation,
  setPaperReaderFailed,
  createThreadSnapshot,
  getThreadSnapshot,
  listThreadSnapshots,
  setPaperChatThread,
  setResearchThreadVisibility,
  setDailyFeedCache,
  startCommand,
  startResearchTurn,
  startTask,
  updateLibrary,
  updatePaper,
  updateActionPayload,
  updateResearchThreadSummary,
};
