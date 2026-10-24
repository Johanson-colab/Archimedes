const assert = require("node:assert/strict");
const test = require("node:test");
const api = import("../src/pdf-visual-regions.ts");

test("recognizes caption labels but rejects prose references that begin with Figure", async () => {
  const { pdfCaptionKind } = await api;
  assert.equal(pdfCaptionKind("Figure 5: SWE-bench Lite success rates"), "figure");
  assert.equal(pdfCaptionKind("Table 3. Ablation study"), "table");
  assert.equal(pdfCaptionKind("Figure 5"), "figure");
  assert.equal(pdfCaptionKind("Figure 5 compares three skill-update settings."), null);
  assert.equal(pdfCaptionKind("表 2：主要结果"), "table");
});

test("detects a paragraph-shaped caption fallback as prose", async () => {
  const { isDensePdfProse } = await api;
  const lines = Array.from({ length: 7 }, (_, index) => ({
    left: 40, top: 100 + index * 17, width: 260, height: 12,
    text: "This is a long body-text line that belongs to the paper paragraph.",
  }));
  assert.equal(isDensePdfProse(lines, { left: 30, top: 90, width: 290, height: 150 }), true);
  assert.equal(isDensePdfProse(lines.slice(0, 2), { left: 30, top: 90, width: 290, height: 60 }), false);
});

test("operator-backed figure wins over an overlapping heuristic table", async () => {
  const { mergePdfVisualRegions } = await api;
  const figure = { rect: { left: 300, top: 80, width: 220, height: 150 }, kind: "figure", source: "image", id: "figure" };
  const tableGuess = { rect: { left: 320, top: 100, width: 170, height: 100 }, kind: "table", source: "caption", id: "table" };
  const result = mergePdfVisualRegions([tableGuess, figure]);
  assert.deepEqual(result.map((region) => region.id), ["figure"]);
});
