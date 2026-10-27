const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const store = require("./store.cjs");

test("retains official conference provenance and presentation when saving and reopening a library", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-conference-save-"));
  const other = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-conference-close-"));
  try {
    store.openWorkspace(workspace);
    const library = store.createLibrary({ name: "Conference papers" });
    const conference = { id: "iclr", year: 2026, presentation: "oral", decision: "Accept (Oral)", track: "Main conference", source_url: "https://iclr.cc/static/virtual/data/iclr-2026-orals-posters.json", presentation_source_url: "https://iclr.cc/virtual/2026/oral/1", retrieved_at: "2026-10-10T00:00:00Z" };
    const paper = { title: "A persisted conference record", authors: [], year: 2026, venue: "ICLR 2026", conference, source: "official-conference" };
    store.addPaper(library.id, paper);
    store.addPaper(library.id, paper);
    assert.equal(store.listLibraries().find((item) => item.id === library.id).paper_count, 1);
    store.openWorkspace(other);
    store.openWorkspace(workspace);
    assert.deepEqual(store.listPapers(library.id)[0].conference, conference);
  } finally {
    store.openWorkspace(other);
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("finds phrases across PDF whitespace, soft hyphens, and a line-ending hyphen", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-reader-find-"));
  try {
    store.openWorkspace(workspace);
    const library = store.createLibrary({ name: "Reading" });
    const paper = store.addPaper(library.id, { title: "Indexed PDF", authors: [], source: "test" });
    store.replacePaperReaderAsset(paper.id, {
      relative_path: "paper.pdf", sha256: "test", size_bytes: 1, page_count: 2,
      pages: [
        { page_number: 1, text: "The AI\u00a0Scientist proposes MLE-\nSTAR." },
        { page_number: 2, text: "Nothing relevant here." },
      ], truncated: false, warning: "",
    });
    const ai = store.findPaperPassages(paper.id, "AI Scientist");
    const mle = store.findPaperPassages(paper.id, "MLE-STAR");
    assert.equal(ai.length, 1);
    assert.equal(mle.length, 1);
    assert.equal(ai[0].page_number, 1);
    assert.equal(mle[0].excerpt.includes("MLE- STAR"), true);
  } finally {
    store.openWorkspace(fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-reader-find-close-")));
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("shows only successfully opened PDF pages and web pages as reply sources", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-sources-"));
  try {
    store.openWorkspace(workspace);
    const thread = store.createResearchThread({ prompt: "Read this paper", mode: "deep-research" });
    const turn = store.startResearchTurn({ threadId: thread.id, taskId: null, prompt: "Read this paper", mode: "deep-research" });
    store.appendResearchEvent({ threadId: thread.id, turnId: turn.id, type: "tool_result", payload: {
      name: "search_academic_papers", content: JSON.stringify({ papers: [{ title: "Result", url: "https://arxiv.org/abs/2609.14857" }] }),
    } });
    store.appendResearchEvent({ threadId: thread.id, turnId: turn.id, type: "tool_result", payload: {
      name: "read_found_paper_pdf", content: JSON.stringify({ title: "ModularRSI", source_url: "https://arxiv.org/pdf/2609.14857", start_page: 10, end_page: 11, pages: [{ page: 10, text: "Evidence" }] }),
    } });
    store.appendResearchEvent({ threadId: thread.id, turnId: turn.id, type: "tool_result", payload: {
      name: "open_web_page", content: JSON.stringify({ title: "Article", url: "https://example.org/article", text: "Report" }),
    } });
    store.finishResearchTurn(turn.id, { response: "Here is the answer." });
    const reply = store.getResearchThread(thread.id).messages.at(-1);
    assert.deepEqual(reply.sources, [
      { url: "https://arxiv.org/pdf/2609.14857", title: "ModularRSI", startPage: 10, endPage: 11 },
      { url: "https://example.org/article", title: "Article", startPage: null, endPage: null },
    ]);
  } finally {
    store.openWorkspace(fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-sources-close-")));
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("persists excerpts and page numbers while keeping search hits as leads", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-evidence-"));
  try {
    store.openWorkspace(workspace);
    const thread = store.createResearchThread({ prompt: "Find the benchmarks", mode: "deep-research" });
    const turn = store.startResearchTurn({ threadId: thread.id, taskId: null, prompt: "Find the benchmarks", mode: "deep-research" });
    const base = { url: "https://arxiv.org/pdf/2609.14857", title: "Paper", retrieved_at: "2026-10-05T00:00:00Z" };
    store.appendResearchEvent({ threadId: thread.id, turnId: turn.id, type: "source_evidence", payload: { ...base, kind: "discovery", excerpt: "abstract" } });
    store.appendResearchEvent({ threadId: thread.id, turnId: turn.id, type: "source_evidence", payload: { ...base, kind: "read", excerpt: "Method text", page: 3 } });
    store.appendResearchEvent({ threadId: thread.id, turnId: turn.id, type: "source_evidence", payload: { ...base, kind: "read", excerpt: "Experiment text", page: 4 } });
    store.finishResearchTurn(turn.id, { response: "Methods are on page 3." });
    assert.deepEqual(store.getResearchThread(thread.id).messages.at(-1).sources, [{
      url: base.url, title: "Paper", startPage: 3, endPage: 4,
      excerpt: "Method text", query: "", retrievedAt: base.retrieved_at,
    }]);
  } finally {
    store.openWorkspace(fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-evidence-close-")));
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("restores the research thread linked to a paper", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-paper-chat-"));
  try {
    store.openWorkspace(workspace);
    const library = store.createLibrary({ name: "Reading" });
    const paper = store.addPaper(library.id, { title: "Persistent Paper Chat", authors: [], source: "manual" });
    const thread = store.createResearchThread({ prompt: "Build a paper guide", mode: "deep-research" });
    const turn = store.startResearchTurn({ threadId: thread.id, taskId: null, prompt: "Build a paper guide", mode: "deep-research" });
    store.finishResearchTurn(turn.id, { response: "## 三行摘要\n1. A durable guide." });
    store.setPaperChatThread(paper.id, thread.id);
    const restored = store.getPaperChatThread(paper.id);
    assert.equal(restored.id, thread.id);
    assert.equal(restored.messages.at(-1).text, "## 三行摘要\n1. A durable guide.");
    assert.equal(store.listResearchThreads().some((candidate) => candidate.id === thread.id), false);
    assert.equal(store.listResearchProjects().find((project) => project.id === thread.project_id).chat_count, 0);
  } finally {
    store.openWorkspace(fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-paper-chat-close-")));
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("persists a completed paper review when reopening the workspace", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-paper-review-"));
  const other = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-paper-review-close-"));
  try {
    store.openWorkspace(workspace);
    const library = store.createLibrary({ name: "Review shelf" });
    const paper = store.addPaper(library.id, { title: "Saved review", authors: [], source: "manual" });
    store.savePaperReview(paper.id, {
      specialists: [{ id: "method", title: "Method", status: "complete", response: "Page 2 explains the method.", error: "", repaired: true }],
      supervisor: { reason: "The evidence is ready for synthesis." },
      summary: { response: "## Memorandum\n\nThe method is saved." },
    });
    store.openWorkspace(other);
    store.openWorkspace(workspace);
    const restored = store.getPaperReview(paper.id);
    assert.equal(restored.summary, "## Memorandum\n\nThe method is saved.");
    assert.equal(restored.audit, "The evidence is ready for synthesis.");
    assert.deepEqual(restored.specialists, [{ id: "method", title: "Method", status: "complete", response: "Page 2 explains the method.", error: "", repaired: true }]);
  } finally {
    store.openWorkspace(other);
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(other, { recursive: true, force: true });
  }
});

test("keeps reviews written by the original review_json schema", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-paper-review-legacy-"));
  try {
    store.openWorkspace(workspace);
    const library = store.createLibrary({ name: "Legacy review shelf" });
    const paper = store.addPaper(library.id, { title: "Legacy review", authors: [], source: "manual" });
    store.savePaperReview(paper.id, {
      specialists: [{ id: "related", title: "Related work", status: "complete", response: "Saved in JSON.", error: "", repaired: false }],
      supervisor: { reason: "The original schema remains readable." },
      summary: { response: "## Existing memorandum" },
    });
    const restored = store.getPaperReview(paper.id);
    assert.equal(restored.summary, "## Existing memorandum");
    assert.equal(restored.audit, "The original schema remains readable.");
    assert.equal(restored.specialists[0].response, "Saved in JSON.");
  } finally {
    store.openWorkspace(fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-paper-review-legacy-close-")));
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("persists presentations separately from their source review", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-paper-presentation-"));
  const other = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-paper-presentation-close-"));
  try {
    store.openWorkspace(workspace);
    const library = store.createLibrary({ name: "Presentation shelf" });
    const paper = store.addPaper(library.id, { title: "Saved presentation", authors: [], source: "manual" });
    const review = store.savePaperReview(paper.id, {
      specialists: [{ id: "method", title: "Method", status: "complete", response: "PDF p. 2 explains the mechanism.", error: "", repaired: false }],
      supervisor: { reason: "Evidence checked." },
      summary: { response: "## Memorandum\nThe source review stays independent." },
    });
    const sections = ["background", "background", "related_work", "related_work", "method", "method", "method", "experiments", "experiments", "experiments", "limitations"];
    store.savePaperPresentation(paper.id, {
      skill: { id: "paper-presentation", name: "Paper presentation", description: "Downstream deck", version: 3 },
      title: paper.title,
      subtitle: "A compact deck",
      source_sufficiency: "full-paper",
      artifact: {
        kind: "pptd",
        pptd_path: ".archimedes/presentations/a1b2c3d4/123e4567-e89b-12d3-a456-426614174000/presentation.pptd",
        pptx_path: ".archimedes/presentations/a1b2c3d4/123e4567-e89b-12d3-a456-426614174000/presentation.pptx",
        pdf_path: ".archimedes/presentations/a1b2c3d4/123e4567-e89b-12d3-a456-426614174000/presentation.pdf",
        page_count: sections.length + 1,
        validation: "passed",
      },
      slides: sections.map((section, index) => ({
        id: `${section}-${index}`,
        section,
        layout: section === "method" ? "process" : "split",
        title: section,
        summary: `${section} summary`,
        lead: `${section} lead`,
        bullets: [`${section} point one`, `${section} point two`],
        takeaway: `${section} takeaway`,
        speaker_notes: `${section} notes`,
        source: { page: index + 1, label: `PDF p. ${index + 1}`, kind: "figure", figure: `Fig. ${index + 1}`, panel: "a", focus: "top", crop: { x: .1, y: .2, width: .8, height: .5 } },
        visual: { kind: section === "method" ? "process" : "source", items: [{ label: "Result", value: "42", detail: "Verified" }] },
        page: index + 1,
      })),
    }, review.updated_at);
    store.openWorkspace(other);
    store.openWorkspace(workspace);
    const restoredReview = store.getPaperReview(paper.id);
    const restoredPresentation = store.getPaperPresentation(paper.id);
    assert.equal(restoredReview.summary, "## Memorandum\nThe source review stays independent.");
    assert.equal(restoredPresentation.title, paper.title);
    assert.equal(restoredPresentation.source_review_updated_at, review.updated_at);
    assert.equal(restoredPresentation.skill.version, 3);
    assert.equal(restoredPresentation.source_sufficiency, "full-paper");
    assert.equal(restoredPresentation.artifact.kind, "pptd");
    assert.equal(restoredPresentation.artifact.page_count, 12);
    assert.match(restoredPresentation.artifact.pptx_path, /presentation\.pptx$/);
    assert.equal(restoredPresentation.slides.length, 11);
    assert.deepEqual(restoredPresentation.slides.map((slide) => slide.section), sections);
    assert.equal(restoredPresentation.slides[4].layout, "process");
    assert.equal(restoredPresentation.slides[4].speaker_notes, "method notes");
    assert.equal(restoredPresentation.slides[4].visual.items[0].value, "42");
    assert.deepEqual(restoredPresentation.slides[4].source.crop, { x: .1, y: .2, width: .8, height: .5 });
  } finally {
    store.openWorkspace(other);
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(other, { recursive: true, force: true });
  }
});

test("permanently deletes an archived research chat and its turns", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-thread-delete-"));
  try {
    store.openWorkspace(workspace);
    const thread = store.createResearchThread({ prompt: "Discard this archived chat", mode: "free-chat" });
    const turn = store.startResearchTurn({ threadId: thread.id, taskId: null, prompt: "Discard this archived chat", mode: "free-chat" });
    store.finishResearchTurn(turn.id, { response: "Temporary research." });
    store.archiveResearchThread(thread.id);
    assert.equal(store.listResearchThreads({ archived: true }).some((candidate) => candidate.id === thread.id), true);

    assert.deepEqual(store.deleteResearchThread(thread.id), { deleted: true });
    assert.equal(store.listResearchThreads({ archived: true }).some((candidate) => candidate.id === thread.id), false);
    assert.throws(() => store.getResearchThread(thread.id), /Research thread not found/);
  } finally {
    store.openWorkspace(fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-thread-delete-close-")));
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});
