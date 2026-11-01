const test = require("node:test");
const assert = require("node:assert/strict");
const { prepareFigurePlan, analyzeReferences, generateSvg, generateBitmap, reconstructFigure, resolveFigureConfig } = require("./figure-forge.cjs");

const paperText = "[Page 1] A research method and evidence. ".repeat(8);
const config = { apiKey: "test", model: "test-model", provider: "test" };

test("session provider configuration is explicit and rejects insecure destinations", () => {
  assert.equal(resolveFigureConfig(null, config), config);
  const chosen = resolveFigureConfig({ provider: "ark", apiKey: "private", model: "vision" }, config);
  assert.equal(chosen.baseUrl, "https://ark.cn-beijing.volces.com/api/v3");
  assert.throws(() => resolveFigureConfig({ provider: "custom", baseUrl: "http://example.com/v1", apiKey: "private", model: "vision" }, config), /HTTPS/);
  assert.throws(() => resolveFigureConfig({ provider: "custom", baseUrl: "https://user:pass@example.com", apiKey: "private", model: "vision" }, config), /credentials/);
});

test("paper planning calls the configured model without tools and returns its draft", async () => {
  let request;
  const result = await prepareFigurePlan({ paperText, figureType: "pipeline", requirements: "left to right", language: "zh" }, {
    config,
    complete: async (_config, messages, options) => { request = { messages, options }; return { content: "  Draft plan  " }; },
  });
  assert.equal(result.plan, "Draft plan");
  assert.equal(request.options.allowTools, false);
  assert.match(request.messages[1].content, /Language: Chinese/);
  assert.match(request.messages[1].content, /Figure type: pipeline/);
  assert.match(request.messages[1].content, /\[Page 1\]/);
});

test("paper planning rejects missing credentials, short text and empty model output", async () => {
  await assert.rejects(prepareFigurePlan({ paperText: "short" }, { config, complete: async () => ({}) }), /100/);
  await assert.rejects(prepareFigurePlan({ paperText }, { config: {}, complete: async () => ({}) }), /Configure/);
  await assert.rejects(prepareFigurePlan({ paperText }, { config, complete: async () => ({ content: "" }) }), /empty/);
});

test("paper planning limits input before sending to the model", async () => {
  let called = false;
  await assert.rejects(prepareFigurePlan({ paperText: "x".repeat(60_001) }, { config, complete: async () => { called = true; } }), /60,000/);
  assert.equal(called, false);
});

test("PDF analysis falls back to text only for explicit unsupported-document errors", async () => {
  const pdfData = `data:application/pdf;base64,${Buffer.from("%PDF-1.7 fixture").toString("base64")}`;
  let fallbackCalls = 0;
  const deps = { config: { ...config, baseUrl: "https://example.test/v1" }, complete: async () => { fallbackCalls++; return { content: "text plan" }; }, fetchImpl: async () => ({ ok: false, status: 400, text: async () => "PDF file input not supported" }) };
  const result = await prepareFigurePlan({ pdfData, paperText }, deps);
  assert.equal(result.source, "text"); assert.equal(fallbackCalls, 1);
  await assert.rejects(prepareFigurePlan({ pdfData, paperText }, { ...deps, fetchImpl: async () => ({ ok: false, status: 401, text: async () => "unauthorized" }) }), /401/);
  assert.equal(fallbackCalls, 1);
});

test("reference analysis sends image data to the selected model without tools", async () => {
  let messages;
  const refs = Array(4).fill("data:image/png;base64,YWJj");
  const result = await analyzeReferences({ references: refs, plan: "A paper plan", model: "vision" }, {
    config,
    complete: async (cfg, value, options) => { assert.equal(cfg.model, "vision"); assert.equal(options.allowTools, false); messages = value; return { content: "Use a three-panel layout" }; },
  });
  assert.match(result.guide, /three-panel/);
  assert.equal(messages[1].content.filter((part) => part.type === "image_url").length, 4);
  await assert.rejects(analyzeReferences({ references: refs.slice(0, 3), plan: "plan" }, { config, complete: async () => ({}) }), /4–10/);
});

test("SVG generation requires inputs and does not silently accept empty output", async () => {
  const references = Array(4).fill("data:image/png;base64,YWJj");
  await assert.rejects(generateSvg({ references, plan: "plan", method: "two-stage" }, { config, complete: async () => ({}) }), /Analyze the reference/);
  const result = await generateSvg({ references, plan: "plan", guide: "guide", method: "two-stage" }, { config, complete: async () => ({ content: "```svg\n<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>\n```" }) });
  assert.match(result.svg, /^<svg/);
});

test("bitmap generation routes GPT Image references through multipart edits", async () => {
  let request;
  const references = Array(2).fill("data:image/png;base64,YWJj");
  const result = await generateBitmap({ references, plan: "a paper", method: "direct", model: "gpt-image-1" }, {
    config: { ...config, provider: "openai", baseUrl: "https://api.openai.com/v1" },
    fetchImpl: async (url, options) => { request = { url, options }; return { ok: true, text: async () => JSON.stringify({ data: [{ b64_json: "YWJj" }] }) }; },
  });
  assert.match(request.url, /\/images\/edits$/);
  assert.equal(request.options.body.getAll("image[]").length, 2);
  assert.equal(result.image, "data:image/png;base64,YWJj");
});

test("Infistar Gemini images use the native image endpoint and retain reference images", async () => {
  let request;
  const result = await generateBitmap({ references: Array(2).fill("data:image/png;base64,YWJj"), plan: "a paper", method: "direct", model: "gemini-3-pro-image", aspect: "16:9", resolution: "2K" }, {
    config: { ...config, provider: "custom", baseUrl: "https://infistar.cc/v1" },
    fetchImpl: async (url, options) => { request = { url, body: JSON.parse(options.body) }; return { ok: true, text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "YWJj" } }] } }] }) }; },
  });
  assert.match(request.url, /\/v1beta\/models\/gemini-3-pro-image:generateContent$/);
  assert.equal(request.body.contents[0].parts.filter((part) => part.inlineData).length, 2);
  assert.equal(request.body.generationConfig.imageConfig.aspectRatio, "16:9");
  assert.equal(result.image, "data:image/png;base64,YWJj");
});

test("reconstruction requires valid dimensions and multiple scene objects", async () => {
  const image = "data:image/png;base64,YWJj";
  const deps = { config, complete: async () => ({ content: '{"nodes":[{"type":"rect"},{"type":"text"}]}' }) };
  await assert.rejects(reconstructFigure({ image, width: 0, height: 200 }, deps), /dimensions/);
  const result = await reconstructFigure({ image, width: 100, height: 200 }, deps);
  assert.equal(result.nodes.length, 2);
  await assert.rejects(reconstructFigure({ image, width: 100, height: 200 }, { ...deps, complete: async () => ({ content: '{"nodes":[{}]}' }) }), /usable/);
});
