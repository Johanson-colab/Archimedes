const assert = require("node:assert/strict");
const test = require("node:test");
const { isPrivateAddress, paperPdfUrl } = require("./agent.cjs");

test("uses a paper PDF URL and derives arXiv PDFs only from public abstract URLs", () => {
  assert.equal(paperPdfUrl({ pdfUrl: "https://example.org/paper.pdf" }), "https://example.org/paper.pdf");
  assert.equal(paperPdfUrl({ url: "https://arxiv.org/abs/2606.01779" }), "https://arxiv.org/pdf/2606.01779");
  assert.throws(() => paperPdfUrl({ url: "https://example.org/abstract" }), /no PDF URL/);
});

test("blocks private targets before downloading an attached paper PDF", () => {
  assert.equal(isPrivateAddress("127.0.0.1"), true);
  assert.equal(isPrivateAddress("10.20.30.40"), true);
  assert.equal(isPrivateAddress("192.168.1.4"), true);
  assert.equal(isPrivateAddress("8.8.8.8"), false);
  assert.equal(isPrivateAddress("::1"), true);
});
