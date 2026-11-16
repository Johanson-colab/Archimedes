const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), crypto = require("node:crypto");
const { test } = require("node:test");
const { JSDOM } = require("jsdom");
const packages = require("./project-results.cjs");

test("actual FigureForge preserves owner drafts and reopens saved source, references, models and output without re-uploading", async () => {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-figure-result-")));
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost", pretendToBeVisual: true });
  const keys = ["window", "document", "HTMLElement", "Node", "DOMParser", "XMLSerializer", "FileReader", "File", "Blob", "IS_REACT_ACT_ENVIRONMENT", "fetch", "createImageBitmap"];
  const previous = Object.fromEntries(keys.map((key) => [key, global[key]]));
  for (const key of keys.slice(0, 10)) global[key] = dom.window[key];
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
  let urls = 0; URL.createObjectURL = () => `blob:fixture-${++urls}`; URL.revokeObjectURL = () => {};
  let remoteImages = 0;
  global.fetch = async (url) => { assert.match(String(url), /figures\.json$/); return { ok: true, json: async () => [{ id: "catalog", venue: "icml", year: 2026, title: "Catalog fixture", authors: [], pattern: "framework", paper: "https://example.invalid/paper", image: "images/icml/final/fixture.jpg" }], blob: async () => { remoteImages++; throw new Error("A restored reference must not be fetched again."); } }; };
  global.createImageBitmap = async () => ({ width: 32, height: 32, close() {} });
  dom.window.HTMLCanvasElement.prototype.getContext = () => ({ fillRect() {}, drawImage() {} });
  dom.window.HTMLCanvasElement.prototype.toDataURL = () => "data:image/jpeg;base64,UkVG";
  let generationGate, saveGate, saveReached; const saveInputs = [];
  dom.window.researchDesk = { generateFigureSvg: async () => generationGate.promise, generateFigureBitmap: async () => { throw new Error("No bitmap request expected"); } };
  const React = require("react"), { createRoot } = require("react-dom/client"), icons = require("lucide-react");
  const element = React.createElement, bindings = { React, ...React, ...Object.fromEntries(["ArrowLeft", "ArrowRight", "ChevronDown", "ExternalLink", "GraduationCap", "ImageOff", "ImagePlus", "LoaderCircle", "Search", "SlidersHorizontal", "Sparkle", "Upload", "Wand", "X"].map((name) => [name, icons[name]])), useUISettings: () => ({ t: (key) => key, language: "en" }),
    Dialog: ({ open, children }) => open ? element("section", null, children) : null, MenuSurface: ({ open, children }) => open ? element("section", null, children) : null,
    InlineNotice: ({ children }) => element("p", { role: "alert" }, children), StateView: ({ title }) => element("p", null, title),
    testPdfjs: { getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => ({ getTextContent: async () => ({ items: [{ str: "NEW_PDF_PAGE_CONTENT ".repeat(10) }] }), cleanup() {} }), destroy: async () => {} }) }) },
    ...await import("../src/figureforge/vendor/svg-scene.mjs"), ...await import("../src/figureforge/pdf-sections.mjs"),
    ...await import("../src/figureforge/design-contract.mjs"), ...await import("../src/figureforge/sanitize-svg.mjs"),
  };
  const { transformWithOxc } = await import("vite");
  async function load(file, names) {
    const source = fs.readFileSync(path.join(__dirname, "../src", file), "utf8").replace(/^import .*;\r?\n/gm, "").replace(/^export default /gm, "").replace(/^export /gm, "");
    const { code } = await transformWithOxc(source.replace('import("./pdf-runtime")', "Promise.resolve({pdfjs: testPdfjs})"), file, { jsx: { runtime: "classic" } });
    const evaluated = code.replaceAll("import.meta.url", JSON.stringify(require("node:url").pathToFileURL(path.join(__dirname, "../src", file)).href));
    Object.assign(bindings, new Function(...Object.keys(bindings), `${evaluated}\nreturn {${names.join(",")}};`)(...Object.values(bindings)));
  }
  await load("Tabs.tsx", ["Tabs", "Tab"]); await load("ImageCreationView.tsx", ["ImageCreationView"]);
  const owner = { projectId: "project-a", workspaceId: "workspace-a", executionRoot: directory }, records = new Map();
  const image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=";
  const seed = packages.savePackage({ ...owner, id: "restored-result", threadId: null, kind: "figure", title: "Saved figure", manifest: {
    version: 1, paper: { title: "Original paper", file: "paper.txt", sourceName: "local-paper.pdf" }, requirements: "Retain this layout", plan: "Input → method → output", figureType: "pipeline", aspect: "16:9", outputMode: "svg", method: "direct",
    model: { provider: "custom", baseUrl: "https://example.invalid/v1", parseModel: "parse-fixture", visionModel: "vision-fixture", imageModel: "image-fixture", resolution: "1K" },
    references: [1, 2].map((index) => ({ id: `reference-${index}`, origin: "catalog", name: "Reference paper", file: "reference.png", sourceUrl: "https://example.invalid/reference.png", figure: { id: `reference-${index}`, venue: "icml", year: 2026, title: "Reference paper", authors: [], pattern: "pipeline", image: "https://example.invalid/reference.png", paper: "https://example.invalid/paper" } })), designContract: null, designPicks: { representative: [], imageRefs: [] }, output: { file: "figure.svg", kind: "svg" },
  }, files: [{ name: "paper.txt", role: "source", encoding: "utf8", content: "Complete extracted paper content. ".repeat(10) }, { name: "reference.png", role: "reference", encoding: "base64", content: image }, { name: "figure.svg", role: "output", encoding: "utf8", content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200"><text>Original output</text></svg>' }] });
  records.set(seed.id, seed);
  let savedOperationResolve;
  const savedOperation = new Promise((resolve) => { savedOperationResolve = resolve; });
  const readFiles = [], bridge = {
    saveProjectResult: async (input) => { saveInputs.push(input); if (saveGate) { saveReached?.(); await saveGate.promise; } const detail = packages.savePackage({ ...input, executionRoot: directory, id: input.id || crypto.randomUUID() }); records.set(detail.id, detail); savedOperationResolve(); return detail; },
    listProjectResults: async (input) => [...records.values()].filter((item) => item.projectId === input.projectId),
    getProjectResult: async (id) => packages.readPackage(records.get(id)),
    readProjectResultFile: async (id, name) => { readFiles.push(name); return packages.readPackageFile(records.get(id), name); },
  };
  const root = createRoot(document.getElementById("root"));
  const render = (key, selectedOwner) => React.act(async () => { root.render(element(bindings.ImageCreationView, { ownerKey: key, owner: selectedOwner, bridge, active: true, onBrowseProceedings() {} })); });
  const shown = () => document.querySelector('.figure-owner-workspace:not([hidden])');
  const input = async (node, value) => React.act(async () => { assert.ok(node); const prototype = node.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, "value").set.call(node, value); node.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
  const click = async (label) => React.act(async () => { const button = [...shown().querySelectorAll("button")].find((item) => item.textContent === label); assert.ok(button, label); assert.equal(button.disabled, false); button.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
  try {
    await render("data-a:project-a", owner);
    await input(shown().querySelector('textarea[placeholder="Optional: layout wishes, must-have modules, terms to use."]'), "Unsaved A layout");
    await render("data-a:project-b", { ...owner, projectId: "project-b", workspaceId: "workspace-b" });
    assert.equal(shown().querySelector('textarea[placeholder="Optional: layout wishes, must-have modules, terms to use."]').value, "");
    await input(shown().querySelector('textarea[placeholder="Optional: layout wishes, must-have modules, terms to use."]'), "Unsaved B layout");
    await render("data-a:project-a", owner);
    assert.equal(shown().querySelector('textarea[placeholder="Optional: layout wishes, must-have modules, terms to use."]').value, "Unsaved A layout");
    await React.act(async () => { const node = shown().querySelector('[aria-label="Saved figures"]'); node.value = seed.id; node.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
    await click("Open saved figure");
    assert.deepEqual(readFiles, ["paper.txt", "reference.png", "reference.png", "figure.svg"], "restoration reads registered files sequentially instead of one giant metadata IPC");
    assert.equal(shown().querySelector('textarea[placeholder="Optional: layout wishes, must-have modules, terms to use."]').value, "Retain this layout");
    assert.match(decodeURIComponent(shown().querySelector('img[alt="Generated figure preview"]').src), /Original output/);
    assert.ok(shown().textContent.includes("Reference paper"));
    assert.equal(shown().querySelector('input[type="password"]').value, "");
    await click("Save figure to project");
    await React.act(async () => { await savedOperation; });
    assert.ok(shown().textContent.includes("Figure snapshot saved to this project."), shown().textContent);
    const saved = records.get(seed.id);
    assert.equal(records.size, 1); assert.equal(saved.threadId, null);
    assert.equal(saved.manifest.model.parseModel, "parse-fixture"); assert.equal(saved.manifest.aspect, "16:9");
    assert.equal(saved.manifest.references[0].sourceUrl, "https://example.invalid/reference.png");
    assert.equal(packages.readPackageFile(saved, "reference-1.png").content, image);
    assert.equal(remoteImages, 0); assert.ok(!JSON.stringify(saved.manifest).includes("apiKey"));
    function deferred() { let resolve; return { promise: new Promise((done) => { resolve = done; }), resolve: (value) => resolve(value) }; }
    const planInput = () => shown().querySelector('textarea[placeholder="Analyze the paper to draft a plan, then review and edit it."]');
    assert.ok(shown().textContent.includes("Add an API key and a paper-analysis model"));
    assert.equal([...shown().querySelectorAll("button")].find(node => node.textContent === "Generate draft").disabled, true);
    await input(shown().querySelector('input[type="password"]'), "fixture-only-not-a-real-key");
    generationGate = deferred();
    await click("Generate draft");
    await input(planInput(), "A newer plan while generation is pending");
    await React.act(async () => { generationGate.resolve({ svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200"><rect width="100" height="60"/><text>EARLIER_GENERATION</text></svg>' }); await generationGate.promise; await new Promise((resolve) => setTimeout(resolve, 0)); });
    assert.ok(shown().textContent.includes("This output was generated from earlier inputs."));
    assert.match(decodeURIComponent(shown().querySelector('img[alt="Generated figure preview"]').src), /EARLIER_GENERATION/);
    await click("Save figure to project");
    for (let i = 0; i < 30 && records.get(seed.id).manifest.plan !== "A newer plan while generation is pending"; i++) await React.act(async () => { await new Promise((resolve) => setTimeout(resolve, 1)); });
    assert.equal(records.get(seed.id).manifest.output, null);
    assert.ok(!records.get(seed.id).files.some((file) => file.role === "output"), "stale SVG and its derived scene are excluded from the current package");
    generationGate = deferred(); await click("Generate draft");
    await React.act(async () => { generationGate.resolve({ svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200"><rect width="100" height="60"/><text>CURRENT_GENERATION</text></svg>' }); await generationGate.promise; await new Promise((resolve) => setTimeout(resolve, 0)); });
    assert.ok(!shown().textContent.includes("This output was generated from earlier inputs."));
    await click("Save figure to project");
    for (let i = 0; i < 30 && !records.get(seed.id).manifest.output; i++) await React.act(async () => { await new Promise((resolve) => setTimeout(resolve, 1)); });
    assert.equal(records.get(seed.id).manifest.generatedFrom.plan, "A newer plan while generation is pending");
    assert.match(packages.readPackageFile(records.get(seed.id), "figure.svg").content, /CURRENT_GENERATION/);
    generationGate = deferred(); await click("Generate draft");
    await render("data-a:project-b", { ...owner, projectId: "project-b", workspaceId: "workspace-b" });
    await React.act(async () => { generationGate.resolve({ svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200"><rect width="100" height="60"/><text>A_GENERATED_WHILE_INACTIVE</text></svg>' }); await generationGate.promise; await new Promise((resolve) => setTimeout(resolve, 0)); });
    assert.ok(!shown().textContent.includes("A_GENERATED_WHILE_INACTIVE"));
    await render("data-a:project-a", owner);
    assert.match(decodeURIComponent(shown().querySelector('img[alt="Generated figure preview"]').src), /A_GENERATED_WHILE_INACTIVE/);
    assert.ok(!shown().textContent.includes("This output was generated from earlier inputs."), "A's valid completed generation is retained while temporarily inactive");
    // Delay the real package write, import a new paper, then release the old save.
    // Only the IPC timing is controlled; both saves use the production file module.
    saveGate = deferred(); const reached = new Promise((resolve) => { saveReached = resolve; });
    await click("Save figure to project"); await React.act(async () => { await reached; });
    const file = new File(["fixture"], "new-paper.pdf", { type: "application/pdf" }); Object.defineProperty(file, "arrayBuffer", { value: async () => new ArrayBuffer(0) });
    await React.act(async () => { const node = shown().querySelector('input[accept=".pdf,application/pdf"]'); Object.defineProperty(node, "files", { configurable: true, value: [file] }); node.dispatchEvent(new dom.window.Event("change", { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 0)); });
    await React.act(async () => { saveGate.resolve(); await saveGate.promise; await new Promise((resolve) => setTimeout(resolve, 0)); }); saveGate = null;
    assert.ok(!shown().textContent.includes("Figure snapshot saved to this project."), "late A acknowledgement does not mark the newly imported paper saved");
    await click("Save figure to project");
    for (let i = 0; i < 30 && records.size < 2; i++) await React.act(async () => { await new Promise((resolve) => setTimeout(resolve, 1)); });
    const imported = [...records.values()].find((record) => record.id !== seed.id);
    assert.ok(imported, "a new paper starts a distinct persisted result identity");
    assert.equal(imported.manifest.paper.sourceName, "new-paper.pdf"); assert.equal(imported.manifest.paper.pagesFile, "paper-pages.json");
    assert.match(packages.readPackageFile(imported, "paper-pages.json").content, /NEW_PDF_PAGE_CONTENT/);
    assert.equal(imported.manifest.output, null);
    assert.equal(records.get(seed.id).manifest.paper.sourceName, "local-paper.pdf"); assert.equal(records.get(seed.id).manifest.paper.pagesFile, undefined);

    await render("data-a:project-b", { ...owner, projectId: "project-b", workspaceId: "workspace-b" });
    assert.equal(shown().querySelector('textarea[placeholder="Optional: layout wishes, must-have modules, terms to use."]').value, "Unsaved B layout");
  } finally { await React.act(async () => root.unmount()); dom.window.close(); fs.rmSync(directory, { recursive: true, force: true }); URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; for (const [key, value] of Object.entries(previous)) value === undefined ? delete global[key] : global[key] = value; }
});
