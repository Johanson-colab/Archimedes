const test = require("node:test");
const assert = require("node:assert/strict");
const { createCanvas, Image } = require("@napi-rs/canvas");

test("visual comparison detects a missing source object", async () => {
  const originalDocument = global.document, originalImage = global.Image;
  global.document = { createElement: () => createCanvas(1, 1) }; global.Image = Image;
  try {
    const { compareEditableRender } = await import("../src/figureforge/vendor/reconstruction-renderer.mjs");
    const source = createCanvas(100, 100), context = source.getContext("2d");
    context.fillStyle = "white"; context.fillRect(0, 0, 100, 100);
    context.fillStyle = "black"; context.fillRect(20, 20, 50, 20);
    const blank = createCanvas(100, 100); blank.getContext("2d").fillStyle = "white"; blank.getContext("2d").fillRect(0, 0, 100, 100);
    const same = await compareEditableRender(source, source.toDataURL("image/png"));
    const missing = await compareEditableRender(source, blank.toDataURL("image/png"));
    assert.ok(same.score > 0.99);
    assert.ok(missing.darkRecall < same.darkRecall);
  } finally { global.document = originalDocument; global.Image = originalImage; }
});
