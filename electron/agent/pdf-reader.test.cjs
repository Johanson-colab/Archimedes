const assert = require("node:assert/strict");
const test = require("node:test");
const { normalizePageRange, pageText } = require("./pdf-reader.cjs");

test("normalizes and bounds PDF page ranges", () => {
  assert.deepEqual(normalizePageRange(undefined, undefined, 40), { start: 1, end: 24, rangeLimited: false });
  assert.deepEqual(normalizePageRange(8, 100, 50), { start: 8, end: 31, rangeLimited: true });
  assert.deepEqual(normalizePageRange(100, 2, 12), { start: 12, end: 12, rangeLimited: false });
});

test("reconstructs readable lines from PDF text items", () => {
  const text = pageText([
    { str: "A scientific", transform: [1, 0, 0, 1, 10, 100] },
    { str: "paper", transform: [1, 0, 0, 1, 80, 100], hasEOL: true },
    { str: "Abstract", transform: [1, 0, 0, 1, 10, 80] },
  ]);
  assert.equal(text, "A scientific paper\n\nAbstract");
});
