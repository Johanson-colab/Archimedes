const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { before, test } = require("node:test");
const { JSDOM } = require("jsdom");

let scope, load;
before(async () => {
  const { transformWithOxc } = await import("vite");
  scope = {};
  load = async (file, names) => {
    const source = fs.readFileSync(path.join(__dirname, "../src", file), "utf8")
      .replace(/^import .*;\r?\n/gm, "").replace(/export default /g, "").replace(/export /g, "");
    const { code } = await transformWithOxc(source, file, { jsx: { runtime: "classic" } });
    Object.assign(scope, new Function(...Object.keys(scope), `${code}\nreturn {${names.join(",")}};`)(...Object.values(scope)));
  };
  await load("data-analysis.ts", ["parseDelimited", "numericValue", "isMissing", "dateValue", "summarizeColumn", "profileDataset", "buildPlot"]);
  scope.penguins = fs.readFileSync(path.join(__dirname, "../src/assets/data-analysis/penguins.csv"), "utf8");
  scope.weather = fs.readFileSync(path.join(__dirname, "../src/assets/data-analysis/seattle-weather.csv"), "utf8");
  await load("data-analysis-examples.ts", ["analysisExamples"]);
});

test("CSV quoting, BOM, CRLF, multiline cells and TSV retain original values", () => {
  assert.deepEqual(scope.parseDelimited('\uFEFFname,value\r\n"a, b",1\r\n"two\nlines","2"\r\n', ","), { headers: ["name", "value"], rows: [["a, b", "1"], ["two\nlines", "2"]] });
  assert.deepEqual(scope.parseDelimited('name\tvalue\n"a""b"\t3', "\t").rows, [['a"b', "3"]]);
  assert.throws(() => scope.parseDelimited('a,b\n"unclosed,1', ","), /Unclosed/);
  assert.throws(() => scope.parseDelimited("a,b\n1,2,3", ","), /Inconsistent/);
  assert.throws(() => scope.parseDelimited("a,b\n", ","), /No data/);
});

test("missing tokens are excluded from numeric statistics without rewriting source data", () => {
  const rows = [["0"], ["2e1"], ["4"], ["NA"], ["abc"]];
  assert.equal(scope.numericValue("0"), 0);
  assert.equal(scope.numericValue("0x10"), null);
  assert.deepEqual(scope.summarizeColumn(rows, 0), { missing: 1, invalid: 1, count: 3, min: 0, max: 20, mean: 8, median: 4 });
  assert.equal(rows[3][0], "NA");
});

test("real bundled examples retain documented shape, missingness, group sizes and full-data calculations", () => {
  const data = scope.parseDelimited(scope.penguins, ",");
  assert.equal(data.rows.length, 344); assert.equal(data.headers.length, 8);
  const profiles = scope.profileDataset(data);
  assert.equal(profiles[0].kind, "text"); assert.equal(profiles[5].kind, "number");
  assert.equal(profiles.reduce((total, field) => total + field.missing, 0), 19);
  const scatter = scope.buildPlot(data, scope.analysisExamples[0].presets[0].config);
  assert.equal(scatter.valid, 342); assert.equal(scatter.points.length, 342);
  assert.ok(Math.abs(scatter.correlation - .8712) < .001);
  const bar = scope.buildPlot(data, scope.analysisExamples[0].presets[1].config);
  assert.equal(bar.points.length, 3);
  assert.equal(bar.points.reduce((sum, point) => sum + point.count, 0), 342);
  assert.ok(Math.abs(bar.points.find((point) => point.label === "Gentoo").y - 5076.016) < .01);
  const histogram = scope.buildPlot(data, scope.analysisExamples[0].presets[2].config);
  assert.equal(histogram.points.reduce((sum, point) => sum + point.y, 0), 342);
});

test("time-series dates are real dates, sorted and not truncated to the first 100 rows", () => {
  const data = scope.parseDelimited(scope.weather, ",");
  assert.equal(data.rows.length, 1461); assert.equal(data.headers.length, 6);
  assert.equal(scope.profileDataset(data)[0].kind, "date");
  assert.equal(scope.dateValue("2012-02-30"), null);
  const plot = scope.buildPlot(data, scope.analysisExamples[1].presets[0].config);
  assert.equal(plot.points.length, 1461);
  assert.equal(plot.points[0].label, "2012-01-01");
  assert.equal(plot.points.at(-1).label, "2015-12-31");
  assert.ok(plot.points.every((point, index) => !index || point.x >= plot.points[index - 1].x));
});

test("display sampling retains endpoints and unsupported numeric fields return an empty plot", () => {
  const data = { headers: ["x", "y"], rows: Array.from({ length: 5000 }, (_, i) => [String(i), String(i * 2)]) };
  const plot = scope.buildPlot(data, { type: "scatter", x: 0, y: 1, group: -1 });
  assert.equal(plot.valid, 5000); assert.equal(plot.points.length, 2000);
  assert.equal(plot.points[0].x, 0); assert.equal(plot.points.at(-1).x, 4999);
  assert.equal(plot.correlation, 1);
  assert.equal(scope.buildPlot(data, { type: "histogram", x: 0, y: -1, group: -1 }).points.length, 0);
});

test("field inspection does not empty a valid plot; examples, pagination and bounded chat draft work", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
  const keys = ["window", "document", "HTMLElement", "Node", "IS_REACT_ACT_ENVIRONMENT"];
  const saved = Object.fromEntries(keys.map((key) => [key, global[key]]));
  Object.assign(global, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
  const React = require("react"), { createRoot } = require("react-dom/client");
  const icons = require("lucide-react");
  Object.assign(scope, { React, ...React, ...Object.fromEntries(["ArrowRight", "Download", "Upload", "X"].map((name) => [name, icons[name]])), useUISettings: () => ({ t: (key) => key }) });
  await load("Tabs.tsx", ["Tabs", "Tab"]);
  await load("DataAnalysisPlot.tsx", ["DataAnalysisPlot", "formatAnalysisNumber"]);
  scope.format = scope.formatAnalysisNumber;
  await load("DataAnalysisView.tsx", ["DataAnalysisView"]);
  const root = createRoot(document.getElementById("root"));
  let draft = "";
  const click = (node) => React.act(async () => { assert.ok(node); node.click(); });
  try {
    await React.act(async () => root.render(React.createElement(scope.DataAnalysisView, { onAskAI: (text) => { draft = text; } })));
    assert.equal(document.querySelectorAll(".analysis-mark").length, 342);
    await click(document.querySelector('[title="species"]'));
    assert.equal(document.querySelectorAll(".analysis-mark").length, 342);
    assert.equal(document.querySelector('[aria-label="Y field"]').value, "5");
    assert.ok(![...document.querySelector('[aria-label="Y field"]').options].some((option) => option.textContent === "species"));
    await click([...document.querySelectorAll(".analysis-presets button")].find((button) => button.textContent === "Mean body mass by species"));
    assert.equal(document.querySelectorAll(".analysis-mark").length, 3);
    const examples = document.querySelector('[aria-label="Example dataset"]');
    await React.act(async () => { examples.value = "weather"; examples.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
    assert.equal(document.querySelectorAll(".analysis-mark").length, 1461);
    await click([...document.querySelectorAll('[role="tab"]')].find((button) => button.textContent === "Data table"));
    assert.equal(document.querySelectorAll("tbody tr").length, 50);
    await click([...document.querySelectorAll("button")].find((button) => button.textContent === "Next"));
    assert.equal(document.querySelector("tbody td").textContent, "51");
    const input = document.getElementById("analysis-question");
    await React.act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(input, "Explain the seasonal pattern"); input.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
    await click(document.querySelector('[aria-label="Continue in chat"]'));
    assert.match(draft, /Explain the seasonal pattern/); assert.match(draft, /full dataset is not attached/);
    assert.match(draft, /2012-01-01/); assert.ok(!draft.includes("2015-12-31"));
  } finally {
    await React.act(async () => root.unmount()); dom.window.close();
    for (const [key, value] of Object.entries(saved)) value === undefined ? delete global[key] : global[key] = value;
  }
});
