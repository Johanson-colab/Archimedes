const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");

test("generated SVG is decomposed into editable objects for native exports", async () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  const previousDocument = global.document, previousParser = global.DOMParser;
  global.document = dom.window.document; global.DOMParser = dom.window.DOMParser;
  try {
    const { parseSvgScene } = await import("../src/figureforge/vendor/svg-scene.mjs");
    const scene = parseSvgScene('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><g transform="translate(10 5)"><rect x="1" y="2" width="60" height="30" fill="#ff0000"/><text x="5" y="20" font-size="12">Label</text><line x1="0" y1="0" x2="80" y2="50" stroke="#000000"/></g></svg>');
    assert.deepEqual(scene.nodes.map((node) => node.type), ["rect", "text", "line"]);
    assert.equal(scene.nodes[0].x, 11);
    assert.equal(scene.nodes[1].text, "Label");
    assert.equal(scene.nodes[2].x2, 90);
    scene.svgSource = true;
    const { sceneToDrawio, sceneToVsdxFiles, zipStore } = await import("../src/figureforge/vendor/upstream-exporters.mjs");
    const { buildNativePptx } = await import("../src/figureforge/vendor/editable-native.mjs");
    const template = require("../src/figureforge/vendor/pptx-template.json");
    assert.match(sceneToDrawio(scene), /Label/);
    assert.match(Buffer.from(await zipStore(sceneToVsdxFiles(scene, "Arial")).arrayBuffer()).toString(), /Label/);
    assert.match(Buffer.from(await (await buildNativePptx(scene, zipStore, template)).arrayBuffer()).toString(), /Label/);
    const rotated = parseSvgScene('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10" y="20" width="30" height="10" transform="rotate(90 25 25)" fill="#ff0000"/></svg>');
    assert.equal(rotated.nodes[0].rotation, 90);
    assert.equal(rotated.nodes[0].w, 30);
    assert.equal(rotated.nodes[0].h, 10);
    assert.equal(dom.window.document.body.children.length, 0);
  } finally { global.document = previousDocument; global.DOMParser = previousParser; dom.window.close(); }
});
