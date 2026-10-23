const assert = require("node:assert/strict");
const test = require("node:test");
const { JSDOM } = require("jsdom");

const api = import("../src/pdf-search-highlights.ts");

test("highlights a search phrase across PDF text spans and removes it when cleared", async () => {
  const { applyPdfSearchHighlights } = await api;
  const dom = new JSDOM("<div><span>AI&nbsp;</span><span>Scientist</span><span> AI Scientist-v2</span></div>");
  const layer = dom.window.document.querySelector("div");
  applyPdfSearchHighlights(layer, "AI Scientist");
  assert.deepEqual([...layer.querySelectorAll("span")].map((span) => span.classList.contains("arch-pdf-search-match")), [true, true, true]);
  applyPdfSearchHighlights(layer, "");
  assert.equal(layer.querySelectorAll(".arch-pdf-search-match").length, 0);
});

test("normalizes line-end hyphens and leaves saved-highlight classes alone", async () => {
  const { applyPdfSearchHighlights } = await api;
  const dom = new JSDOM("<div><span class='arch-pdf-highlight arch-pdf-highlight-green'>MLE-</span><span>\nSTAR</span></div>");
  const layer = dom.window.document.querySelector("div");
  applyPdfSearchHighlights(layer, "MLE-STAR");
  assert.equal(layer.querySelectorAll(".arch-pdf-search-match").length, 2);
  assert.equal(layer.querySelector("span").classList.contains("arch-pdf-highlight-green"), true);
});
