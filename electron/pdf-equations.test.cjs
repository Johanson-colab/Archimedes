const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const api = import("../src/pdf-equations.ts");
const token = (text, left, baseline, width = 50, size = 10) => ({ text, left, baseline, width, size, top: baseline - size * .85, height: size * 1.05 });
const prose = (y, left = 50, width = 500) => token("The model is updated with the information from the previous step.", left, y, width);
const contains = (r, x, y) => x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height;

test("a single equality with a named function is sufficient (Post-Attention regression)", async () => {
  const { findEquationRects } = await api;
  const result = findEquationRects([prose(60), token("H = Post-Attention(A,H).", 150, 100, 260), prose(140)], 612, 792);
  assert.equal(result.length, 1);
  assert(contains(result[0], 150, 100) && contains(result[0], 410, 100));
});

test("standalone sampling expressions with only one relation are detected", async () => {
  const { findEquationRects } = await api;
  const result = findEquationRects([prose(60), token("y ∼ P(x; θ)", 230, 100, 140), prose(140)], 612, 792);
  assert.equal(result.length, 1);
});

test("inline math in prose cannot chain multiple paragraphs into an equation", async () => {
  const { findEquationRects } = await api;
  const tokens = [prose(60), token("θ ∼ P(x; θ)", 230, 100, 140)];
  for (let y = 130; y < 340; y += 14) tokens.push(
    token("The memory is updated with", 50, y, 180), token("H ∈ R", 240, y, 40),
    token("d×k", 283, y - 5, 25, 7), token("and the model has the parameters.", 315, y, 230));
  tokens.push(token("H = TransformerBlock(H)", 180, 370, 250));
  const result = findEquationRects(tokens, 612, 792);
  assert.equal(result.length, 2);
  for (const r of result) assert(r.height < 40);
  assert(!result.some((r) => contains(r, 300, 200)));
});

test("fraction, root, accents, and scripts remain part of their fixed-baseline equation", async () => {
  const { findEquationRects } = await api;
  const result = findEquationRects([
    prose(60), token("R =", 120, 110, 35), token("QM", 180, 100, 50),
    token("(l)", 220, 95, 10, 7), token("√d", 190, 120, 25),
    token(", Q = L2Norm(HW)", 260, 110, 190), prose(155),
  ], 612, 792);
  assert.equal(result.length, 1);
  for (const [x, y] of [[120, 110], [230, 95], [200, 120], [450, 110]]) assert(contains(result[0], x, y));
  assert(!contains(result[0], 300, 155));
});

test("capital A operands do not become English articles during prose classification", async () => {
  const { findEquationRects } = await api;
  assert.equal(findEquationRects([prose(60), token("A = A + A, A = MemoryAttention(H)", 100, 100, 400)], 612, 792).length, 1);
});

test("column evidence keeps a display equation separate from adjacent-column prose", async () => {
  const { findEquationRects } = await api;
  const tokens = [];
  for (const y of [40, 55, 70]) tokens.push(prose(y, 40, 230), prose(y, 320, 240));
  tokens.push(token("H = Attention(X)", 65, 110, 170), prose(110, 320, 240));
  const result = findEquationRects(tokens, 612, 792);
  assert.equal(result.length, 1);
  assert(result[0].left + result[0].width < 300);
});

test("image contents are excluded without altering the image boundary", async () => {
  const { findEquationRects } = await api;
  const image = { left: 100, top: 80, width: 400, height: 100 };
  const result = findEquationRects([prose(50), token("H = f(x)", 200, 120), token("H = g(x)", 200, 220)], 612, 792, [image]);
  assert.equal(result.length, 1);
  assert(result[0].top > 180);
  assert.deepEqual(image, { left: 100, top: 80, width: 400, height: 100 });
});

test("raw PDF transform adapter and detection scale together", async () => {
  const { equationTokens, findEquationRects } = await api;
  const content = { items: [
    { str: "The model is updated with the previous state.", transform: [10, 0, 0, 10, 50, 732], width: 500, fontName: "f" },
    { str: "H = Post-Attention(A,H)", transform: [10, 0, 0, 10, 150, 692], width: 260, fontName: "f" },
  ], styles: { f: { ascent: .85, descent: -.2 } } };
  let reference;
  for (const scale of [.7, 1, 1.2, 1.71, 3.2]) {
    const v = { transform: [scale, 0, 0, -scale, 0, 792 * scale], scale, width: 612 * scale, height: 792 * scale };
    const r = findEquationRects(equationTokens(content, v), v.width, v.height);
    assert.equal(r.length, 1);
    const normalized = Object.fromEntries(Object.entries(r[0]).map(([k, value]) => [k, value / scale]));
    if (reference) for (const key of Object.keys(normalized)) assert(Math.abs(normalized[key] - reference[key]) < .1);
    reference = normalized;
  }
});

test("empty / rotated pages do not produce equation boxes", async () => {
  const { equationTokens, findEquationRects } = await api;
  assert.deepEqual(findEquationRects([], 612, 792), []);
  assert.deepEqual(equationTokens({ items: [{ str: "y = x", transform: [0, 10, -10, 0, 100, 100], width: 50, fontName: "f" }], styles: {} },
    { transform: [1, 0, 0, -1, 0, 792], scale: 1, width: 612, height: 792 }), []);
});

// Run against the original paper without checking a large third-party PDF into
// the repository: MEMT_PDF=/path/to/memt.pdf node --test electron/pdf-equations.test.cjs
test("MemT pages 6–8: 15 complete displays, no prose blocks, at five zoom levels", { skip: !process.env.MEMT_PDF }, async () => {
  const { equationTokens, findEquationRects } = await api;
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(process.env.MEMT_PDF)) }).promise;
  try {
    for (const [pageNumber, baselines] of [[6, [484, 530, 622, 696]], [7, [143, 226, 296]], [8, [240, 309, 368, 440, 490, 549, 660, 721]]]) {
      const page = await doc.getPage(pageNumber);
      const text = await page.getTextContent();
      for (const scale of [.7, 1, 1.2, 1.71, 3.2]) {
        const viewport = page.getViewport({ scale });
        const exclude = pageNumber === 6 ? [{ left: 70 * scale, top: 77 * scale, width: 472 * scale, height: 237 * scale }] : [];
        const result = findEquationRects(equationTokens(text, viewport), viewport.width, viewport.height, exclude);
        assert.equal(result.length, baselines.length, `page ${pageNumber}, scale ${scale}`);
        for (const [i, r] of result.entries()) {
          assert(contains(r, 306 * scale, baselines[i] * scale), `missing display at ${baselines[i]}`);
          assert(r.height / scale < 45, "must not grow into adjacent prose");
        }
        if (pageNumber === 7) assert(result.every((r) => r.top / scale < 320), "inline math paragraphs must not become display boxes");
        if (pageNumber === 8) assert(result[4].width / scale > 300, "memory update must include both ends");
      }
    }
  } finally { await doc.destroy(); }
});
