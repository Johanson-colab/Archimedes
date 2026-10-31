const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const store = require("./store.cjs");
const { createAnnotationSync } = require("./annotation-sync.cjs");

function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-annotation-sync-"));
  store.setLocalIdentity({ userId: "usr_local_owner", displayName: "Local Owner", deviceId: "dev", deviceName: "Test" });
  store.openWorkspace(root);
  const project = store.createResearchProject({ name: "Annotation project" });
  store.linkResearchProjectToCloud(project.id, "cloud-project");
  const library = store.createLibrary({ projectId: project.id, name: "Sources" });
  store.linkLibraryToCloud(library.id, "cloud-library");
  const paper = store.addPaper(library.id, { canonical_key: "doi:10.1/annotations", title: "Annotated paper", authors: ["A"] });
  store.linkPaperToCloud(paper.id, "cloud-paper");
  store.replacePaperReaderAsset(paper.id, { relative_path: "paper.pdf", sha256: "hash", size_bytes: 10, page_count: 1, pages: [{ page_number: 1, text: "Page one" }] });
  return { root, project, library, paper };
}

function fakeApi() {
  const highlights = [];
  const saved = [];
  return {
    highlights,
    saved,
    async listHighlights() { return highlights.map((highlight) => ({ ...highlight })); },
    async addHighlight(_projectId, highlight) {
      const row = { ...highlight, author_id: "cloud-user", created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      highlights.push(row);
      return row;
    },
    async getReview() {
      return {
        id: "remote-review",
        paper_id: "cloud-paper",
        owner_id: "other-user",
        visibility: "project",
        review_json: { specialists: [{ id: "related", status: "complete", response: "Shared" }], summary: { response: "Shared summary" } },
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-02T00:00:00.000Z",
      };
    },
    async saveReview(_projectId, _paperId, review, visibility) { saved.push({ kind: "review", review, visibility }); return { id: "saved-review" }; },
    async getPresentation() {
      return {
        id: "remote-presentation",
        paper_id: "cloud-paper",
        owner_id: "other-user",
        visibility: "project",
        presentation_json: {
          title: "Shared deck",
          slides: ["background", "related_work", "method", "experiments", "limitations"].map((section) => ({ section, title: section })),
        },
        source_review_updated_at: "2026-01-01T00:00:00.000Z",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-02T00:00:00.000Z",
      };
    },
    async savePresentation() { return { id: "saved-presentation" }; },
  };
}

test("annotation sync pushes local highlights and pulls shared reviews and presentations", async () => {
  const { root, project, paper } = workspace();
  try {
    const localHighlight = store.createPaperHighlight(paper.id, { page_number: 1, quote: "Local quote", note: "Mine", visibility: "project" }, project.id);
    const api = fakeApi();
    api.highlights.push({
      id: "remote-highlight", paper_id: "cloud-paper", author_id: "other-user", visibility: "project",
      page_number: 1, quote: "Remote quote", note: "Theirs", color: "blue",
      created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-02T00:00:00.000Z",
    });

    const sync = createAnnotationSync({ store, api });
    const result = await sync.syncProjectAnnotations(project.id, { currentCloudUserId: "cloud-user" });
    assert.deepEqual(result.warnings, []);
    const highlights = store.listPaperHighlights(project.id, paper.id);
    assert.ok(highlights.some((highlight) => highlight.id === localHighlight.id));
    assert.ok(highlights.some((highlight) => highlight.id === "remote-highlight" && highlight.source === "cloud" && highlight.author_id === "other-user"));
    assert.ok(api.highlights.some((highlight) => highlight.id === localHighlight.id));

    const review = store.getPaperReview(paper.id, project.id);
    assert.equal(review.summary, "Shared summary");
    const presentation = store.getPaperPresentation(paper.id, project.id);
    assert.equal(presentation.title, "Shared deck");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("annotation sync requires a shared project", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-annotation-guard-"));
  try {
    store.setLocalIdentity({ userId: "usr_local_owner", displayName: "Local Owner", deviceId: "dev", deviceName: "Test" });
    store.openWorkspace(root);
    const project = store.createResearchProject({ name: "Private" });
    const sync = createAnnotationSync({ store, api: fakeApi() });
    await assert.rejects(() => sync.syncProjectAnnotations(project.id), /Share this project/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
