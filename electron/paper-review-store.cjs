const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

/**
 * Local-only storage for the Paper review micro app.
 *
 * Documents (page text) and runs live in their own SQLite file so the micro
 * app stays independent from Library sync. Run JSON is the source of truth for
 * the UI; findings and scores are also normalized for audit and future
 * benchmark tooling.
 */

let database = null;
let databasePath = "";

function initialize(userDataPath) {
  databasePath = path.join(userDataPath, "paper-review.sqlite");
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS paper_review_documents (
      id TEXT PRIMARY KEY,
      source_kind TEXT NOT NULL,
      source_ref TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      page_count INTEGER NOT NULL DEFAULT 0,
      text_chars INTEGER NOT NULL DEFAULT 0,
      pages_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS paper_review_runs (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL DEFAULT '',
      project_id TEXT NOT NULL DEFAULT '',
      source_kind TEXT NOT NULL DEFAULT '',
      source_ref TEXT NOT NULL DEFAULT '',
      paper_title TEXT NOT NULL DEFAULT '',
      venue_id TEXT NOT NULL DEFAULT '',
      venue_version TEXT NOT NULL DEFAULT '',
      model_provider TEXT NOT NULL DEFAULT '',
      model_base_url TEXT NOT NULL DEFAULT '',
      model_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'running',
      stage TEXT NOT NULL DEFAULT 'queued',
      progress INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      finished_at TEXT NOT NULL DEFAULT '',
      overall_score REAL,
      calibrated_score REAL,
      confidence REAL,
      decision TEXT NOT NULL DEFAULT '',
      desk_reject_risk TEXT NOT NULL DEFAULT '',
      expected_outcome TEXT NOT NULL DEFAULT '',
      cost_tokens INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      error TEXT NOT NULL DEFAULT '',
      result_json TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS paper_review_runs_created ON paper_review_runs (created_at DESC);
    CREATE INDEX IF NOT EXISTS paper_review_runs_venue ON paper_review_runs (venue_id, overall_score);
    CREATE TABLE IF NOT EXISTS paper_review_findings (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      reviewer_label TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL,
      text TEXT NOT NULL,
      evidence_page INTEGER,
      evidence_quote TEXT NOT NULL DEFAULT '',
      severity TEXT NOT NULL DEFAULT '',
      dimension_id TEXT NOT NULL DEFAULT '',
      confidence REAL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS paper_review_findings_run ON paper_review_findings (run_id);
    CREATE TABLE IF NOT EXISTS paper_review_scores (
      run_id TEXT NOT NULL,
      dimension_id TEXT NOT NULL,
      dimension_label TEXT NOT NULL DEFAULT '',
      score REAL,
      rationale TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (run_id, dimension_id)
    );
  `);
  return { path: databasePath };
}

function db() {
  if (!database) throw new Error("Paper review storage is not initialized.");
  return database;
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function saveDocument({ id, sourceKind, sourceRef, title, pageCount, pages }) {
  const textChars = (pages || []).reduce((total, page) => total + String(page.text || "").length, 0);
  const now = new Date().toISOString();
  db().prepare(`
    INSERT INTO paper_review_documents (id, source_kind, source_ref, title, page_count, text_chars, pages_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      page_count = excluded.page_count,
      text_chars = excluded.text_chars,
      pages_json = excluded.pages_json
  `).run(
    String(id), String(sourceKind || ""), String(sourceRef || ""), String(title || ""),
    Number(pageCount) || 0, textChars, JSON.stringify(pages || []), now,
  );
  return getDocument(id);
}

function getDocument(id) {
  const row = db().prepare("SELECT * FROM paper_review_documents WHERE id = ?").get(String(id));
  if (!row) return null;
  return {
    id: row.id,
    sourceKind: row.source_kind,
    sourceRef: row.source_ref,
    title: row.title,
    pageCount: Number(row.page_count) || 0,
    textChars: Number(row.text_chars) || 0,
    pages: parseJson(row.pages_json, []),
    createdAt: row.created_at,
  };
}

function createRun({ documentId, projectId, sourceKind, sourceRef, paperTitle, venueId, venueVersion, modelProvider, modelBaseUrl, modelId }) {
  const id = randomUUID();
  const now = new Date().toISOString();
  db().prepare(`
    INSERT INTO paper_review_runs (
      id, document_id, project_id, source_kind, source_ref, paper_title, venue_id, venue_version,
      model_provider, model_base_url, model_id, status, stage, progress, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'running', 'queued', 0, ?)
  `).run(
    id, String(documentId || ""), String(projectId || ""), String(sourceKind || ""), String(sourceRef || ""),
    String(paperTitle || ""), String(venueId || ""), String(venueVersion || ""), String(modelProvider || ""),
    String(modelBaseUrl || ""), String(modelId || ""), now,
  );
  return id;
}

function updateRun(id, patch = {}) {
  const current = getRunRow(id);
  if (!current) return null;
  const next = {
    stage: patch.stage ?? current.stage,
    progress: patch.progress === undefined ? Number(current.progress) || 0 : Math.max(0, Math.min(100, Math.round(Number(patch.progress) || 0))),
    status: patch.status ?? current.status,
    error: patch.error ?? current.error,
    cost_tokens: patch.costTokens === undefined ? Number(current.cost_tokens) || 0 : Number(patch.costTokens) || 0,
  };
  db().prepare("UPDATE paper_review_runs SET stage = ?, progress = ?, status = ?, error = ?, cost_tokens = ? WHERE id = ?")
    .run(next.stage, next.progress, next.status, next.error, next.cost_tokens, String(id));
  return getRunRow(id);
}

function finishRun(id, { status = "complete", result, error = "", durationMs = 0, costTokens = 0 } = {}) {
  const summary = result?.review || {};
  const finishedAt = new Date().toISOString();
  db().prepare(`
    UPDATE paper_review_runs SET
      status = ?, stage = ?, progress = ?, finished_at = ?, overall_score = ?, calibrated_score = ?,
      confidence = ?, decision = ?, desk_reject_risk = ?, expected_outcome = ?, cost_tokens = ?,
      duration_ms = ?, error = ?, result_json = ?
    WHERE id = ?
  `).run(
    status, status === "complete" ? "complete" : status, status === "complete" ? 100 : 100,
    finishedAt,
    summary.overallScore !== undefined ? Number(summary.overallScore) : summary.overall !== undefined ? Number(summary.overall) : null,
    summary.calibratedScore === undefined ? null : Number(summary.calibratedScore),
    summary.confidence === undefined ? null : Number(summary.confidence),
    String(summary.decision || ""),
    String(summary.deskRejectRisk || ""),
    String(summary.expectedOutcome || ""),
    Number(costTokens) || 0,
    Number(durationMs) || 0,
    String(error || ""),
    result ? JSON.stringify(result) : "",
    String(id),
  );
  replaceRelations(id, result);
  return getRun(id);
}

function deleteRunRelations(id) {
  db().prepare("DELETE FROM paper_review_findings WHERE run_id = ?").run(String(id));
  db().prepare("DELETE FROM paper_review_scores WHERE run_id = ?").run(String(id));
}

function replaceRelations(id, result) {
  deleteRunRelations(id);
  if (!result) return;
  const now = new Date().toISOString();
  const insertFinding = db().prepare(`
    INSERT INTO paper_review_findings (id, run_id, reviewer_label, kind, text, evidence_page, evidence_quote, severity, dimension_id, confidence, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertScore = db().prepare(`
    INSERT INTO paper_review_scores (run_id, dimension_id, dimension_label, score, rationale)
    VALUES (?, ?, ?, ?, ?)
  `);
  const findings = [
    ...(result.review?.strengths || []).map((entry) => ({ ...entry, kind: "strength" })),
    ...(result.review?.weaknesses || []).map((entry) => ({ ...entry, kind: "weakness" })),
    ...(result.review?.questions || []).map((entry) => ({ ...entry, kind: "question" })),
    ...(result.review?.limitations || []).map((entry) => ({ ...entry, kind: "limitation" })),
  ];
  db().exec("BEGIN");
  try {
    for (const finding of findings) {
      const text = typeof finding === "string" ? finding : String(finding.text || "");
      if (!text.trim()) continue;
      insertFinding.run(
        randomUUID(), String(id), "Synthesized", finding.kind, text,
        Number.isInteger(finding.page) ? finding.page : null,
        String(finding.quote || ""),
        String(finding.severity || ""),
        String(finding.dimension || ""),
        finding.confidence === undefined ? null : Number(finding.confidence),
        now,
      );
    }
    for (const dimension of result.review?.subdimensions || []) {
      if (!dimension?.id) continue;
      insertScore.run(String(id), String(dimension.id), String(dimension.label || dimension.id), Number(dimension.score), String(dimension.reason || ""));
    }
    db().exec("COMMIT");
  } catch (error) {
    db().exec("ROLLBACK");
    throw error;
  }
}

function attachDocument(id, { documentId, sourceKind, sourceRef, paperTitle }) {
  db().prepare(`
    UPDATE paper_review_runs
    SET document_id = ?, source_kind = ?, source_ref = ?, paper_title = ?
    WHERE id = ?
  `).run(String(documentId || ""), String(sourceKind || ""), String(sourceRef || ""), String(paperTitle || ""), String(id));
  return getRunRow(id);
}

function getRunRow(id) {
  return db().prepare("SELECT * FROM paper_review_runs WHERE id = ?").get(String(id)) || null;
}

function hydrateRun(row, { includeResult = true } = {}) {
  if (!row) return null;
  const base = {
    id: row.id,
    documentId: row.document_id,
    projectId: row.project_id,
    sourceKind: row.source_kind,
    sourceRef: row.source_ref,
    paperTitle: row.paper_title,
    venueId: row.venue_id,
    venueVersion: row.venue_version,
    model: { provider: row.model_provider, baseUrl: row.model_base_url, model: row.model_id },
    status: row.status,
    stage: row.stage,
    progress: Number(row.progress) || 0,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
    overallScore: row.overall_score === null ? null : Number(row.overall_score),
    calibratedScore: row.calibrated_score === null ? null : Number(row.calibrated_score),
    confidence: row.confidence === null ? null : Number(row.confidence),
    decision: row.decision,
    deskRejectRisk: row.desk_reject_risk,
    expectedOutcome: row.expected_outcome,
    costTokens: Number(row.cost_tokens) || 0,
    durationMs: Number(row.duration_ms) || 0,
    error: row.error,
  };
  if (includeResult) base.result = parseJson(row.result_json, null);
  return base;
}

function getRun(id) {
  return hydrateRun(getRunRow(id));
}

function listRuns({ projectId = "", limit = 50 } = {}) {
  const rows = projectId
    ? db().prepare("SELECT * FROM paper_review_runs WHERE project_id = ? ORDER BY created_at DESC LIMIT ?").all(String(projectId), Math.min(Math.max(Number(limit) || 50, 1), 200))
    : db().prepare("SELECT * FROM paper_review_runs ORDER BY created_at DESC LIMIT ?").all(Math.min(Math.max(Number(limit) || 50, 1), 200));
  return rows.map((row) => hydrateRun(row, { includeResult: false }));
}

function deleteRun(id) {
  deleteRunRelations(id);
  const result = db().prepare("DELETE FROM paper_review_runs WHERE id = ?").run(String(id));
  return { deleted: result.changes > 0 };
}

function markInterrupted() {
  const now = new Date().toISOString();
  const result = db().prepare(`
    UPDATE paper_review_runs
    SET status = 'error', stage = 'interrupted', error = 'The run was interrupted when Archimedes closed.', finished_at = ?
    WHERE status = 'running'
  `).run(now);
  return { updated: result.changes };
}

function scorePool(venueId, excludeId = "") {
  return db().prepare(`
    SELECT overall_score AS overallScore, calibrated_score AS calibratedScore
    FROM paper_review_runs
    WHERE venue_id = ? AND status = 'complete' AND overall_score IS NOT NULL AND id <> ?
    ORDER BY created_at DESC LIMIT 500
  `).all(String(venueId), String(excludeId)).map((row) => ({
    overallScore: Number(row.overallScore),
    calibratedScore: row.calibratedScore === null ? null : Number(row.calibratedScore),
  }));
}

function close() {
  if (database) {
    database.close();
    database = null;
  }
}

module.exports = {
  initialize,
  saveDocument,
  getDocument,
  createRun,
  attachDocument,
  updateRun,
  finishRun,
  getRun,
  listRuns,
  deleteRun,
  markInterrupted,
  scorePool,
  close,
  // exposed for tests
  _getRunRow: getRunRow,
};
