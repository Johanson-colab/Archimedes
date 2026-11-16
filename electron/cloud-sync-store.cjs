const { randomUUID } = require('node:crypto');

// This journal survives physical local deletes. Revisions are server assigned;
// mutation IDs protect later user edits from an older request's acknowledgement.
function initialize(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS cloud_library_changes (
    project_id TEXT NOT NULL,
    cloud_library_id TEXT NOT NULL,
    cloud_paper_id TEXT NOT NULL DEFAULT '',
    canonical_key TEXT NOT NULL DEFAULT '',
    revision INTEGER NOT NULL DEFAULT 0,
    deleted INTEGER NOT NULL DEFAULT 0,
    pending TEXT NOT NULL DEFAULT '',
    mutation_id TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (cloud_library_id, cloud_paper_id)
  ) STRICT`);
}

function listChanges(db, projectId) {
  return db.prepare('SELECT * FROM cloud_library_changes WHERE project_id = ?').all(projectId);
}

function queue(db, { projectId, libraryId, paperId = '', canonicalKey = '', pending }) {
  const id = randomUUID();
  db.prepare(`INSERT INTO cloud_library_changes
    (project_id, cloud_library_id, cloud_paper_id, canonical_key, deleted, pending, mutation_id)
    VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(cloud_library_id, cloud_paper_id) DO UPDATE SET
    canonical_key = excluded.canonical_key, deleted = excluded.deleted,
    pending = excluded.pending, mutation_id = excluded.mutation_id`)
    .run(projectId, libraryId, paperId, canonicalKey, pending === 'delete' ? 1 : 0, pending, id);
}

function queueLibraryDelete(db, id) {
  const row = db.prepare('SELECT project_id, cloud_library_id FROM libraries WHERE id = ?').get(id);
  if (row?.cloud_library_id) queue(db, { projectId: row.project_id, libraryId: row.cloud_library_id, pending: 'delete' });
}

function prepareLibraryUpload(db, id) {
  const row = db.prepare('SELECT * FROM libraries WHERE id = ?').get(id);
  if (!row) throw new Error('Library not found.');
  if (row.cloud_library_id) return row.cloud_library_id;
  db.exec('SAVEPOINT cloud_library_upload');
  try {
    db.prepare('UPDATE libraries SET cloud_library_id = ? WHERE id = ?').run(id, id);
    queue(db, { projectId: row.project_id, libraryId: id, pending: 'create' });
    db.exec('RELEASE cloud_library_upload');
    return id;
  } catch (error) { db.exec('ROLLBACK TO cloud_library_upload'); db.exec('RELEASE cloud_library_upload'); throw error; }
}

function queuePaperRemove(db, libraryId, paperId) {
  const row = db.prepare(`SELECT l.project_id, l.cloud_library_id, p.cloud_paper_id, p.canonical_key
    FROM library_papers lp JOIN libraries l ON l.id = lp.library_id JOIN papers p ON p.id = lp.paper_id
    WHERE lp.library_id = ? AND lp.paper_id = ?`).get(libraryId, paperId);
  if (row?.cloud_library_id) queue(db, { projectId: row.project_id,
    libraryId: row.cloud_library_id, paperId: row.cloud_paper_id || `canonical:${row.canonical_key}`, canonicalKey: row.canonical_key, pending: 'delete' });
}

function markPaperAdded(db, libraryId, paperId) {
  const row = db.prepare(`SELECT l.project_id, l.cloud_library_id, p.canonical_key FROM libraries l, papers p
    WHERE l.id = ? AND p.id = ?`).get(libraryId, paperId);
  if (!row?.cloud_library_id) return;
  const previous = db.prepare(`SELECT * FROM cloud_library_changes
    WHERE cloud_library_id = ? AND canonical_key = ? AND cloud_paper_id <> ''`).get(row.cloud_library_id, row.canonical_key);
  if (previous?.deleted || previous?.pending === 'delete') queue(db, { projectId: row.project_id,
    libraryId: row.cloud_library_id, paperId: previous.cloud_paper_id, canonicalKey: row.canonical_key, pending: 'add' });
}

function isDeleted(db, libraryId, paperId = '') {
  return Boolean(db.prepare('SELECT deleted FROM cloud_library_changes WHERE cloud_library_id = ? AND cloud_paper_id = ?').get(libraryId, paperId)?.deleted);
}

function applySnapshot(db, projectId, snapshot) {
  db.exec('SAVEPOINT cloud_library_snapshot');
  try {
    for (const row of [...(snapshot.libraries || []).map(value => ({ ...value, cloud_library_id: value.id, cloud_paper_id: '' })), ...(snapshot.items || [])]) {
      const libraryId = row.cloud_library_id || row.library_id, paperId = row.cloud_paper_id || row.item_id || '';
      if (!libraryId) continue;
      // A user can remove a first upload before its cloud ID is acknowledged.
      // Resolve that durable canonical-key intent once the snapshot supplies ID.
      if (paperId && row.canonical_key) {
        const alias = db.prepare("SELECT * FROM cloud_library_changes WHERE cloud_library_id = ? AND canonical_key = ? AND cloud_paper_id LIKE 'canonical:%'").get(libraryId, row.canonical_key);
        if (alias) {
          if (alias.project_id !== projectId) throw new Error('Cloud library belongs to a different local project.');
          db.prepare(`INSERT INTO cloud_library_changes
            (project_id, cloud_library_id, cloud_paper_id, canonical_key, revision, deleted, pending, mutation_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(cloud_library_id, cloud_paper_id) DO UPDATE SET
            deleted = excluded.deleted, pending = excluded.pending, mutation_id = excluded.mutation_id`)
            .run(projectId, libraryId, paperId, alias.canonical_key, alias.revision, alias.deleted, alias.pending, alias.mutation_id);
          db.prepare('DELETE FROM cloud_library_changes WHERE cloud_library_id = ? AND cloud_paper_id = ?').run(libraryId, alias.cloud_paper_id);
        }
      }
      const old = db.prepare('SELECT * FROM cloud_library_changes WHERE cloud_library_id = ? AND cloud_paper_id = ?').get(libraryId, paperId);
      if (old && old.project_id !== projectId) throw new Error('Cloud library belongs to a different local project.');
      const revision = Number(row.sync_revision) || 1;
      if (old && revision < old.revision) continue;
      const deleted = Boolean(row.deleted_at);
      if (old && revision === old.revision && !old.pending && Boolean(old.deleted) !== deleted) continue;
      const pending = old?.pending || '';
      db.prepare(`INSERT INTO cloud_library_changes
        (project_id, cloud_library_id, cloud_paper_id, canonical_key, revision, deleted)
        VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(cloud_library_id, cloud_paper_id) DO UPDATE SET
        revision = MAX(revision, excluded.revision),
        canonical_key = CASE WHEN excluded.canonical_key <> '' THEN excluded.canonical_key ELSE canonical_key END,
        deleted = CASE WHEN pending <> '' THEN deleted ELSE excluded.deleted END`)
        .run(projectId, libraryId, paperId, row.canonical_key || '', revision, Number(deleted));
      // A pending explicit re-add remains a user action; an ordinary stale
      // upload does not have that intent and cannot undo the tombstone.
      if (!deleted || (pending && paperId)) continue;
      const local = db.prepare('SELECT id FROM libraries WHERE cloud_library_id = ? AND project_id = ?').get(libraryId, projectId);
      if (!local) continue;
      if (!paperId) {
        db.prepare('DELETE FROM libraries WHERE id = ?').run(local.id);
        db.prepare("UPDATE cloud_library_changes SET pending = '' WHERE cloud_library_id = ? AND cloud_paper_id <> ''").run(libraryId);
      } else {
        db.prepare('DELETE FROM library_papers WHERE library_id = ? AND paper_id IN (SELECT id FROM papers WHERE cloud_paper_id = ?)').run(local.id, paperId);
      }
    }
    db.exec('RELEASE cloud_library_snapshot');
  } catch (error) { db.exec('ROLLBACK TO cloud_library_snapshot'); db.exec('RELEASE cloud_library_snapshot'); throw error; }
}

function ackChange(db, change, result) {
  if (!result || !Number.isInteger(Number(result.sync_revision))) throw new Error('The cloud server did not acknowledge a deletion revision. Apply migration 0013 before retrying.');
  db.prepare(`UPDATE cloud_library_changes SET revision = MAX(revision, ?), deleted = ?, pending = '', mutation_id = ''
    WHERE cloud_library_id = ? AND cloud_paper_id = ? AND mutation_id = ?`)
    .run(Number(result.sync_revision), Number(Boolean(result.deleted_at)), change.cloud_library_id, change.cloud_paper_id, change.mutation_id);
}

module.exports = { initialize, listChanges, prepareLibraryUpload, queueLibraryDelete, queuePaperRemove, markPaperAdded, isDeleted, applySnapshot, ackChange };
