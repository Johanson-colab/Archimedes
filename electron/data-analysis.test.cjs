const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { before, test } = require("node:test");
const { JSDOM } = require("jsdom");

let parseDelimited, numericValue, summarizeColumn;
before(async () => {
  const { transformWithOxc } = await import("vite");
  const source = fs.readFileSync(path.join(__dirname, "../src/data-analysis.ts"), "utf8").replace(/export /g, "");
  const { code } = await transformWithOxc(source, "data-analysis.ts");
  ({ parseDelimited, numericValue, summarizeColumn } = new Function(`${code}\nreturn { parseDelimited, numericValue, summarizeColumn };`)());
});

test("parses CSV quoting, embedded line breaks, BOM, CRLF and TSV", () => {
  assert.deepEqual(parseDelimited('\uFEFFname,value\r\n"a, b",1\r\n"two\nlines","2"\r\n', ","), { headers: ["name", "value"], rows: [["a, b", "1"], ["two\nlines", "2"]] });
  assert.deepEqual(parseDelimited('name\tvalue\n"a""b"\t3', "\t").rows, [['a"b', "3"]]);
});

test("rejects malformed and ragged data rather than silently shifting columns", () => {
  assert.throws(() => parseDelimited('a,b\n"unclosed,1', ","), /Unclosed/);
  assert.throws(() => parseDelimited("a,b\n1,2,3", ","), /Inconsistent/);
  assert.throws(() => parseDelimited("a,b\n", ","), /No data/);
});

test("statistics exclude blank and non-numeric cells while retaining zero and scientific notation", () => {
  const rows = [["0"], ["2e1"], ["4"], [""], ["abc"]];
  assert.equal(numericValue("0"), 0);
  assert.equal(numericValue("0x10"), null);
  assert.deepEqual(summarizeColumn(rows, 0), { missing: 1, invalid: 1, count: 3, min: 0, max: 20, mean: 8, median: 4 });
});

test("example data opens a real summary, chart and preview", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
  const saved = Object.fromEntries(["window", "document", "HTMLElement", "Node", "IS_REACT_ACT_ENVIRONMENT"].map((key) => [key, global[key]]));
  Object.assign(global, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
  const React = require("react");
  const { createRoot } = require("react-dom/client");
  const { transformWithOxc } = await import("vite");
  const source = fs.readFileSync(path.join(__dirname, "../src/DataAnalysisView.tsx"), "utf8")
    .replace(/^import .*;\r?\n/gm, "").replace("export default function", "function");
  const { code } = await transformWithOxc(source, "DataAnalysisView.tsx", { jsx: { runtime: "classic" } });
  const icons = require("lucide-react");
  const iconNames = ["ArrowRight", "BarChart3", "ChartNoAxesCombined", "Download", "FileSpreadsheet", "LayoutGrid", "LineChart", "ScatterChart", "Sparkles", "Table2", "Upload", "X"];
  const DataAnalysisView = new Function("React", "useMemo", "useRef", "useState", ...iconNames, "useUISettings", "numericValue", "parseDelimited", "summarizeColumn", `${code}\nreturn DataAnalysisView;`)(React, React.useMemo, React.useRef, React.useState, ...iconNames.map((name) => icons[name]), () => ({ t: (key) => key }), numericValue, parseDelimited, summarizeColumn);
  const root = createRoot(document.getElementById("root"));
  let draft = "";
  try {
    await React.act(async () => root.render(React.createElement(DataAnalysisView, { onAskAI: (text) => { draft = text; } })));
    await React.act(async () => [...document.querySelectorAll("button")].find((button) => button.textContent.trim() === "Try example data").click());
    assert.match(document.body.textContent, /example.csv/);
    assert.match(document.body.textContent, /0.805/);
    assert.equal(document.querySelectorAll(".chart-mark").length, 4);
    assert.equal(document.querySelectorAll("tbody tr").length, 4);
    await React.act(async () => document.querySelector('[aria-label="Line chart"]').click());
    assert.equal(document.querySelector('[aria-label="Line chart"]').getAttribute("aria-pressed"), "true");
    assert.ok(document.querySelector(".chart-line"));
    await React.act(async () => [...document.querySelectorAll(".da-column-list button")].find((button) => button.title === "latency_ms").click());
    assert.match(document.body.textContent, /128\.25/);
    const input = document.querySelector('[aria-label="Analysis question"]');
    await React.act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(input, "Compare the models");
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    await React.act(async () => document.querySelector('[aria-label="Continue in chat"]').click());
    assert.match(draft, /Compare the models/);
    assert.match(draft, /full dataset is not attached/);
    assert.match(draft, /Baseline/);
  } finally {
    await React.act(async () => root.unmount());
    dom.window.close();
    for (const [key, value] of Object.entries(saved)) value === undefined ? delete global[key] : global[key] = value;
  }
});
