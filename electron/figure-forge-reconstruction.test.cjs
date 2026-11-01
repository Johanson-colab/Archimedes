const test = require("node:test");
const assert = require("node:assert/strict");

test("reconstruction rejects whole-page bitmap and escapes model-provided text", async () => {
  const { normalizeReconstruction, sceneToSvg } = await import("../src/figureforge/reconstruction.mjs");
  const scene = await normalizeReconstruction({ width: 100, height: 100, nodes: [
    { type: "image", x: 0, y: 0, w: 100, h: 100 },
    { type: "rect", x: 1, y: 1, w: 20, h: 20, fill: "#fff" },
    { type: "rect", x: 22, y: 1, w: 20, h: 20, fill: "#fff" },
    { type: "rect", x: 43, y: 1, w: 20, h: 20, fill: "#fff" },
    { type: "rect", x: 1, y: 22, w: 20, h: 20, fill: "#fff" },
    { type: "rect", x: 22, y: 22, w: 20, h: 20, fill: "#fff" },
    { type: "text", x: 2, y: 2, w: 20, h: 10, text: "<script>alert(1)</script>" },
    { type: "path", x: 0, y: 0, d: 'M 0 0" onload="alert(1)' },
  ] }, async () => "data:image/png;base64,YWJj");
  assert.equal(scene.nodes.length, 6);
  const svg = sceneToSvg(scene);
  assert.doesNotMatch(svg, /<script|onload=/);
  assert.match(svg, /&lt;script&gt;/);
});

test("SVG reconstruction preserves multiline text styling and arrowheads", async () => {
  const { sceneToSvg } = await import("../src/figureforge/reconstruction.mjs");
  const svg = sceneToSvg({ canvas: { width: 100, height: 100 }, nodes: [
    { type: "text", x: 1, y: 2, w: 30, h: 30, fontSize: 10, text: "One\nTwo", fontFamily: "A&B", bold: true, italic: true, fill: "#000" },
    { type: "line", x: 0, y: 0, x2: 50, y2: 50, stroke: "#123456", strokeWidth: 2, arrow: true },
  ] });
  assert.match(svg, /font-family="A&amp;B"/);
  assert.match(svg, /font-weight="bold" font-style="italic"/);
  assert.match(svg, /<tspan x="1" dy="1.2em">Two<\/tspan>/);
  assert.match(svg, /<path d="M 50 50 L /);
});
