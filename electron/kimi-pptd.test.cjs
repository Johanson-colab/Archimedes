const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { convertAndRender, mainYaml, normalizePageSpec, pageYaml, parseObject } = require("./kimi-pptd.cjs");

test("PPTD pages are authored with safe geometry and Kimi's page file contract", () => {
  const page = normalizePageSpec({ elements: [
    { type: "text", x: 80, y: 70, w: 900, h: 90, text: "论文方法", fontSize: 38, bold: true },
    { type: "shape", shape: "straightConnector1", x: 80, y: 166, w: 1100, h: 2, borderWidth: 1 },
    { type: "image", x: 80, y: 210, w: 660, h: 340, fit: "contain", src: "/etc/passwd" },
  ] }, { title: "论文方法", hasEvidence: true });
  const yaml = pageYaml(page, "/safe/evidence.png");
  assert.match(yaml, /pageType: content/);
  assert.match(yaml, /elementType: image/);
  assert.match(yaml, /src: "\/safe\/evidence.png"/);
  assert.doesNotMatch(yaml, /etc\/passwd/);
  assert.match(mainYaml("论文", 2), /pages\/slide-02\.page/);
});

test("PPTD slide normalization rejects missing evidence and malformed model output", () => {
  assert.throws(() => normalizePageSpec({ elements: [
    { type: "text", x: 10, y: 10, w: 100, h: 40, text: "Title" },
    { type: "shape", x: 10, y: 60, w: 200, h: 2 },
  ] }, { title: "Title", hasEvidence: true }), /omitted the source figure/);
  assert.throws(() => parseObject("No page content"), /did not return a page specification/);
});

test("Kimi desktop checker and converter accept generated PPTD files", { skip: !process.env.KIMI_PPTD_TEST_PYZ }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-pptd-test-"));
  try {
    fs.mkdirSync(path.join(directory, "pages"));
    const page = normalizePageSpec({ elements: [
      { type: "text", x: 80, y: 70, w: 950, h: 80, text: "研究方法", fontSize: 38, bold: true },
      { type: "shape", shape: "rect", x: 80, y: 165, w: 1100, h: 2, fill: "#1F6652" },
      { type: "text", x: 80, y: 220, w: 1000, h: 80, text: "证据、机制与实验构成清晰的论证链。", fontSize: 24 },
    ] }, { title: "研究方法", hasEvidence: false });
    const entry = path.join(directory, "presentation.pptd");
    fs.writeFileSync(entry, mainYaml("研究方法", 1));
    fs.writeFileSync(path.join(directory, "pages", "slide-01.page"), pageYaml(page));
    const python = process.env.KIMI_PPTD_TEST_PYTHON || "python3";
    const env = { ...process.env, PYTHONPATH: process.env.KIMI_PPTD_TEST_DEPS || "" };
    const result = await convertAndRender({ python, pyz: process.env.KIMI_PPTD_TEST_PYZ, env }, entry, directory);
    assert.equal(result.check.error_count, 0);
    assert.equal(result.pageCount, 1);
    assert.ok(fs.statSync(result.pptx).size > 1_000);
    assert.ok(fs.statSync(result.pdf).size > 1_000);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
