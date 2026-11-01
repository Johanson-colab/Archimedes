const test = require("node:test");
const assert = require("node:assert/strict");
const template = require("../src/figureforge/vendor/pptx-template.json");

test("native reconstruction exporters retain individually editable objects", async () => {
  const { sceneToDrawio, sceneToVsdxFiles, zipStore } = await import("../src/figureforge/vendor/upstream-exporters.mjs");
  const { buildNativePptx } = await import("../src/figureforge/vendor/editable-native.mjs");
  const scene = { canvas: { width: 1200, height: 675 }, nodes: [
    { type: "rect", x: 20, y: 20, w: 200, h: 80, fill: "#ffffff", stroke: "#222222" },
    { type: "text", x: 30, y: 35, w: 180, h: 35, text: "Editable label", fontSize: 20, fill: "#000000", fontFamily: "Georgia", bold: true, italic: true },
  ] };
  const drawio = sceneToDrawio(scene);
  assert.equal((drawio.match(/<mxCell id="ff\d+"/g) || []).length, 2);
  assert.match(drawio, /Editable label/);
  assert.match(drawio, /fontFamily=Georgia;fontStyle=3/);
  const vsdx = Buffer.from(await zipStore(sceneToVsdxFiles(scene, "Arial")).arrayBuffer()).toString("utf8");
  assert.match(vsdx, /Editable label/);
  const pptx = Buffer.from(await (await buildNativePptx(scene, zipStore, template)).arrayBuffer()).toString("utf8");
  assert.match(pptx, /Editable label/);
  assert.match(pptx, /<p:sp>/);
});
