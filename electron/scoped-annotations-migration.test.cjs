const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");

const store = require("./store.cjs");

test("legacy paper reviews and personal paper state migrate on open", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-scoped-migration-"));
  const other = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-scoped-migration-close-"));
  try {
    store.setLocalIdentity({ userId: "usr_migration", displayName: "Migration", deviceId: "dev", deviceName: "test" });
    const snapshot = store.openWorkspace(root);
    const project = snapshot.projects[0];
    const library = store.createLibrary({ projectId: project.id, name: "Migration shelf" });
    const paper = store.addPaper(library.id, { title: "Migrated paper", authors: [], source: "manual" });
    store.savePaperReview(paper.id, {
      specialists: [{ id: "method", title: "Method", status: "complete", response: "Legacy evidence", error: "", repaired: false }],
      supervisor: { reason: "Legacy audit" },
      summary: { response: "## Legacy review" },
    }, project.id);

    // Simulate a pre-project-scope database: restore the old review primary key,
    // remove the per-user state table, and put personal fields back on papers.
    store.openWorkspace(other);
    const db = new DatabaseSync(path.join(root, ".archimedes", "archimedes.db"));
    db.exec(`
      PRAGMA foreign_keys = OFF;
      CREATE TABLE paper_reviews_old (
        paper_id TEXT PRIMARY KEY NOT NULL,
        review_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      INSERT INTO paper_reviews_old (paper_id, review_json, created_at, updated_at)
        SELECT paper_id, review_json, created_at, updated_at FROM paper_reviews;
      DROP TABLE paper_reviews;
      ALTER TABLE paper_reviews_old RENAME TO paper_reviews;
      DROP TABLE paper_user_state;
      UPDATE papers SET reading_status = 'reading', starred = 1, notes = 'legacy note', tags_json = '["legacy"]' WHERE id = '${paper.id}';
    `);
    db.close();

    store.openWorkspace(root);
    const review = store.getPaperReview(paper.id, project.id);
    assert.equal(review.summary, "## Legacy review");
    assert.equal(review.audit, "Legacy audit");
    const migratedPaper = store.getPaper(paper.id);
    assert.equal(migratedPaper.reading_status, "reading");
    assert.equal(migratedPaper.starred, true);
    assert.equal(migratedPaper.notes, "legacy note");
    assert.deepEqual(migratedPaper.tags, ["legacy"]);
  } finally {
    store.openWorkspace(other);
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(other, { recursive: true, force: true });
  }
});
