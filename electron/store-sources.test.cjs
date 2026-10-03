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
