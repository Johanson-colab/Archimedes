const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const store = require("./store.cjs");

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-scoped-annotations-"));
  store.setLocalIdentity({ userId: "usr_annotation_owner", displayName: "Annotation Owner", deviceId: "dev", deviceName: "test" });
  const snapshot = store.openWorkspace(root);
  const projectA = snapshot.projects[0];
  const projectB = store.createResearchProject({ name: "Project B" });
  const libraryA = store.createLibrary({ projectId: projectA.id, name: "A library" });
  const libraryB = store.createLibrary({ projectId: projectB.id, name: "B library" });
  const paper = store.addPaper(libraryA.id, { title: "Shared paper", authors: ["A. Author"], source: "manual" });
  store.addPaper(libraryB.id, { title: "Shared paper", authors: ["A. Author"], source: "manual" });
  store.replacePaperReaderAsset(paper.id, {
    relative_path: "paper.pdf", sha256: "test", size_bytes: 1, page_count: 1,
    pages: [{ page_number: 1, text: "A shared paper about retrieval." }], truncated: false, warning: "",
  });
  return { root, projectA, projectB, libraryA, libraryB, paper };
}

function review(text) {
  return {
    specialists: [{ id: "method", title: "Method", status: "complete", response: text, error: "", repaired: false }],
    supervisor: { reason: `${text} evidence` },
    summary: { response: `## ${text}` },
  };
}

test("reviews and presentations are isolated by project", () => {
  const { root, projectA, projectB, paper } = setup();
  try {
    store.savePaperReview(paper.id, review("Project A"), projectA.id);
    assert.equal(store.getPaperReview(paper.id, projectA.id).summary, "## Project A");
    assert.equal(store.getPaperReview(paper.id, projectB.id), null);

    store.savePaperReview(paper.id, review("Project B"), projectB.id);
    assert.equal(store.getPaperReview(paper.id, projectA.id).summary, "## Project A");
    assert.equal(store.getPaperReview(paper.id, projectB.id).summary, "## Project B");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("highlights are project-scoped and support private visibility", () => {
  const { root, projectA, projectB, paper } = setup();
  try {
    const highlightA = store.createPaperHighlight(paper.id, { page_number: 1, quote: "shared paper", note: "A note", color: "yellow" }, projectA.id);
    assert.equal(highlightA.project_id, projectA.id);
    assert.equal(highlightA.author_id, "usr_annotation_owner");
    assert.equal(store.getPaperReader(paper.id, projectA.id).highlights.length, 1);
    assert.equal(store.getPaperReader(paper.id, projectB.id).highlights.length, 0);

    const privateHighlight = store.createPaperHighlight(paper.id, { page_number: 1, quote: "retrieval", visibility: "private" }, projectB.id);
    assert.equal(privateHighlight.visibility, "private");
    assert.equal(store.getPaperReader(paper.id, projectB.id).highlights.length, 1);
    assert.throws(() => store.deletePaperHighlight(highlightA.id, projectB.id), /different project/i);
    store.deletePaperHighlight(highlightA.id, projectA.id);
    assert.equal(store.getPaperReader(paper.id, projectA.id).highlights.length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("paper reading state is per user, while paper metadata remains shared", () => {
  const { root, projectA, paper } = setup();
  try {
    store.addProjectMember({ projectId: projectA.id, userId: "usr_reader_a", role: "editor", displayName: "Reader A" });
    store.addProjectMember({ projectId: projectA.id, userId: "usr_reader_b", role: "editor", displayName: "Reader B" });
    store.setLocalIdentity({ userId: "usr_reader_a", displayName: "Reader A" });
    store.updatePaper(paper.id, { starred: true, notes: "A private note", tags: ["a"] });
    assert.equal(store.getPaper(paper.id).starred, true);
    assert.equal(store.getPaper(paper.id).notes, "A private note");

    store.setLocalIdentity({ userId: "usr_reader_b", displayName: "Reader B" });
    assert.equal(store.getPaper(paper.id).starred, false);
    assert.equal(store.getPaper(paper.id).notes, "");
    assert.equal(store.getPaper(paper.id).title, "Shared paper");

    store.updatePaper(paper.id, { notes: "B private note", starred: false });
    store.setLocalIdentity({ userId: "usr_reader_a", displayName: "Reader A" });
    assert.equal(store.getPaper(paper.id).notes, "A private note");
    assert.equal(store.getPaper(paper.id).starred, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("paper chat threads are keyed by project and paper", () => {
  const { root, projectA, projectB, paper } = setup();
  try {
    const threadA = store.createResearchThread({ prompt: "paper A chat", mode: "free-chat", projectId: projectA.id });
    const savedA = store.setPaperChatThread(paper.id, threadA.id, projectA.id);
    assert.equal(savedA.id, threadA.id);
    assert.equal(store.getPaperChatThread(paper.id, projectA.id).id, threadA.id);
    assert.equal(store.getPaperChatThread(paper.id, projectB.id), null);

    const threadB = store.createResearchThread({ prompt: "paper B chat", mode: "free-chat", projectId: projectB.id });
    store.setPaperChatThread(paper.id, threadB.id, projectB.id);
    assert.equal(store.getPaperChatThread(paper.id, projectA.id).id, threadA.id);
    assert.equal(store.getPaperChatThread(paper.id, projectB.id).id, threadB.id);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
