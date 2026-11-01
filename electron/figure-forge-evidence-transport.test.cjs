const test = require("node:test");
const assert = require("node:assert/strict");
const { requestReconstructionEvidence } = require("./figure-forge.cjs");
const image = "data:image/png;base64,YWJj";

test("evidence transport sends original and render as images with the role-specific prompt", async () => {
  let captured;
  const result = await requestReconstructionEvidence({ images: [image, image], width: 100, height: 80, task: { defectDiagnosis: true, catalog: { nodes: [] } } }, {
    config: { apiKey: "test-key", model: "vision" },
    complete: async (_config, messages, options) => { captured = { messages, options }; return { content: '{"complete":true,"defects":[]}' }; },
  });
  assert.equal(result.complete, true);
  assert.match(captured.messages[1].content[0].text, /editable rendering/);
  assert.equal(captured.messages[1].content.filter((part) => part.type === "image_url").length, 2);
  assert.equal(captured.options.allowTools, false);
  await assert.rejects(requestReconstructionEvidence({ images: [image], width: 100, height: 80, task: { catalog: { href: image } } }, {}), /catalog/);
});

test("authentication failures are recognizable by the reconstruction queue without exposing credentials", async () => {
  await assert.rejects(requestReconstructionEvidence({ images: [image], width: 100, height: 80, task: { sourceInventory: true } }, {
    config: { apiKey: "private-key", model: "vision" },
    complete: async () => { throw new Error("Model request failed (401): private-key"); },
  }), (error) => /HTTP 401/.test(error.message) && !error.message.includes("private-key"));
});
