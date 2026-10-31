const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const { randomUUID, createHash } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const { hasRole, isProjectRole, normalizeRole } = require("../electron/collaboration/roles.cjs");

const MAX_BODY_BYTES = 5_000_000;

function hashToken(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

function createCollabServer({ dbPath = ":memory:", devAuth = true } = {}) {
  if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      display_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS tokens (
      token_hash TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS project_members (
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      joined_at TEXT NOT NULL,
      PRIMARY KEY (project_id, user_id)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      body TEXT NOT NULL,
      author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      resolved_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS thread_snapshots (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      thread_id TEXT NOT NULL,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sequence INTEGER NOT NULL DEFAULT 0,
      manifest_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS idx_members_user ON project_members(user_id, project_id);
    CREATE INDEX IF NOT EXISTS idx_comments_resource ON comments(project_id, resource_type, resource_id, created_at);
  `);

  const now = () => new Date().toISOString();

  function userForToken(token) {
    if (!token) return null;
    const row = db.prepare("SELECT users.id, users.display_name, users.email FROM tokens JOIN users ON users.id = tokens.user_id WHERE tokens.token_hash = ?").get(hashToken(token));
    return row || null;
  }

  function roleFor(projectId, userId) {
    const row = db.prepare("SELECT role FROM project_members WHERE project_id = ? AND user_id = ?").get(projectId, userId);
    return row ? normalizeRole(row.role) : null;
  }

  function can(projectId, userId, required) {
    return hasRole(roleFor(projectId, userId), required);
  }

  function projectFor(projectId, userId, required = "viewer") {
    const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);
    if (!project) throw httpError(404, "Project not found.");
    if (!can(projectId, userId, required)) throw httpError(403, "You do not have access to this project.");
    return project;
  }

  function httpError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
  }

  function memberRows(projectId) {
    return db.prepare(`
      SELECT project_members.project_id, project_members.user_id, project_members.role, project_members.joined_at,
        users.display_name, users.email
      FROM project_members JOIN users ON users.id = project_members.user_id
      WHERE project_members.project_id = ?
      ORDER BY CASE project_members.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'editor' THEN 2 WHEN 'commenter' THEN 3 ELSE 4 END, project_members.joined_at
    `).all(projectId);
  }

  async function readBody(req) {
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) throw httpError(413, "Request body is too large.");
      chunks.push(chunk);
    }
    if (!chunks.length) return {};
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw httpError(400, "Request body must be JSON."); }
  }

  function send(res, status, body) {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(body));
  }

  function auth(req) {
    const header = String(req.headers.authorization || "");
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const user = userForToken(token);
    if (!user) throw httpError(401, "Authentication required.");
    return user;
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://localhost");
      const method = req.method || "GET";
      if (method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true, service: "archimedes-collab", version: 1 });
      if (method === "POST" && url.pathname === "/v1/dev-session") {
        if (!devAuth) throw httpError(404, "Dev auth is disabled.");
        const body = await readBody(req);
        const email = String(body.email || "").trim().toLowerCase();
        const displayName = String(body.displayName || "").trim() || email.split("@")[0] || "Researcher";
        if (!email.includes("@") || email.length > 320) throw httpError(400, "A valid email is required.");
        let user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
        if (!user) {
          user = { id: randomUUID(), display_name: displayName, email, created_at: now() };
          db.prepare("INSERT INTO users (id, display_name, email, created_at) VALUES (?, ?, ?, ?)").run(user.id, user.display_name, user.email, user.created_at);
        }
        const token = `tok_${randomUUID()}`;
        db.prepare("INSERT INTO tokens (token_hash, user_id, created_at) VALUES (?, ?, ?)").run(hashToken(token), user.id, now());
        return send(res, 201, { token, user });
      }
      const user = auth(req);

      if (method === "GET" && url.pathname === "/v1/me") return send(res, 200, { user });

      if (method === "GET" && url.pathname === "/v1/projects") {
        const projects = db.prepare(`
          SELECT projects.*, project_members.role FROM projects
          JOIN project_members ON project_members.project_id = projects.id
          WHERE project_members.user_id = ? ORDER BY projects.created_at DESC
        `).all(user.id);
        return send(res, 200, { projects });
      }

      if (method === "POST" && url.pathname === "/v1/projects") {
        const body = await readBody(req);
        const name = String(body.name || "").trim();
        if (!name || name.length > 100) throw httpError(400, "A project name is required.");
        const project = { id: randomUUID(), name, description: String(body.description || "").slice(0, 500), created_at: now() };
        db.prepare("INSERT INTO projects (id, name, description, created_at) VALUES (?, ?, ?, ?)").run(project.id, project.name, project.description, project.created_at);
        db.prepare("INSERT INTO project_members (project_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)").run(project.id, user.id, project.created_at);
        return send(res, 201, { project: { ...project, role: "owner" } });
      }

      const projectMatch = url.pathname.match(/^\/v1\/projects\/([^/]+)(?:\/(members|comments))?$/);
      if (projectMatch) {
        const projectId = projectMatch[1];
        const section = projectMatch[2];
        if (!section && method === "GET") {
          const project = projectFor(projectId, user.id);
          return send(res, 200, { project: { ...project, role: roleFor(projectId, user.id) } });
        }
        if (section === "members" && method === "GET") {
          projectFor(projectId, user.id);
          return send(res, 200, { members: memberRows(projectId) });
        }
        if (section === "members" && method === "POST") {
          projectFor(projectId, user.id, "admin");
          const body = await readBody(req);
          const email = String(body.email || "").trim().toLowerCase();
          const role = normalizeRole(body.role, "viewer");
          if (!email.includes("@") || !isProjectRole(role) || role === "owner") throw httpError(400, "A member email and non-owner role are required.");
          let member = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
          if (!member) {
            member = { id: randomUUID(), display_name: String(body.displayName || email.split("@")[0]).slice(0, 80), email, created_at: now() };
            db.prepare("INSERT INTO users (id, display_name, email, created_at) VALUES (?, ?, ?, ?)").run(member.id, member.display_name, member.email, member.created_at);
          }
          db.prepare("INSERT INTO project_members (project_id, user_id, role, joined_at) VALUES (?, ?, ?, ?) ON CONFLICT(project_id, user_id) DO UPDATE SET role = excluded.role").run(projectId, member.id, role, now());
          return send(res, 201, { member: memberRows(projectId).find((item) => item.user_id === member.id) });
        }
        if (section === "comments" && method === "GET") {
          projectFor(projectId, user.id);
          const resourceType = String(url.searchParams.get("resourceType") || "thread");
          const resourceId = String(url.searchParams.get("resourceId") || "");
          if (!["thread", "paper", "review", "artifact"].includes(resourceType) || !resourceId) throw httpError(400, "A comment resource is required.");
          const includeResolved = url.searchParams.get("includeResolved") !== "false";
          const comments = db.prepare(`
            SELECT comments.*, users.display_name AS author_name FROM comments JOIN users ON users.id = comments.author_id
            WHERE comments.project_id = ? AND comments.resource_type = ? AND comments.resource_id = ?
              AND (? = 1 OR comments.resolved_at IS NULL)
            ORDER BY comments.created_at ASC
          `).all(projectId, resourceType, resourceId, includeResolved ? 1 : 0);
          return send(res, 200, { comments });
        }
        if (section === "comments" && method === "POST") {
          projectFor(projectId, user.id, "commenter");
          const body = await readBody(req);
          const resourceType = String(body.resourceType || "thread");
          const resourceId = String(body.resourceId || "");
          const text = String(body.body || "").trim();
          if (!["thread", "paper", "review", "artifact"].includes(resourceType) || !resourceId || !text || text.length > 10_000) throw httpError(400, "A resource and a comment of at most 10000 characters are required.");
          const comment = { id: randomUUID(), project_id: projectId, resource_type: resourceType, resource_id: resourceId, body: text, author_id: user.id, resolved_at: null, created_at: now(), updated_at: now() };
          db.prepare("INSERT INTO comments (id, project_id, resource_type, resource_id, body, author_id, resolved_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(comment.id, comment.project_id, comment.resource_type, comment.resource_id, comment.body, comment.author_id, null, comment.created_at, comment.updated_at);
          return send(res, 201, { comment: { ...comment, author_name: user.display_name } });
        }
      }

      const commentMatch = url.pathname.match(/^\/v1\/comments\/([^/]+)$/);
      if (commentMatch && method === "PATCH") {
        const comment = db.prepare("SELECT * FROM comments WHERE id = ?").get(commentMatch[1]);
        if (!comment) throw httpError(404, "Comment not found.");
        projectFor(comment.project_id, user.id, "commenter");
        if (comment.author_id !== user.id && !can(comment.project_id, user.id, "editor")) throw httpError(403, "Only the author or an editor can resolve this comment.");
        const body = await readBody(req);
        const resolved = body.resolved !== false;
        db.prepare("UPDATE comments SET resolved_at = ?, updated_at = ? WHERE id = ?").run(resolved ? now() : null, now(), comment.id);
        return send(res, 200, { comment: { ...comment, resolved_at: resolved ? now() : null } });
      }

      const snapshotMatch = url.pathname.match(/^\/v1\/projects\/([^/]+)\/threads\/([^/]+)\/snapshots$/);
      if (snapshotMatch && method === "POST") {
        projectFor(snapshotMatch[1], user.id, "editor");
        const body = await readBody(req);
        const manifest = body.manifest && typeof body.manifest === "object" ? body.manifest : null;
        if (!manifest) throw httpError(400, "A snapshot manifest is required.");
        const snapshot = { id: randomUUID(), project_id: snapshotMatch[1], thread_id: snapshotMatch[2], owner_id: user.id, sequence: Number(body.sequence) || Number(manifest.sequence) || 0, created_at: now() };
        const json = JSON.stringify(manifest);
        if (json.length > 5_000_000) throw httpError(413, "Snapshot manifest is too large.");
        db.prepare("INSERT INTO thread_snapshots (id, project_id, thread_id, owner_id, sequence, manifest_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(snapshot.id, snapshot.project_id, snapshot.thread_id, snapshot.owner_id, snapshot.sequence, json, snapshot.created_at);
        return send(res, 201, { snapshot: { ...snapshot, manifest } });
      }

      throw httpError(404, "Not found.");
    } catch (error) {
      const status = Number(error?.status) || 500;
      if (status >= 500) console.error(error);
      send(res, status, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  return {
    server,
    db,
    listen(port = 0, host = "127.0.0.1") {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          resolve(server.address());
        });
      });
    },
    close() {
      return new Promise((resolve) => server.close(() => { db.close(); resolve(); }));
    },
  };
}

module.exports = { createCollabServer };
