const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const store = require("./store.cjs");

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
  } finally {
    store.openWorkspace(fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-paper-chat-close-")));
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});
