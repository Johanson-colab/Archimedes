const assert = require("node:assert/strict");
const test = require("node:test");
const api = import("../src/pdf-highlight-segments.ts");

test("saved highlights stop at the selected character instead of painting the whole span", async () => {
  const { buildPdfHighlightSegments } = await api;
  const spans = ["The rapid evolution of foundation models and later text"];
  const segments = buildPdfHighlightSegments(spans, [{
    quote: "The rapid evolution of foundation models",
    color: "green",
  }]);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].spanIndex, 0);
  assert.equal(segments[0].start, 0);
  assert.equal(segments[0].end, 40);
  assert.ok(segments[0].end < spans[0].length);
});

test("saved highlights map across spans with collapsed whitespace", async () => {
  const { buildPdfHighlightSegments } = await api;
  const spans = ["alpha beta ", "gamma delta"];
  const segments = buildPdfHighlightSegments(spans, [{
    quote: "beta gamma",
    color: "yellow",
  }]);
  assert.deepEqual(segments.map(({ spanIndex, start, end }) => ({ spanIndex, start, end })), [
    { spanIndex: 0, start: 6, end: 10 },
    { spanIndex: 1, start: 0, end: 5 },
  ]);
});

test("saved highlight notes travel with their exact segment", async () => {
  const { buildPdfHighlightSegments } = await api;
  const segments = buildPdfHighlightSegments(["one two three"], [{
    quote: "two",
    color: "blue",
    note: "check this",
  }]);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].note, true);
  assert.equal(segments[0].noteText, "check this");
  assert.equal(segments[0].start, 4);
  assert.equal(segments[0].end, 7);
});
