const test = require("node:test");
const assert = require("node:assert/strict");

test("evidence requests use distinct upstream prompts and do not embed image data in catalogs", async () => {
  const { reconstructionPrompt, serializeVisionCatalog } = await import("../src/figureforge/reconstruction-request.mjs");
  const inventory = { items: [], layers: [], connections: [], uncertainties: [] };
  assert.match(reconstructionPrompt(600, 300, { sourceInventory: true }), /Inspect ONLY the original/);
  assert.match(reconstructionPrompt(600, 300, { nativeLayout: true, sourceChecklist: inventory, nativeRegions: [] }), /NATIVE LAYOUT/);
  assert.match(reconstructionPrompt(100, 100, { regionalRecognition: true, sourceChecklist: inventory }), /crop pixels/);
  assert.match(reconstructionPrompt(100, 100, { regionPatch: true }), /operations/);
  assert.match(reconstructionPrompt(100, 100, { defectDiagnosis: true, catalog: {} }), /original.*editable rendering/i);
  assert.doesNotMatch(serializeVisionCatalog({ nodes: [{ href: "data:image/png;base64,SECRET" }] }), /SECRET/);
});
