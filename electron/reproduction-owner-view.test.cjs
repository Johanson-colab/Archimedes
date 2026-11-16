const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const { test } = require("node:test");
const { JSDOM } = require("jsdom");
const { normalizeContract } = require("./reproduction/contract.cjs");
function deferred() { let resolve; const promise = new Promise((value) => { resolve = value; }); return { promise, resolve }; }
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("actual Reproduce view keeps copied same-id events within their data root, explicitly binds legacy records, and reads historical evidence separately", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
  const keys = ["window", "document", "HTMLElement", "Node", "IS_REACT_ACT_ENVIRONMENT"], previous = Object.fromEntries(keys.map((key) => [key, global[key]]));
  Object.assign(global, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
  const React = require("react"), { createRoot } = require("react-dom/client"), icons = require("lucide-react"), element = React.createElement;
  const source = fs.readFileSync(path.join(__dirname, "../src/ReproduceView.tsx"), "utf8"), names = source.match(/\{([^}]+)\} from "lucide-react"/)[1].split(",").map((name) => name.trim());
  const scope = { React, ...React, ...Object.fromEntries(names.map((name) => [name, icons[name]])), useUISettings: () => ({ t: (key, values) => values ? key.replace(/\{(\w+)\}/g, (_match, name) => values[name]) : key }), InlineNotice: ({ children }) => element("p", null, children), StateView: ({ title, description }) => element("p", null, title, description), ReproductionEnvironmentDialog: () => null, MetricComparisonPanel: () => null };
  const { transformWithOxc } = await import("vite");
  const { code } = await transformWithOxc(source.replace(/^import .*;\r?\n/gm, "").replace(/^export default /gm, ""), "ReproduceView.tsx", { jsx: { runtime: "classic" } });
  const View = new Function(...Object.keys(scope), `${code.replace(/^export \{\};?$/gm, "")}\nreturn ReproduceView;`)(...Object.values(scope));
  const planListeners = new Set(), runListeners = new Set(), gates = { a: deferred(), b: deferred() }, planInputs = [], listInputs = [];
  const contract = normalizeContract({ claims: [{ statement: "Recover the reported fixture value", metric: "accuracy", expected: 1 }], summary: "Current plan", entrypoint: { command: "new-command", outputs: [] }, steps: [{ id: "new", title: "Current checkpoint", command: "new-command", checkpoint: "New check" }] });
  const records = Object.fromEntries(["a", "b"].map((data) => [data, { id: "copied-id", title: `Legacy ${data}`, project_id: null, workspace_id: null, execution_root: null, paper_id: null, contract: null, status: "draft", error: "", budget: { wallClockMin: 20 }, run: { id: `run-${data}`, reproduction_id: "copied-id", status: "running", backend: "fixture", log: `BASE_${data}`, steps: [], started_at: "2026-11-16" } }]));
  let current = "a";
  const history = { id: "historical-run", reproduction_id: "copied-id", status: "verified", started_at: "2026-11-15", error: "", log: "ORIGINAL_RECORDED_OUTPUT", snapshot: { owner: { executionRoot: "/old/execution" }, plan: { version: "a".repeat(64), contract: { steps: [] } }, prepared: { checkout: { commit: "c".repeat(40), dirty: true, storage: "local" } }, final: { summary: "Historical receipt", runbook: [{ id: "old", title: "Old checkpoint", command: "ORIGINAL_RECORDED_COMMAND" }] } }, snapshot_state: { status: "restored-history", reasons: ["Restored historical evidence; it was not executed in this folder."], limitations: [] } };
  const bridge = {
    listReproductions: async (input) => { listInputs.push(input); return [records[current]]; }, getReproduction: async () => records[current], listSshServers: async () => [],
    listReproductionRuns: async () => [history], getReproductionRun: async (id) => { assert.equal(id, history.id); return history; },
    onReproductionPlanEvent: (callback) => { planListeners.add(callback); return () => planListeners.delete(callback); }, onReproductionRunEvent: (callback) => { runListeners.add(callback); return () => runListeners.delete(callback); },
    planReproduction: async (id, context) => { const data = current; planInputs.push({ id, context, data }); await gates[data].promise; records[data] = { ...records[data], project_id: "project", workspace_id: "workspace", execution_root: `/execution/${data}`, status: "planned", contract }; return records[data]; },
  };
  const root = createRoot(document.getElementById("root"));
  const render = (data) => React.act(async () => { current = data; root.render(element(View, { bridge, dataRoot: `/data/${data}`, ownerKey: `/data/${data}`, projectId: "project", projectName: `Project ${data}`, workspaceId: "workspace", active: true, selectedId: "copied-id", onSelect() {} })); await tick(); });
  const shown = () => document.querySelector('.reproduction-owner-workspace:not([hidden])');
  const plan = () => React.act(async () => { [...shown().querySelectorAll("button")].find((button) => button.textContent.trim() === "Generate plan").click(); await tick(); });
  const event = (data, fields) => ({ reproductionId: "copied-id", dataRoot: `/data/${data}`, projectId: "project", workspaceId: "workspace", ...fields });
  try {
    await render("a"); assert.ok(shown().textContent.includes("Unassigned reproduction.")); assert.ok(listInputs[0].includeUnassigned);
    await plan(); await render("b"); await plan();
    await React.act(async () => { for (const listener of planListeners) listener(event("a", { detail: "A_ONLY_PLAN_PROGRESS" })); });
    assert.ok(!shown().textContent.includes("A_ONLY_PLAN_PROGRESS"));
    await React.act(async () => { for (const listener of planListeners) listener(event("b", { detail: "B_ONLY_PLAN_PROGRESS" })); });
    assert.ok(shown().textContent.includes("B_ONLY_PLAN_PROGRESS"));
    gates.b.resolve(); await React.act(async () => { await gates.b.promise; await tick(); });
    assert.ok(!shown().textContent.includes("Unassigned reproduction."));
    assert.deepEqual(planInputs.map((item) => item.context), [{ projectId: "project", workspaceId: "workspace" }, { projectId: "project", workspaceId: "workspace" }]);
    await React.act(async () => { for (const listener of runListeners) listener(event("a", { type: "output", chunk: "A_ONLY_LATE_OUTPUT" })); });
    assert.ok(!shown().textContent.includes("A_ONLY_LATE_OUTPUT"));
    await React.act(async () => { for (const listener of runListeners) listener(event("b", { type: "output", chunk: "B_ONLY_LATE_OUTPUT" })); });
    assert.ok(shown().textContent.includes("B_ONLY_LATE_OUTPUT"));
    const select = shown().querySelector('[aria-label="Historical run"]');
    await React.act(async () => { select.value = history.id; select.dispatchEvent(new dom.window.Event("change", { bubbles: true })); await tick(); });
    const historyPanel = shown().querySelector('.reproduction-run-history');
    assert.ok(historyPanel.textContent.includes("ORIGINAL_RECORDED_COMMAND")); assert.ok(historyPanel.textContent.includes("ORIGINAL_RECORDED_OUTPUT")); assert.ok(historyPanel.textContent.includes("not executed in this folder"));
    await render("a"); gates.a.resolve(); await React.act(async () => { await gates.a.promise; await tick(); });
    assert.ok(shown().textContent.includes("Legacy a")); assert.ok(!shown().textContent.includes("B_ONLY_LATE_OUTPUT"));
  } finally { gates.a.resolve(); gates.b.resolve(); await React.act(async () => root.unmount()); dom.window.close(); for (const [key, value] of Object.entries(previous)) value === undefined ? delete global[key] : global[key] = value; }
});
