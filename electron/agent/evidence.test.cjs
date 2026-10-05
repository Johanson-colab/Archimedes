const assert = require("node:assert/strict");
const test = require("node:test");
const { evidenceForTool } = require("./evidence.cjs");

test("distinguishes discovered papers from PDF pages actually read", () => {
  const discovery = evidenceForTool("search_academic_papers", { query: "agent memory" }, {
    papers: [{ title: "Paper", url: "https://arxiv.org/abs/1234.5678", abstract: "An abstract" }],
  });
  assert.equal(discovery[0].kind, "discovery");
  const read = evidenceForTool("read_public_pdf", { url: "https://arxiv.org/pdf/1234.5678" }, {
    source_url: "https://arxiv.org/pdf/1234.5678", pages: [{ page: 3, text: "The actual method" }],
  });
  assert.equal(read[0].kind, "read");
  assert.equal(read[0].page, 3);
  assert.match(read[0].excerpt, /actual method/);
});

test("records visual page interpretation with its PDF page", () => {
  const entries = evidenceForTool("inspect_pdf_page", { url: "https://example.org/paper.pdf", question: "What does the figure show?" }, {
    kind: "pdf_vision", source_url: "https://example.org/paper.pdf", page: 7,
    text: "The figure compares two methods.",
  });
  assert.equal(entries[0].page, 7);
  assert.equal(entries[0].method, "vision_model");
  assert.equal(entries[0].kind, "read");
});
