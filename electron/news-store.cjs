const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

/**
 * SQLite cache for news items and per-source refresh state.
 *
 * The renderer never touches this database; it goes through the news IPC
 * surface. Rows keep the normalized item plus the source-native fields and the
 * original media list so the renderer can rebuild the platform look.
 */

let database = null;
let databasePath = "";

function initialize(userDataPath) {
  databasePath = path.join(userDataPath, "news.sqlite");
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS news_items (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      source_label TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      author TEXT DEFAULT '',
      published_at TEXT DEFAULT '',
      fetched_at TEXT NOT NULL,
      score INTEGER DEFAULT 0,
      comments INTEGER DEFAULT 0,
      summary TEXT DEFAULT '',
      tags_json TEXT DEFAULT '[]',
      media_json TEXT DEFAULT '[]',
      native_json TEXT DEFAULT '{}',
      cluster_id TEXT DEFAULT '',
      saved INTEGER DEFAULT 0,
      read INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS news_items_source ON news_items (source, published_at DESC);
    CREATE INDEX IF NOT EXISTS news_items_cluster ON news_items (cluster_id);
    CREATE TABLE IF NOT EXISTS news_source_state (
      source TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'idle',
      message TEXT DEFAULT '',
      last_attempt_at TEXT DEFAULT '',
      last_success_at TEXT DEFAULT '',
      etag TEXT DEFAULT '',
      last_modified TEXT DEFAULT ''
    );
  `);
  return { path: databasePath };
}

function db() {
  if (!database) throw new Error("News store is not initialized.");
  return database;
}

function requireDatabase() {
  return db();
}

function hydrate(row) {
  if (!row) return null;
  return {
    id: row.id,
    source: row.source,
    sourceLabel: row.source_label,
    title: row.title,
    url: row.url,
    author: row.author,
    publishedAt: row.published_at,
    fetchedAt: row.fetched_at,
    score: Number(row.score) || 0,
    comments: Number(row.comments) || 0,
    summary: row.summary,
    tags: JSON.parse(row.tags_json || "[]"),
    media: JSON.parse(row.media_json || "[]"),
    native: JSON.parse(row.native_json || "{}"),
    clusterId: row.cluster_id || "",
    saved: Boolean(row.saved),
    read: Boolean(row.read),
  };
}

function upsertItems(items) {
  if (!Array.isArray(items) || !items.length) return 0;
  const statement = db().prepare(`
    INSERT INTO news_items (
      id, source, source_label, title, url, author, published_at, fetched_at,
      score, comments, summary, tags_json, media_json, native_json, cluster_id, saved, read
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', 0, 0)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      url = excluded.url,
      author = excluded.author,
      published_at = excluded.published_at,
      fetched_at = excluded.fetched_at,
      score = excluded.score,
      comments = excluded.comments,
      summary = excluded.summary,
      tags_json = excluded.tags_json,
      media_json = excluded.media_json,
      native_json = excluded.native_json
  `);
  const now = new Date().toISOString();
  let written = 0;
  db().exec("BEGIN");
  try {
    for (const item of items) {
      if (!item?.id || !item?.title) continue;
      statement.run(
        item.id, item.source, item.sourceLabel || item.source, item.title, item.url, item.author || "",
        item.publishedAt || "", now, Number(item.score) || 0, Number(item.comments) || 0,
        item.summary || "", JSON.stringify(item.tags || []), JSON.stringify(item.media || []),
        JSON.stringify(item.native || {}),
      );
      written += 1;
    }
    db().exec("COMMIT");
  } catch (error) {
    db().exec("ROLLBACK");
    throw error;
  }
  return written;
}

function listItems(filters = {}) {
  const clauses = [];
  const params = [];
  const sinceHours = Number(filters.sinceHours) || 0;
  if (filters.source && filters.source !== "all") {
    clauses.push("source = ?");
    params.push(String(filters.source));
  }
  if (sinceHours > 0) {
    clauses.push("COALESCE(NULLIF(published_at, ''), fetched_at) >= ?");
    params.push(new Date(Date.now() - sinceHours * 3600000).toISOString());
  }
  if (filters.query) {
    const like = `%${String(filters.query).trim()}%`;
    clauses.push("(title LIKE ? OR summary LIKE ?)");
    params.push(like, like);
  }
  if (filters.savedOnly) clauses.push("saved = 1");
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const order = filters.sort === "hot"
    ? "ORDER BY score DESC, COALESCE(NULLIF(published_at, ''), fetched_at) DESC"
    : "ORDER BY COALESCE(NULLIF(published_at, ''), fetched_at) DESC";
  const limit = Math.min(Math.max(Number(filters.limit) || 300, 1), 1000);
  const rows = db().prepare(`SELECT * FROM news_items ${where} ${order} LIMIT ?`).all(...params, limit);
  return rows.map(hydrate);
}

function sourceSummary(sinceHours = 0) {
  const cutoff = sinceHours > 0 ? new Date(Date.now() - sinceHours * 3600000).toISOString() : "";
  const rows = cutoff
    ? db().prepare(`SELECT source, COUNT(*) AS total, SUM(CASE WHEN read = 0 THEN 1 ELSE 0 END) AS unread
        FROM news_items WHERE COALESCE(NULLIF(published_at, ''), fetched_at) >= ? GROUP BY source`).all(cutoff)
    : db().prepare("SELECT source, COUNT(*) AS total, SUM(CASE WHEN read = 0 THEN 1 ELSE 0 END) AS unread FROM news_items GROUP BY source").all();
  const states = new Map(db().prepare("SELECT * FROM news_source_state").all().map((row) => [row.source, row]));
  return rows.map((row) => {
    const state = states.get(row.source) || {};
    return {
      source: row.source,
      total: Number(row.total) || 0,
      unread: Number(row.unread) || 0,
      status: state.status || "idle",
      message: state.message || "",
      lastSuccessAt: state.last_success_at || "",
    };
  });
}

function markRead(id, read) {
  db().prepare("UPDATE news_items SET read = ? WHERE id = ?").run(read ? 1 : 0, String(id));
}

function setSaved(id, saved) {
  db().prepare("UPDATE news_items SET saved = ? WHERE id = ?").run(saved ? 1 : 0, String(id));
}

function markAllRead(source = "") {
  if (source && source !== "all") db().prepare("UPDATE news_items SET read = 1 WHERE source = ?").run(String(source));
  else db().exec("UPDATE news_items SET read = 1");
}

function updateClusters(assignments) {
  if (!assignments || typeof assignments !== "object") return;
  const statement = db().prepare("UPDATE news_items SET cluster_id = ? WHERE id = ?");
  db().exec("BEGIN");
  try {
    for (const [id, clusterId] of Object.entries(assignments)) statement.run(String(clusterId), String(id));
    db().exec("COMMIT");
  } catch (error) {
    db().exec("ROLLBACK");
    throw error;
  }
}

function recentForClustering(days = 3, limit = 800) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  return db().prepare(`
    SELECT id, title, url, source, published_at, score FROM news_items
    WHERE COALESCE(NULLIF(published_at, ''), fetched_at) >= ?
    ORDER BY COALESCE(NULLIF(published_at, ''), fetched_at) DESC
    LIMIT ?
  `).all(cutoff, limit);
}

function getSourceState(source) {
  return db().prepare("SELECT * FROM news_source_state WHERE source = ?").get(String(source)) || {
    source, status: "idle", message: "", last_attempt_at: "", last_success_at: "", etag: "", last_modified: "",
  };
}

function setSourceState(source, patch = {}) {
  const current = getSourceState(source);
  db().prepare(`
    INSERT INTO news_source_state (source, status, message, last_attempt_at, last_success_at, etag, last_modified)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source) DO UPDATE SET
      status = excluded.status,
      message = excluded.message,
      last_attempt_at = excluded.last_attempt_at,
      last_success_at = excluded.last_success_at,
      etag = excluded.etag,
      last_modified = excluded.last_modified
  `).run(
    String(source),
    patch.status ?? current.status ?? "idle",
    patch.message ?? current.message ?? "",
    patch.lastAttemptAt ?? current.last_attempt_at ?? "",
    patch.lastSuccessAt ?? current.last_success_at ?? "",
    patch.etag ?? current.etag ?? "",
    patch.lastModified ?? current.last_modified ?? "",
  );
}

function prune({ days = 14, maxItems = 3000 } = {}) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  db().prepare("DELETE FROM news_items WHERE saved = 0 AND COALESCE(NULLIF(published_at, ''), fetched_at) < ?").run(cutoff);
  const excess = db().prepare("SELECT COUNT(*) AS count FROM news_items WHERE saved = 0").get().count - maxItems;
  if (excess > 0) {
    db().prepare(`
      DELETE FROM news_items WHERE id IN (
        SELECT id FROM news_items WHERE saved = 0
        ORDER BY COALESCE(NULLIF(published_at, ''), fetched_at) ASC LIMIT ?
      )
    `).run(excess);
  }
}

function close() {
  if (database) {
    database.close();
    database = null;
  }
}

module.exports = {
  initialize,
  upsertItems,
  listItems,
  sourceSummary,
  markRead,
  setSaved,
  markAllRead,
  updateClusters,
  recentForClustering,
  getSourceState,
  setSourceState,
  prune,
  close,
  // exposed for tests
  _hydrate: hydrate,
};
