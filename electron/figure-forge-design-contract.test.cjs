const test = require("node:test");
const assert = require("node:assert/strict");

async function contract() {
  return import("../src/figureforge/design-contract.mjs");
}

test("design contract clamps model output into known bounds", async () => {
  const { normalizeDesignContract } = await contract();
  const normalized = normalizeDesignContract({
    layout: "  three panels left to right  ",
    panels: [{ name: "Input", role: "raw data", x: -20, y: 0, w: 5000, h: 900 }, { name: "", role: "" }, "junk"],
    elements: "rounded boxes",
    palette: { background: "#FFFFFF", primary: "#2F6F4F", accent: "red", neutral: "#4a4a4a", others: ["#b31b1b", "#b31b1b", "nope"] },
    typography: { title: 400, panelHeader: 2, label: 22, note: 18 },
    strokes: { box: 0, arrow: 99, connector: 2 },
    density: { panels: 0, modulesPerPanel: 5, connectors: 60 },
    hierarchy: "title first",
    caveats: "panel count varied",
  });
  assert.equal(normalized.layout, "three panels left to right");
  assert.equal(normalized.panels.length, 1, "panels without a name or role are dropped");
  assert.deepEqual({ x: normalized.panels[0].x, w: normalized.panels[0].w }, { x: 0, w: 1600 });
  assert.equal(normalized.palette.background, "#ffffff");
  assert.equal(normalized.palette.accent, "", "invalid hex is dropped, not guessed");
  assert.deepEqual(normalized.palette.others, ["#b31b1b"]);
  assert.equal(normalized.typography.title, 96);
  assert.equal(normalized.typography.panelHeader, 8);
  assert.equal(normalized.strokes.box, 1);
  assert.equal(normalized.strokes.arrow, 12);
  assert.equal(normalized.density.panels, 1);
  assert.equal(normalized.density.connectors, 40);
  assert.equal(normalizeDesignContract(null).layout, "");
});

test("a contract is only usable when it carries measured evidence", async () => {
  const { contractIsUsable, normalizeDesignContract } = await contract();
  assert.equal(contractIsUsable(null), false);
  assert.equal(contractIsUsable(normalizeDesignContract({ layout: "two panels" })), false);
  assert.equal(contractIsUsable(normalizeDesignContract({ layout: "two panels", palette: { primary: "#2f6f4f" } })), true);
  assert.equal(contractIsUsable(normalizeDesignContract({ layout: "two panels", panels: [{ name: "A" }] })), true);
  assert.equal(contractIsUsable(normalizeDesignContract({ palette: { primary: "#2f6f4f" } })), false, "layout is required");
});

test("contract rendering keeps exact values for the SVG path", async () => {
  const { normalizeDesignContract, renderDesignContract } = await contract();
  const text = renderDesignContract(normalizeDesignContract({
    layout: "three panels left to right",
    panels: [{ name: "Input", role: "raw data", x: 0, y: 0, w: 520, h: 900 }],
    palette: { background: "#ffffff", primary: "#2f6f4f" },
    typography: { title: 44, label: 22 },
    strokes: { box: 3 },
    density: { panels: 3, modulesPerPanel: 5 },
    elements: "rounded boxes",
    hierarchy: "title first",
  }));
  assert.match(text, /three panels left to right/);
  assert.match(text, /palette \(use these exact hex values\): background=#ffffff, primary=#2f6f4f/);
  assert.match(text, /type scale .*title 44px, label 22px/);
  assert.match(text, /stroke widths: box 3px/);
  assert.match(text, /density targets: 3 panels, 5 modules per panel/);
  assert.match(text, /Input \/ raw data x=0 y=0 w=520 h=900/);
  assert.match(text, /no conspicuous empty panels/);
});

test("the bitmap guide drops coordinates but keeps palette, density and strokes", async () => {
  const { normalizeDesignContract, renderImageGuide } = await contract();
  const text = renderImageGuide(normalizeDesignContract({
    layout: "three panels left to right",
    panels: [{ name: "Input", role: "raw data", x: 0, y: 0, w: 520, h: 900 }],
    palette: { primary: "#2f6f4f" },
    strokes: { box: 3 },
    density: { panels: 3 },
    caveats: "panel count varied",
  }));
  assert.doesNotMatch(text, /x=0 y=0 w=520/, "image models ignore coordinates, so they are not sent");
  assert.match(text, /Input: raw data/);
  assert.match(text, /Palette: primary=#2f6f4f/);
  assert.match(text, /Density: 3 panels/);
  assert.match(text, /Stroke weights: box 3px/);
  assert.match(text, /Caveats: panel count varied/);
  assert.equal(renderImageGuide(null), "");
});
