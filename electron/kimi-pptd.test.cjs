const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { convertAndRender, fallbackPageSpec, mainYaml, normalizePageSpec, pageYaml, parseObject } = require("./kimi-pptd.cjs");

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
  assert.match(mainYaml("论文", 1, ["pages/slide-07.page"]), /pages\/slide-07\.page/);
});

test("PPTD slide normalization rejects missing evidence and malformed model output", () => {
  assert.throws(() => normalizePageSpec({ elements: [
    { type: "text", x: 10, y: 10, w: 100, h: 40, text: "Title" },
    { type: "shape", x: 10, y: 60, w: 200, h: 2 },
  ] }, { title: "Title", hasEvidence: true }), /omitted the source figure/);
  assert.throws(() => parseObject("No page content"), /did not return a page specification/);
  assert.deepEqual(parseObject('Draft follows. {"elements":[]} Extra explanation with {braces}.'), { elements: [] });
});

test("a verified fallback page keeps a malformed single-page response from failing the deck", () => {
  const input = {
    paper: { title: "Paper title", authors: ["A. Author"], venue: "TestConf", year: 2026 },
    slide: { title: "Method evidence", lead: "A compact statement of the mechanism.", bullets: ["First source-grounded point."], takeaway: "The evidence supports a bounded conclusion." },
    index: 12,
    evidence: { width: 1000, height: 700 },
  };
  const page = fallbackPageSpec(input);
  assert.equal(page.pageType, "content");
  assert.ok(page.elements.some((element) => element.type === "image"));
  assert.ok(page.elements.some((element) => element.type === "text" && element.text.includes("Method evidence")));
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
    const previewDirectory = path.join(directory, "previews");
    fs.mkdirSync(previewDirectory);
    const liveEntry = path.join(directory, "live-01.pptd");
    fs.writeFileSync(liveEntry, mainYaml("研究方法", 1, ["pages/slide-01.page"]));
    const live = await convertAndRender({ python, pyz: process.env.KIMI_PPTD_TEST_PYZ, env }, liveEntry, previewDirectory, "live-01");
    assert.equal(live.pageCount, 1);
    assert.match(live.pdf, /previews[\\/]live-01\.pdf$/);

    // This is the exact geometry used when a model-produced page parses but
    // fails PPTD's overlap/overflow checks.  Keep it converter-verified so a
    // bad single page can be replaced without aborting the entire deck.
    const fallbackPaper = { title: "A concise paper title", authors: ["A. Author"], venue: "TestConf", year: 2026 };
    const fallbackCover = fallbackPageSpec({ paper: fallbackPaper, index: 0 });
    fs.writeFileSync(path.join(directory, "pages", "fallback-cover.page"), pageYaml(fallbackCover));
    const fallbackCoverEntry = path.join(directory, "fallback-cover.pptd");
    fs.writeFileSync(fallbackCoverEntry, mainYaml(fallbackPaper.title, 1, ["pages/fallback-cover.page"]));
    const checkedCover = await convertAndRender({ python, pyz: process.env.KIMI_PPTD_TEST_PYZ, env }, fallbackCoverEntry, directory, "fallback-cover");
    assert.equal(checkedCover.check.error_count, 0);

    const fallbackContent = fallbackPageSpec({
      paper: fallbackPaper,
      slide: {
        title: "A concise, evidence-grounded mechanism",
        lead: "The proposed mechanism retains a fixed state while the interaction history grows.",
        bullets: ["The update rule is bounded by the reported architecture.", "The claimed benefit is scoped to the measured setting."],
        takeaway: "The evidence supports a bounded conclusion rather than a general guarantee.",
      },
      index: 1,
    });
    fs.writeFileSync(path.join(directory, "pages", "fallback-content.page"), pageYaml(fallbackContent));
    const fallbackContentEntry = path.join(directory, "fallback-content.pptd");
    fs.writeFileSync(fallbackContentEntry, mainYaml(fallbackPaper.title, 1, ["pages/fallback-content.page"]));
    const checkedContent = await convertAndRender({ python, pyz: process.env.KIMI_PPTD_TEST_PYZ, env }, fallbackContentEntry, directory, "fallback-content");
    assert.equal(checkedContent.check.error_count, 0);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
