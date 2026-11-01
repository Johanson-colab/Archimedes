const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { complete } = require("./agent.cjs");
const { prepareFigurePlan, analyzeReferences, generateSvg, generateBitmap, reconstructFigure } = require("./figure-forge.cjs");

test("paper to references, SVG and editable scene uses the real model transport against a local stub", async (t) => {
  const seen = [];
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const bytes = Buffer.concat(chunks); seen.push({ path: req.url, type: req.headers["content-type"], bytes });
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/v1/images/edits") return res.end(JSON.stringify({ data: [{ b64_json: "YWJj" }] }));
    const request = JSON.parse(bytes.toString("utf8"));
    const system = String(request.messages[0].content);
    let response = "Paper plan: input → method → output, page 1.";
    if (system.includes("design analyst")) response = JSON.stringify({
      layout: "three panels left to right",
      panels: [{ name: "Input", role: "raw data" }, { name: "Method", role: "core", x: 500, y: 0, w: 600, h: 900 }, { name: "Output", role: "results" }],
      palette: { background: "#ffffff", primary: "#2f6f4f", accent: "#d9a227" },
      typography: { title: 44, label: 22 },
      strokes: { box: 3 },
      density: { panels: 3, modulesPerPanel: 5 },
      representative: [1, 2, 3, 4],
      imageRefs: [1, 2, 3],
    });
    if (system.includes("standalone editable SVG")) response = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="100" height="40"/></svg>';
    if (system.includes("reconstruct editable")) response = JSON.stringify({ nodes: Array.from({ length: 6 }, (_, i) => ({ type: "rect", x: i * 10, y: 0, w: 8, h: 10 })) });
    return res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: response } }] }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const config = { apiKey: "fake-key", provider: "custom", model: "fake-vision", baseUrl: `http://127.0.0.1:${server.address().port}/v1` };
  const deps = { config, complete };
  const references = Array(4).fill("data:image/png;base64,YWJj");
  const paper = await prepareFigurePlan({ paperText: "[Page 1] A method with inputs and results. ".repeat(6), figureType: "framework", language: "en" }, deps);
  const analysis = await analyzeReferences({ references, plan: paper.plan }, deps);
  const { renderDesignContract } = await import("../src/figureforge/design-contract.mjs");
  assert.deepEqual(analysis.representative, [1, 2, 3, 4]);
  assert.deepEqual(analysis.imageRefs, [1, 2, 3]);
  assert.equal(analysis.contract.layout, "three panels left to right");
  assert.equal(analysis.contract.palette.primary, "#2f6f4f");
  const guide = renderDesignContract(analysis.contract);
  assert.match(guide, /use these exact hex values/);
  assert.match((await generateSvg({ references, plan: paper.plan, guide, method: "two-stage" }, deps)).svg, /<svg/);
  assert.match((await generateBitmap({ references, plan: paper.plan, guide, method: "two-stage", model: "gpt-image-1" }, { config })).image, /^data:image\/png;base64,/);
  assert.equal((await reconstructFigure({ image: references[0], width: 100, height: 100 }, deps)).nodes.length, 6);
  assert.equal(seen.length, 5);
  assert.match(seen[3].type, /multipart\/form-data/);
});
