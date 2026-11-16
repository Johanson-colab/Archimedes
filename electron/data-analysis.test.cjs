const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { before, test } = require("node:test");
const { JSDOM } = require("jsdom");

let scope, load;
before(async () => {
  const { transformWithOxc } = await import("vite");
  scope = { parseDelimited: (await import("../shared/delimited.mjs")).parseDelimited };
  load = async (file, names) => {
    const source = fs.readFileSync(path.join(__dirname, "../src", file), "utf8")
      .replace(/^import .*;\r?\n/gm, "").replace(/^export \{ parseDelimited \} from "\.\.\/shared\/delimited\.mjs";\r?\n/gm, "").replace(/export default /g, "").replace(/export /g, "");
    const { code } = await transformWithOxc(source, file, { jsx: { runtime: "classic" } });
    const bindings = Object.keys(scope).filter(key => !names.includes(key) || key === "parseDelimited");
    Object.assign(scope, new Function(...bindings, `${code}\nreturn {${names.join(",")}};`)(...bindings.map(key => scope[key])));
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

test("analysis owner changes retain each dataset and question, and delayed handoffs identify stale input", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
  const keys = ["window", "document", "HTMLElement", "Node", "IS_REACT_ACT_ENVIRONMENT"];
  const saved = Object.fromEntries(keys.map(key => [key, global[key]]));
  Object.assign(global, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
  const React = require("react"), { createRoot } = require("react-dom/client");
  const icons = require("lucide-react");
  Object.assign(scope, { React, ...React, ...Object.fromEntries(["ArrowRight", "Download", "Upload", "X"].map(name => [name, icons[name]])), useUISettings: () => ({ t: key => key }) });
  await load("Tabs.tsx", ["Tabs", "Tab"]);
  await load("DataAnalysisPlot.tsx", ["DataAnalysisPlot", "formatAnalysisNumber"]);
  scope.format = scope.formatAnalysisNumber;
  await load("DataAnalysisView.tsx", ["DataAnalysisView"]);
  const root = createRoot(document.getElementById("root"));
  let release, handoff;
  const waiting = new Promise(resolve => { release = resolve; });
  const ask = (text, input, isCurrentInput) => { handoff = { text, input, isCurrentInput }; return waiting; };
  const render = ownerKey => React.act(async () => root.render(React.createElement(scope.DataAnalysisView, { ownerKey, onAskAI: ask })));
  const input = async text => React.act(async () => {
    const node = document.getElementById("analysis-question");
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(node, text);
    node.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  const example = id => React.act(async () => {
    const node = document.querySelector('[aria-label="Example dataset"]');
    node.value = id; node.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
  try {
    await render('project-a'); await example('weather'); await input('Keep A question');
    await render('project-b');
    assert.equal(document.querySelector('[aria-label="Example dataset"]').value, 'penguins');
    assert.equal(document.getElementById('analysis-question').value, '');
    await input('Keep B question');
    await render('project-a');
    assert.equal(document.querySelector('[aria-label="Example dataset"]').value, 'weather');
    assert.equal(document.getElementById('analysis-question').value, 'Keep A question');
    await React.act(async () => { document.querySelector('[aria-label="Continue in chat"]').click(); });
    assert.equal(handoff.input.id, 'example:weather');
    assert.equal(handoff.isCurrentInput(), true);
    assert.match(handoff.text, /full dataset is not attached/);
    assert.equal(document.querySelector('[aria-label="Continue in chat"]').disabled, true);
    await example('penguins');
    assert.equal(handoff.isCurrentInput(), false);
    await React.act(async () => { release(); await waiting; });
    await render('project-b');
    assert.equal(document.getElementById('analysis-question').value, 'Keep B question');
  } finally {
    release();
    await React.act(async () => root.unmount()); dom.window.close();
    for (const [key, value] of Object.entries(saved)) value === undefined ? delete global[key] : global[key] = value;
  }
});

test("the actual analysis component saves full CSV plus SVG, reopens its configuration, and links an explicit source handoff", async () => {
  const os = require("node:os"), crypto = require("node:crypto"), packages = require("./project-results.cjs");
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-analysis-result-")));
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
  const keys = ["window", "document", "HTMLElement", "Node", "XMLSerializer", "getComputedStyle", "IS_REACT_ACT_ENVIRONMENT"];
  const savedGlobals = Object.fromEntries(keys.map((key) => [key, global[key]]));
  Object.assign(global, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, XMLSerializer: dom.window.XMLSerializer, getComputedStyle: dom.window.getComputedStyle, IS_REACT_ACT_ENVIRONMENT: true });
  const React = require("react"), { createRoot } = require("react-dom/client"), icons = require("lucide-react");
  Object.assign(scope, { React, ...React, ...Object.fromEntries(["ArrowRight", "Download", "Upload", "X"].map((name) => [name, icons[name]])), useUISettings: () => ({ t: (key) => key }) });
  await load("Tabs.tsx", ["Tabs", "Tab"]); await load("DataAnalysisPlot.tsx", ["DataAnalysisPlot", "formatAnalysisNumber"]);
  scope.format = scope.formatAnalysisNumber; await load("DataAnalysisView.tsx", ["DataAnalysisView"]);
  const records = new Map(), owner = { projectId: "project-a", workspaceId: "workspace-a", executionRoot: directory };
  const bridge = {
    saveProjectResult: async (input) => { const detail = packages.savePackage({ ...input, executionRoot: directory, id: input.id || crypto.randomUUID() }); records.set(detail.id, detail); return detail; },
    listProjectResults: async () => [...records.values()], getProjectResult: async (id) => packages.readPackage(records.get(id)), readProjectResultFile: async (id, name) => packages.readPackageFile(records.get(id), name),
  };
  let root = createRoot(document.getElementById("root")), handoff;
  const render = async () => React.act(async () => { root.render(React.createElement(scope.DataAnalysisView, { ownerKey: directory, owner, bridge, onAskAI: (text, input) => { handoff = { text, input }; return "real-linked-session"; } })); });
  const click = async (label) => React.act(async () => { const button = [...document.querySelectorAll("button")].find((item) => item.textContent === label); assert.ok(button, label); assert.equal(button.disabled, false); button.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
  const question = async (text) => React.act(async () => { const node = document.getElementById("analysis-question"); Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(node, text); node.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
  try {
    await render(); await question("Compare the complete observations");
    await click("Save analysis to project");
    const record = [...records.values()][0], source = record.files.find((file) => file.role === "source");
    assert.equal(fs.readFileSync(path.join(directory, source.path), "utf8"), scope.penguins, "save must keep the original complete bytes rather than the five-row prompt sample");
    assert.match(packages.readPackageFile(record, "plot.svg").content, /<svg/);
    const lines = scope.penguins.trimEnd().split("\n"), lastLine = lines.length;
    assert.ok(lastLine > 5);
    assert.match(require("./agent/workspace-tools.cjs").readLines(directory, source.path, lastLine, lastLine).content, new RegExp(lines.at(-1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    await React.act(async () => root.unmount()); root = createRoot(document.getElementById("root")); await render();
    assert.equal(document.getElementById("analysis-question").value, "");
    await React.act(async () => { const node = document.querySelector('[aria-label="Saved analyses"]'); node.value = record.id; node.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
    await click("Open saved analysis"); assert.equal(document.getElementById("analysis-question").value, "Compare the complete observations");
    await click("Continue with original CSV / TSV");
    assert.equal(records.size, 1, "linking the newly created session updates the same result package");
    assert.equal([...records.values()][0].threadId, "real-linked-session");
    assert.equal(handoff.input.resultId, record.id); assert.equal(handoff.input.sourcePath, source.path);
    assert.match(handoff.text, /complete original file saved at research-results\/analysis/);
    assert.match(handoff.text, /does not place every row in the model context/);
    assert.ok(!handoff.text.includes(lines.at(-1)), "attaching a path must not silently put the full source into the message");
  } finally { await React.act(async () => root.unmount()); dom.window.close(); fs.rmSync(directory, { recursive: true, force: true }); for (const [key, value] of Object.entries(savedGlobals)) value === undefined ? delete global[key] : global[key] = value; }
});
