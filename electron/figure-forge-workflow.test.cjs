const test = require("node:test");
const assert = require("node:assert/strict");
const { createCanvas, Image } = require("@napi-rs/canvas");
const { requestReconstructionEvidence } = require("./figure-forge.cjs");

test("host adapter runs inventory, native recognition and visual verification through the model transport", async () => {
  const saved = { document: global.document, CSS: global.CSS, Image: global.Image };
  global.document = { createElement: () => createCanvas(1, 1) };
  global.CSS = { supports: () => true }; global.Image = Image;
  try {
    const canvas = createCanvas(600, 300), ctx = canvas.getContext("2d");
    ctx.fillStyle = "white"; ctx.fillRect(0, 0, 600, 300);
    ctx.fillStyle = "black"; ctx.fillRect(100, 100, 100, 30);
    const source = canvas.toDataURL("image/png"), phases = [];
    const { reconstructWithTopConf } = await import("../src/figureforge/reconstruction-workflow.mjs");
    const inventory = { canvas: { width: 600, height: 300, units: "source-pixels" }, items: [{ id: "i", kind: "text", description: "label", x: 100, y: 100, w: 100, h: 30, text: "A", expectedCount: null, colors: [{ role: "text", value: "#000000" }] }], layers: [], connections: [], uncertainties: [] };
    const scene = { nodes: [{ id: "label", type: "text", x: 100, y: 100, w: 100, h: 30, text: "A", fontSize: 20, fill: "#000000" }] };
    const quality = { score: 1, darkRecall: 1, localRecall: 1, edgeF1: 1, colorSimilarity: 1, preview: source };
    const calls = [];
    const result = await reconstructWithTopConf(canvas, source, async ({ task, images, width, height }) => {
      calls.push(task); assert.ok(images.length >= 1); assert.doesNotMatch(JSON.stringify(task), /data:image\//);
      let response;
      if (task.sourceInventory) response = inventory;
      else if (task.regionalRecognition) response = { nodes: [{ ...scene.nodes[0], x: 100 - task.sourceRegion.x, y: 100 - task.sourceRegion.y }] };
      else if (task.wholeImage) response = scene;
      else if (task.panelInspection) response = { complete: true, defects: [], uncertainties: [] };
      else if (task.wholeImageAssessment) response = { complete: true, wholeImageAcceptable: true, coverage: [{ region: "all", missingGroups: [] }], inventoryComplete: true, unlistedSourceItems: [], uncertainties: [], summary: "checked", evidence: [{ itemId: "i", status: "passed", nodeIds: ["label"], reason: "checked" }], defects: [] };
      else throw Error("Unexpected request");
      return requestReconstructionEvidence({ task, images, width, height }, { config: { apiKey: "test-key", model: "fake" }, complete: async () => ({ content: JSON.stringify(response) }) });
    }, (phase) => phases.push(phase), {}, { measure: async () => quality, renderCrop: async () => source });
    assert.ok(result.scene.nodes.some((node) => node.id === "label"));
    assert.ok(calls.some((task) => task.sourceInventory));
    assert.ok(calls.some((task) => task.regionalRecognition));
    assert.ok(result.audit.nativeRecognition.results.some((item) => item.state === "merged"));
    assert.ok(calls.some((task) => task.wholeImageAssessment));
    assert.ok(phases.length);
  } finally { Object.assign(global, saved); }
});
