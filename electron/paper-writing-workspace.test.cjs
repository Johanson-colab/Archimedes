const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test, before, after } = require("node:test");
const { JSDOM } = require("jsdom");

let dom, React, createRoot, Writing;
const proactiveSignals = [];
before(async () => {
  dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost", pretendToBeVisual: true });
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  Object.assign(global, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node,
    IS_REACT_ACT_ENVIRONMENT: true, ResizeObserver: class { observe() {} disconnect() {} }, getComputedStyle: dom.window.getComputedStyle });
  React = require("react"); ({ createRoot } = require("react-dom/client"));
  const { transformWithOxc } = await import("vite");
  const helpers = await import("../src/paper-writing-state.ts");
  const search = await import("../src/paper-source-search.ts");
  const source = fs.readFileSync(path.join(__dirname, "../src/PaperWritingView.tsx"), "utf8");
  const icons = require("lucide-react");
  const names = source.match(/\{([^}]+)\} from "lucide-react"/)[1].split(",").map(name => name.trim());
  const scope = { React, ...React, ...helpers, ...search,
    ...Object.fromEntries(names.map(name => [name, icons[name]])),
    useUISettings: () => ({ t: value => value }),
    Dialog: props => props.open ? React.createElement(props.as || "div", { role: "dialog", onSubmit: props.onSubmit }, props.children) : null,
    StateView: props => React.createElement("div", null, props.title, props.description, props.action),
    PaperTemplateLibrary: () => null, paperTemplates: [{ id: "fake" }], SharedNoteEditor: () => null,
    fingerprintFor: (_source, value) => value, emitProactiveSignal: (signal) => proactiveSignals.push(signal),
  };
  const tabsSource = fs.readFileSync(path.join(__dirname, "../src/Tabs.tsx"), "utf8").replace(/^import .*;\r?\n/gm, "").replace(/export /g, "");
  const tabs = await transformWithOxc(tabsSource, "Tabs.tsx", { jsx: { runtime: "classic" } });
  Object.assign(scope, new Function(...Object.keys(scope), `${tabs.code}\nreturn { Tabs, Tab };`)(...Object.values(scope)));
  const text = source.replace(/^import[\s\S]*?from\s+"[^"]+";\r?\n/gm, "").replace(/^import "[^"]+";\r?\n/gm, "").replace("export default function", "function");
  const { code } = await transformWithOxc(text, "PaperWritingView.tsx", { jsx: { runtime: "classic" } });
  Writing = new Function(...Object.keys(scope), `${code.replace(/^export \{\};?$/gm, "")}\nreturn PaperWritingView;`)(...Object.values(scope));
});
after(() => {
  dom.window.close();
  for (const name of ["window", "document", "HTMLElement", "Node", "IS_REACT_ACT_ENVIRONMENT", "ResizeObserver", "getComputedStyle"]) delete global[name];
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const source = label => `\\documentclass{article}\n\\begin{document}\n${label}\n\\end{document}\n`;
async function fixture(t, overrides = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-writing-scope-"));
  const a = path.join(directory, "a"), b = path.join(directory, "b");
  for (const [root, label] of [[a, "Project A original"], [b, "Project B original"]]) {
    fs.mkdirSync(path.join(root, "paper"), { recursive: true });
    fs.writeFileSync(path.join(root, "paper/main.tex"), source(label));
  }
  const reads = [], writes = [], compiles = [];
  const preview = (root, name) => ({ name: path.basename(name), path: name, kind: "text", size: 100, modifiedAt: "now", content: fs.readFileSync(path.join(root, name), "utf8") });
  let progress;
  const bridge = {
    listLatexProjects: async root => overrides.listProjects ? overrides.listProjects(root) : require("./latex-workspace.cjs").listLatexProjects(root),
    listWorkspaceFiles: async (root, parent) => require("./workspace-files.cjs").listWorkspaceDirectory(root, parent),
    createLatexFile: async (root, name) => require("./latex-workspace.cjs").createLatexFile(root, name),
    createLatexDirectory: async (root, name) => require("./latex-workspace.cjs").createLatexDirectory(root, name),
    readWorkspaceFile: async (root, name) => { reads.push({ root, name }); return overrides.read ? overrides.read(root, name, preview) : preview(root, name); },
    writeWorkspaceFile: async (root, name, content) => {
      writes.push({ root, name, content });
      if (overrides.write) await overrides.write(root, name, content);
      fs.writeFileSync(path.join(root, name), content);
      return preview(root, name);
    },
    compileLatexDocument: async (root, name, requestId) => {
      compiles.push({ root, name, requestId });
      return overrides.compile ? overrides.compile(root, name, requestId) : { ok: true, diagnostics: [], log: "fake build", duration_ms: 1 };
    },
    onLatexCompileProgress: callback => { progress = callback; return () => { progress = undefined; }; },
  };
  let reactRoot = createRoot(document.getElementById("root"));
  const render = (workspace, token = 1, filePath = "paper/main.tex", active = true) => React.act(async () => reactRoot.render(React.createElement(Writing, {
    bridge, workspace, projectId: overrides.projectId || (workspace === a ? "a" : "b"), threadId: workspace === a ? "thread-a" : "thread-b", openRequest: token === null ? null : { path: filePath, token }, onRefresh() {}, onAskAI() {}, active,
  })));
  t.after(async () => { await React.act(async () => reactRoot.unmount()); fs.rmSync(directory, { recursive: true, force: true }); });
  return { a, b, render, restart: async workspace => { await React.act(async () => reactRoot.unmount()); reactRoot = createRoot(document.getElementById("root")); await render(workspace, null); }, reads, writes, compiles, disk: root => fs.readFileSync(path.join(root, "paper/main.tex"), "utf8"), progress: event => progress?.(event) };
}
async function autoCompileOff() {
  const checkbox = document.querySelector('.paper-auto-compile input');
  if (checkbox.checked) await React.act(async () => checkbox.click());
}
async function edit(content, filePath = "paper/main.tex") {
  const input = document.querySelector(`[aria-label="Edit ${filePath}"]`);
  assert.ok(input, "the real Writing textarea is open");
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value").set.call(input, content);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  assert.equal(input.value, content);
}
async function click(label) {
  const button = [...document.querySelectorAll("button")].find(node => node.title === label || node.getAttribute("aria-label") === label);
  assert.ok(button, label);
  await React.act(async () => button.click());
}
const settle = () => React.act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });

test("same-named papers keep their owner and autosave on departure without replaying an old open request", async t => {
  const f = await fixture(t);
  await f.render(f.b, 1); await autoCompileOff();
  const bDraft = source("B edited before changing workspace");
  await edit(bDraft);
  await f.render(f.a, 1); await settle();
  assert.equal(f.disk(f.a), source("Project A original"));
  assert.equal(f.disk(f.b), bDraft, "leaving Writing's root still saves to its original directory");
  assert.equal(f.reads.some(call => call.root === f.a), false, "the already consumed token must not open its path again in A");
  await f.render(f.a, 2);
  const aDraft = source("A independently edited");
  await edit(aDraft);
  await f.render(f.b, 2); await settle();
  assert.equal(document.querySelector('textarea').value, bDraft);
  assert.equal(f.disk(f.a), aDraft);
  assert.equal(f.disk(f.b), bDraft);
  await f.render(f.a, 2);
  assert.equal(document.querySelector('textarea').value, aDraft);
});

test("a delayed save preserves later keystrokes and drains the newest snapshot to its old root", async t => {
  const first = deferred(); let held = false;
  const f = await fixture(t, { write: async () => { if (!held) { held = true; await first.promise; } } });
  await f.render(f.a, 1); await autoCompileOff();
  const firstDraft = source("First submitted snapshot"), latest = source("Typed while the first write is pending");
  await edit(firstDraft);
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 800)); });
  assert.equal(f.writes.length, 1);
  await edit(latest);
  await f.render(f.b, 2);
  assert.equal(document.querySelector('textarea').value, source("Project B original"));
  await React.act(async () => first.resolve()); await settle();
  assert.equal(f.disk(f.a), latest);
  assert.equal(f.disk(f.b), source("Project B original"));
  assert.equal(f.writes.every(call => call.root === f.a), true);
  assert.equal(document.querySelector('.paper-save-state').textContent, "Saved");
  await f.render(f.a, 2);
  assert.equal(document.querySelector('textarea').value, latest);
  assert.equal(document.querySelector('.paper-save-state').textContent, "Saved");
});

test("late reads, compile progress and build results update only their owner scope", async t => {
  const readA = deferred(), compileA = deferred(), compileB = deferred(); let rootA;
  const f = await fixture(t, {
    read: async (root, name, preview) => { if (root === rootA) await readA.promise; return preview(root, name); },
    compile: root => root === rootA ? compileA.promise : compileB.promise,
  });
  rootA = f.a;
  await f.render(f.a, 1); await f.render(f.b, 2); await autoCompileOff();
  await React.act(async () => readA.resolve());
  assert.equal(document.querySelector('textarea').value, source("Project B original"));
  await f.render(f.a, 2); await click("Recompile");
  const aBuild = f.compiles.find(call => call.root === f.a);
  await f.render(f.b, 2); await click("Recompile");
  const bBuild = f.compiles.find(call => call.root === f.b);
  assert.ok(aBuild.requestId && bBuild.requestId && aBuild.requestId !== bBuild.requestId);
  await React.act(async () => {
    f.progress({ workspace: f.a, requestId: aBuild.requestId, path: "paper/main.tex", stage: "A compilation", log: "A private build log" });
    f.progress({ workspace: f.b, requestId: "obsolete-request", path: "paper/main.tex", stage: "Wrong compilation", log: "Wrong request log" });
    f.progress({ workspace: f.b, requestId: bBuild.requestId, path: "paper/main.tex", stage: "B compilation", log: "B build log" });
  });
  await click("Build log");
  assert.match(document.querySelector('.latex-live-log').textContent, /B build log/);
  assert.doesNotMatch(document.querySelector('.latex-live-log').textContent, /A private|Wrong request/);
  await React.act(async () => compileA.resolve({ ok: true, preview_url: "https://example.invalid/a.pdf", diagnostics: [], log: "A result", duration_ms: 1 }));
  assert.equal(document.querySelector('iframe'), null);
  await React.act(async () => compileB.resolve({ ok: true, preview_url: "https://example.invalid/b.pdf", diagnostics: [], log: "B result", duration_ms: 1 }));
  assert.match(document.querySelector('iframe').src, /\/b\.pdf$/);
  await f.render(f.a, 2);
  assert.equal(document.querySelector('textarea').value, source("Project A original"));
  assert.match(document.querySelector('iframe').src, /\/a\.pdf$/);
});

test("a late LaTeX failure stays in its source project instead of suggesting a fix in another project", async t => {
  const compileA = deferred();
  const failure = { ok: false, diagnostics: [{ line: 3, message: "Missing citation file" }], log: "citation file missing", duration_ms: 1 };
  const f = await fixture(t, { compile: root => root === f.a ? compileA.promise : failure });
  const signalsBefore = proactiveSignals.length;
  await f.render(f.a, 1); await autoCompileOff(); await click("Recompile");
  await f.render(f.b, 2);
  await React.act(async () => compileA.resolve(failure));
  assert.equal(proactiveSignals.length, signalsBefore);
  assert.equal(document.querySelector(".latex-diagnostics"), null);

  await click("Recompile");
  assert.equal(proactiveSignals.length, signalsBefore + 1);
  const { workspace, projectId, threadId } = proactiveSignals.at(-1);
  assert.deepEqual({ workspace, projectId, threadId }, { workspace: f.b, projectId: "b", threadId: "thread-b" });
  await f.render(f.a, null);
  assert.match(document.querySelector(".latex-diagnostics").textContent, /Missing citation file/);
});

test("failed departure autosaves keep the original draft and expose its save error on return", async t => {
  const f = await fixture(t, { write: async () => { throw new Error("Review disk is read-only"); } });
  await f.render(f.a, 1); await autoCompileOff();
  const pending = source("Draft retained after a failed write");
  await edit(pending); await f.render(f.b, 2); await settle();
  assert.equal(f.disk(f.a), source("Project A original"));
  await f.render(f.a, 2);
  assert.equal(document.querySelector('textarea').value, pending);
  assert.equal(document.querySelector('.paper-save-state').textContent, "Unsaved");
  assert.match(document.querySelector('.latex-diagnostics').textContent, /Review disk is read-only/);
});

test("switching source files during an in-flight save retains and saves the final edit to the old file", async t => {
  const first = deferred(); let held = false;
  const f = await fixture(t, { write: async () => { if (!held) { held = true; await first.promise; } } });
  fs.writeFileSync(path.join(f.a, "paper/section.tex"), "Section original");
  await f.render(f.a, 1); await autoCompileOff();
  await edit(source("First source snapshot"));
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 800)); });
  const latest = source("Final main edit while save is pending");
  await edit(latest);
  await f.render(f.a, 2, "paper/section.tex");
  assert.equal(document.querySelector('textarea').value, "Section original");
  await f.render(f.a, 3);
  assert.equal(document.querySelector('textarea').value, latest);
  assert.equal(document.querySelector('.paper-save-state').textContent, "Unsaved");
  await React.act(async () => first.resolve()); await settle();
  assert.equal(f.disk(f.a), latest);
  assert.equal(fs.readFileSync(path.join(f.a, "paper/section.tex"), "utf8"), "Section original");
  assert.equal(document.querySelector('.paper-save-state').textContent, "Saved");
});

test("the actual preload preserves compile ownership and rejects writing over newer source", async (t) => {
  const vm = require("node:vm");
  const handlers = new Map(), listeners = new Map(), compilerCalls = [];
  let api;
  const main = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
  const writeBegin = main.indexOf('  ipcMain.handle("workspace:write-file",');
  const writeEnd = main.indexOf('  ipcMain.handle("artifacts:list",', writeBegin);
  assert.ok(writeBegin >= 0 && writeEnd > writeBegin);
  const begin = main.indexOf('  ipcMain.handle("paper:compile",');
  const end = main.indexOf('  ipcMain.handle("research-thread:get",', begin);
  assert.ok(begin >= 0 && end > begin, "reassess the handler probe if its source boundaries change");
  const sender = { isDestroyed: () => false, send: (channel, payload) => listeners.get(channel)?.({}, payload) };
  vm.runInNewContext(main.slice(writeBegin, writeEnd) + main.slice(begin, end), {
    ipcMain: { handle: (name, callback) => handlers.set(name, callback) }, resolveWorkspace: root => root,
    workspaceFiles: require("./workspace-files.cjs"),
    managedPaperCompiler: async (root, name, progress) => { compilerCalls.push({ root, name }); progress("Compiling", "Fake compiler output"); return { ok: false, diagnostics: [], log: "fake" }; },
  });
  const ipcRenderer = {
    invoke: (name, input) => handlers.get(name)({ sender }, input),
    on: (name, callback) => listeners.set(name, callback), removeListener: name => listeners.delete(name),
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "preload.cjs"), "utf8"), {
    process: { platform: process.platform },
    require: name => { assert.equal(name, "electron"); return { contextBridge: { exposeInMainWorld: (_name, value) => { api = value; } }, ipcRenderer, webUtils: {} }; },
  });
  const progress = [];
  const unsubscribe = api.onLatexCompileProgress(value => progress.push(value));
  await api.compileLatexDocument("/review/a", "paper/main.tex", "request-a");
  await api.compileLatexDocument("/review/b", "paper/main.tex");
  assert.equal(progress[0].workspace, "/review/a"); assert.equal(progress[0].requestId, "request-a");
  assert.equal(progress[1].workspace, "/review/b"); assert.equal(progress[1].requestId, undefined);
  assert.deepEqual(compilerCalls, [{ root: "/review/a", name: "paper/main.tex" }, { root: "/review/b", name: "paper/main.tex" }]);
  unsubscribe(); assert.equal(listeners.size, 0);

  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-writing-conflict-"));
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  await api.writeWorkspaceFile(workspace, "paper/main.tex", "External editor version");
  assert.throws(
    () => api.writeWorkspaceFile(workspace, "paper/main.tex", "Unsaved draft", "Original version"),
    /The source changed on disk/,
  );
  assert.equal(fs.readFileSync(path.join(workspace, "paper/main.tex"), "utf8"), "External editor version");
  const saved = await api.writeWorkspaceFile(workspace, "paper/main.tex", "Merged draft", "External editor version");
  assert.equal(saved.content, "Merged draft");
});

test('Writing opens existing manuscripts before templates and restores the chosen document after remount', async t => {
  const f = await fixture(t);
  fs.writeFileSync(path.join(f.a, 'paper/alternate.tex'), source('Explicit alternate main'));
  fs.writeFileSync(path.join(f.a, 'paper/section.tex'), 'A section body\n');
  await f.render(f.a, null);
  assert.equal(document.querySelector('[role="tab"][aria-selected="true"]').textContent, 'Existing manuscripts');
  assert.equal(document.querySelector('.paper-template-library'), null);
  assert.equal(document.querySelector('.latex-editor-textarea'), null, 'multiple manuscripts do not cause a guessed auto-open');
  const open = [...document.querySelectorAll('.paper-existing-projects button')].find(button => button.querySelector('small')?.textContent === 'paper/alternate.tex');
  assert.ok(open);
  await React.act(async () => open.click());
  await autoCompileOff();
  assert.match(document.querySelector('.latex-editor-textarea').value, /Explicit alternate main/);
  const main = document.querySelector('.paper-main-document select');
  assert.equal(main.value, 'paper/alternate.tex');
  assert.ok([...main.options].some(option => option.value === 'paper/main.tex'));
  await React.act(async () => [...document.querySelectorAll('.paper-tree-row')].find(button => button.textContent.includes('section.tex')).click());
  assert.equal(document.querySelector('.latex-editor-textarea').value, 'A section body\n');
  await f.restart(f.a);
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.equal(document.querySelector('.latex-editor-textarea').value, 'A section body\n');
  assert.equal(document.querySelector('.paper-main-document select').value, 'paper/alternate.tex');
  assert.equal(f.compiles.length, 0, 'opening and restoring manuscripts does not need a compiler');
});

test("returning to Writing while the main document reopens restores the remembered source", async t => {
  const mainRead = deferred(), mainStarted = deferred();
  let restoring = false;
  const f = await fixture(t, { read: async (root, name, preview) => {
    if (restoring && name === "paper/main.tex") {
      mainStarted.resolve();
      await mainRead.promise;
    }
    return preview(root, name);
  } });
  fs.writeFileSync(path.join(f.a, "paper/remembered.tex"), "Remembered source");
  await f.render(f.a); await autoCompileOff();
  await click("paper/remembered.tex");

  restoring = true;
  await f.restart(f.a);
  await mainStarted.promise;
  await f.render(f.a, null, undefined, false);
  await f.render(f.a, null);
  await React.act(async () => mainRead.resolve());

  assert.equal(document.querySelector('.latex-editor-textarea').value, "Remembered source");
  assert.equal(document.querySelector('.paper-main-document select').value, "paper/main.tex");
  const { readWritingLocation } = await import("../src/paper-writing-state.ts");
  assert.equal(readWritingLocation(window.localStorage, f.a, "a").selectedPath, "paper/remembered.tex");
});

test("a tree selection wins over the remembered source while the main document is reopening", async t => {
  const mainRead = deferred(), mainStarted = deferred();
  let restoring = false;
  const f = await fixture(t, { read: async (root, name, preview) => {
    if (restoring && name === "paper/main.tex") {
      mainStarted.resolve();
      await mainRead.promise;
    }
    return preview(root, name);
  } });
  fs.writeFileSync(path.join(f.a, "paper/remembered.tex"), "Remembered source");
  fs.writeFileSync(path.join(f.a, "paper/newer.tex"), "Newly selected source");
  await f.render(f.a); await autoCompileOff();
  await click("paper/remembered.tex");

  restoring = true;
  await f.restart(f.a);
  await mainStarted.promise;
  await click("paper/newer.tex");
  await React.act(async () => mainRead.resolve());

  assert.equal(document.querySelector('.latex-editor-textarea').value, "Newly selected source");
  assert.equal(document.querySelector('.paper-main-document select').value, "paper/main.tex");
  assert.equal(f.reads.filter(({ name }) => name === "paper/remembered.tex").length, 1);
});

test("returning to Writing reloads the manuscript root and expanded source directories", async t => {
  const f = await fixture(t);
  const folder = path.join(f.a, "paper/sections/examples");
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(f.a, "paper/old.bib"), "Old bibliography");
  fs.writeFileSync(path.join(folder, "old.tex"), "Old example");
  await f.render(f.a); await autoCompileOff();
  await click("paper/sections");
  await click("paper/sections/examples");
  assert.ok(document.querySelector('[title="paper/sections/examples/old.tex"]'));
  await f.render(f.b, null);

  fs.renameSync(path.join(f.a, "paper/old.bib"), path.join(f.a, "paper/new.bib"));
  fs.renameSync(path.join(folder, "old.tex"), path.join(folder, "new.tex"));
  await f.render(f.a, null);
  assert.ok(document.querySelector('[title="paper/new.bib"]'));
  assert.ok(document.querySelector('[title="paper/sections/examples/new.tex"]'));
  assert.equal(document.querySelector('[title="paper/old.bib"]'), null);
  assert.equal(document.querySelector('[title="paper/sections/examples/old.tex"]'), null);
  assert.match(document.querySelector(".latex-editor-textarea").value, /Project A original/);
});

test("re-entering a scope does not replace its explicitly opening manuscript with a cached file", async t => {
  const started = deferred(), complete = deferred();
  const f = await fixture(t, { read: async (root, name, preview) => {
    if (name === "other/main.tex") {
      started.resolve();
      await complete.promise;
    }
    return preview(root, name);
  } });
  fs.mkdirSync(path.join(f.a, "other"));
  fs.writeFileSync(path.join(f.a, "other/main.tex"), source("Requested other manuscript"));
  await f.render(f.a); await autoCompileOff();
  await f.render(f.a, 2, "other/main.tex");
  await started.promise;
  await f.render(f.b, null);
  await f.render(f.a, 2, "other/main.tex");
  await React.act(async () => complete.resolve());
  assert.match(document.querySelector(".latex-editor-textarea").value, /Requested other manuscript/);
  assert.equal(document.querySelector(".paper-main-document select").value, "other/main.tex");
  assert.equal(f.reads.filter(({ name }) => name === "paper/main.tex").length, 1);
});

test('a main document at the execution root opens in place and a removed recent document returns to the chooser', async t => {
  const f = await fixture(t);
  fs.writeFileSync(path.join(f.a, 'root.tex'), source('Root manuscript'));
  await f.render(f.a, null);
  const open = [...document.querySelectorAll('.paper-existing-projects button')].find(button => button.querySelector('small')?.textContent === 'root.tex');
  await React.act(async () => open.click());
  assert.match(document.querySelector('.latex-editor-textarea').value, /Root manuscript/);
  assert.equal(document.querySelector('.paper-main-document select').value, 'root.tex');
  assert.equal(fs.readFileSync(path.join(f.a, 'root.tex'), 'utf8'), source('Root manuscript'));
  fs.unlinkSync(path.join(f.a, 'root.tex'));
  await f.restart(f.a);
  assert.ok(document.querySelector('[role="dialog"]'));
  assert.equal(document.querySelector('.latex-editor-textarea'), null);
  assert.ok([...document.querySelectorAll('.paper-existing-projects small')].some(node => node.textContent === 'paper/main.tex'));
});

test('compiling main waits for a pending save of another source file in the same manuscript', async t => {
  const gate = deferred();
  let diskAtCompile = '';
  const f = await fixture(t, {
    write: async (_root, name) => { if (name === 'paper/section.tex') await gate.promise; },
    compile: async (root, name) => { diskAtCompile = fs.readFileSync(path.join(root, 'paper/section.tex'), 'utf8'); return { ok: true, source_path: name, diagnostics: [], log: 'fixture compiler read actual files', duration_ms: 1 }; },
  });
  fs.writeFileSync(path.join(f.a, 'paper/section.tex'), 'Original section\n');
  await f.render(f.a); await autoCompileOff();
  const open = name => React.act(async () => [...document.querySelectorAll('.paper-tree-row')].find(button => button.textContent.includes(name)).click());
  await open('section.tex'); await edit('Latest section for compile\n', 'paper/section.tex'); await open('main.tex');
  await React.act(async () => [...document.querySelectorAll('button')].find(button => button.textContent === 'Recompile').click());
  const callsBeforeRelease = f.compiles.length;
  gate.resolve();
  await React.act(async () => { await gate.promise; await new Promise(resolve => setImmediate(resolve)); });
  assert.equal(callsBeforeRelease, 0, `compiler ran before section save; it read ${JSON.stringify(diskAtCompile)}`);
  assert.equal(f.compiles.length, 1);
  assert.equal(diskAtCompile, 'Latest section for compile\n');
});

test('typing during the compile save barrier retains the new edit and does not compile an older source set', async t => {
  const gate = deferred();
  const f = await fixture(t, { write: async (_root, name) => { if (name === 'paper/section.tex') await gate.promise; } });
  fs.writeFileSync(path.join(f.a, 'paper/section.tex'), 'Original section\n');
  await f.render(f.a); await autoCompileOff();
  const open = name => React.act(async () => [...document.querySelectorAll('.paper-tree-row')].find(button => button.textContent.includes(name)).click());
  await open('section.tex'); await edit('Pending section\n', 'paper/section.tex'); await open('main.tex');
  await React.act(async () => [...document.querySelectorAll('button')].find(button => button.textContent === 'Recompile').click());
  const latestMain = source('Main typed after compile was requested');
  await edit(latestMain);
  gate.resolve();
  await React.act(async () => { await gate.promise; await new Promise(resolve => setImmediate(resolve)); });
  assert.equal(f.compiles.length, 0);
  assert.equal(document.querySelector('.latex-editor-textarea').value, latestMain);
  assert.match(document.body.textContent, /sources changed while saving/);
  assert.equal(f.disk(f.a), source('Project A original'), 'the later main edit remains visibly unsaved instead of being represented as compiled');
});


test("projects sharing one execution folder restore their own manuscript selection", async t => {
  const options = { projectId: "project-a" }, f = await fixture(t, options);
  fs.mkdirSync(path.join(f.a, "other"));
  fs.writeFileSync(path.join(f.a, "other/main.tex"), source("Project B manuscript in the same folder"));
  const { rememberWritingLocation } = await import("../src/paper-writing-state.ts");
  rememberWritingLocation(window.localStorage, f.a, "project-a", { projectPath: "paper", mainPath: "paper/main.tex", selectedPath: "paper/main.tex" });
  rememberWritingLocation(window.localStorage, f.a, "project-b", { projectPath: "other", mainPath: "other/main.tex", selectedPath: "other/main.tex" });
  await f.render(f.a, null); await autoCompileOff();
  assert.equal(document.querySelector('.paper-main-document select').value, "paper/main.tex");
  await edit(source("A edit remains owned by the original file"));
  options.projectId = "project-b";
  await f.render(f.a, null); await settle();
  assert.equal(document.querySelector('.paper-main-document select').value, "other/main.tex");
  assert.equal(document.querySelector('.latex-editor-textarea').value, source("Project B manuscript in the same folder"));
  assert.equal(f.disk(f.a), source("A edit remains owned by the original file"));
  options.projectId = "project-a";
  await f.render(f.a, null);
  assert.equal(document.querySelector('.paper-main-document select').value, "paper/main.tex");
  assert.equal(document.querySelector('.latex-editor-textarea').value, source("A edit remains owned by the original file"));
});

for (const olderFirst of [true, false]) {
  const order = olderFirst ? "older read resolves first" : "newer read resolves first";
  for (const cached of [true, false]) {
    test(`shared ${cached ? "cached" : "uncached"} source keeps the latest read when the ${order}`, async t => {
      const pending = [];
      let hold = false;
      const options = {
        projectId: "project-a",
        read: async (root, name, preview) => {
          const snapshot = preview(root, name);
          if (hold) {
            const gate = deferred();
            pending.push(gate);
            await gate.promise;
          }
          return snapshot;
        },
        compile: async () => ({ ok: true, preview_url: "https://example.invalid/manuscript.pdf", diagnostics: [], log: "Saved preview" }),
      };
      const f = await fixture(t, options);
      const name = cached ? "paper/main.tex" : "paper/part.tex";
      const target = path.join(f.a, name);
      if (!cached) fs.writeFileSync(target, "Original section\n");
      if (cached) {
        await f.render(f.a, 1); await autoCompileOff();
        options.projectId = "project-b";
        await f.render(f.a, 2); await click("Recompile");
        options.projectId = "project-a";
        await f.render(f.a, null);
      }
      hold = true;
      if (cached) await click(name);
      else await f.render(f.a, 1, name);
      assert.equal(pending.length, 1);
      const fresh = cached ? source("Agent added a new result") : "Agent added a new section\n";
      fs.writeFileSync(target, fresh);
      options.projectId = "project-b";
      await f.render(f.a, cached ? null : 2, name);
      assert.equal(pending.length, 2);
      const current = () => document.querySelector(".latex-editor-textarea");
      if (cached) {
        assert.equal(current().readOnly, true);
        assert.match(document.querySelector("iframe").src, /manuscript\.pdf$/);
      }

      const resolve = index => React.act(async () => pending[index].resolve());
      await resolve(olderFirst ? 0 : 1);
      if (olderFirst && cached) assert.equal(current().readOnly, true);
      if (!olderFirst) assert.equal(current().value, fresh, "a newer read can commit before the obsolete request finishes");
      await resolve(olderFirst ? 1 : 0);
      assert.equal(current().readOnly, false);
      assert.equal(current().value, fresh);
      if (cached) assert.equal(document.querySelector("iframe"), null, "changed sources invalidate B's previous preview");
      options.projectId = "project-a";
      await f.render(f.a, null, undefined, false);
      assert.equal(current().value, fresh, "A also settles its selection on the shared latest document");

      // Continue from the fresh source and persist it through the normal departure save.
      hold = false;
      await f.render(f.a, null);
      const edited = fresh + "% User edit\n";
      await edit(edited, name);
      await f.render(f.b, null); await settle();
      assert.equal(fs.readFileSync(target, "utf8"), edited);
    });
  }
}

test("sharing a document keeps dirty text and retains the preview after an unchanged refresh", async t => {
  const saved = deferred();
  const options = {
    projectId: "project-a",
    write: async () => saved.promise,
    compile: async () => ({ ok: true, preview_url: "https://example.invalid/manuscript.pdf", diagnostics: [], log: "Saved preview" }),
  };
  const f = await fixture(t, options);
  await f.render(f.a, 1); await autoCompileOff();
  options.projectId = "project-b";
  await f.render(f.a, 2); await click("Recompile");
  options.projectId = "project-a";
  await f.render(f.a, null);
  options.projectId = "project-b";
  await f.render(f.a, null);
  assert.match(document.querySelector("iframe").src, /manuscript\.pdf$/);

  options.projectId = "project-a";
  await f.render(f.a, null);
  const draft = source("Edited in the shared draft");
  await edit(draft);
  const before = f.reads.length;
  options.projectId = "project-b";
  await f.render(f.a, null);
  assert.equal(f.reads.length, before, "a saved or pending disk read must not replace a local unsaved draft");
  assert.equal(document.querySelector(".latex-editor-textarea").value, draft);
  await React.act(async () => saved.resolve());
  assert.equal(f.disk(f.a), draft);
  assert.equal(document.querySelector(".latex-editor-textarea").value, draft);
});

test("returning to a clean cached manuscript reloads external edits before the next save", async t => {
  const f = await fixture(t);
  await f.render(f.a); await autoCompileOff();
  await f.render(f.b);
  const external = source("Added by an external editor while A was away");
  fs.writeFileSync(path.join(f.a, "paper/main.tex"), external);
  await f.render(f.a);
  assert.equal(document.querySelector('.latex-editor-textarea').value, external);
  const latest = external.replace("while A was away", "while A was away, then continued here");
  await edit(latest);
  await f.render(f.b);
  assert.equal(f.disk(f.a), latest);
});

test("a delayed clean tree selection commits the fresh source before allowing edits", async t => {
  const read = deferred();
  let waiting = false;
  const part = "paper/part.tex";
  const f = await fixture(t, { read: async (root, name, preview) => {
    if (waiting && name === part) await read.promise;
    return preview(root, name);
  } });
  const partFile = path.join(f.a, part);
  fs.writeFileSync(partFile, "Original section\n");
  await f.render(f.a); await autoCompileOff();
  await click(part);
  await click("paper/main.tex");
  fs.writeFileSync(partFile, "Agent updated the section\n");
  waiting = true;
  await click(part);
  const current = () => document.querySelector(".latex-editor-textarea");
  assert.equal(current().getAttribute("aria-label"), "Edit paper/main.tex");
  assert.equal(current().readOnly, true);
  assert.equal(document.querySelector(".paper-save-state").textContent, "Opening source…");
  await React.act(async () => read.resolve());
  assert.equal(current().readOnly, false);
  assert.equal(current().value, "Agent updated the section\n");
  await edit("Agent updated the section\nUser continued the edit\n", part);
  await click("paper/main.tex");
  assert.equal(fs.readFileSync(partFile, "utf8"), "Agent updated the section\nUser continued the edit\n");
});

test("a failed source read leaves the previous selection and a newer selection supersedes a slow read", async t => {
  let pending;
  const part = "paper/part.tex", second = "paper/second.tex";
  const f = await fixture(t, { read: async (root, name, preview) => {
    if (name === part && pending) await pending.promise;
    return preview(root, name);
  } });
  fs.writeFileSync(path.join(f.a, part), "Cached section\n");
  fs.writeFileSync(path.join(f.a, second), "Another section\n");
  await f.render(f.a); await autoCompileOff();
  await click(part);
  await click("paper/main.tex");
  pending = deferred();
  await click(part);
  await React.act(async () => pending.reject(new Error("The selected source could not be read.")));
  const current = () => document.querySelector(".latex-editor-textarea");
  assert.equal(current().getAttribute("aria-label"), "Edit paper/main.tex");
  assert.equal(current().readOnly, false);
  assert.match(document.querySelector(".latex-diagnostics").textContent, /selected source could not be read/);
  pending = deferred();
  await click(part);
  await click(second);
  assert.equal(current().readOnly, false);
  assert.equal(current().value, "Another section\n");
  await React.act(async () => pending.resolve());
  assert.equal(current().value, "Another section\n");
});

test("opening supporting sources preserves or resolves the actual manuscript compile target", async t => {
  const f = await fixture(t);
  fs.mkdirSync(path.join(f.a, "paper/sections"));
  fs.writeFileSync(path.join(f.a, "paper/sections/part.tex"), "A section body\n");
  fs.writeFileSync(path.join(f.a, "paper/references.bib"), "@book{manual,title={Reference}}\n");
  fs.writeFileSync(path.join(f.a, "paper/local.sty"), "\\ProvidesPackage{local}\n");
  await f.render(f.a, 1, "paper/references.bib"); await autoCompileOff();
  assert.equal(document.querySelector('.paper-main-document select').value, "paper/main.tex");
  for (const [index, name] of ["paper/sections/part.tex", "paper/local.sty"].entries()) {
    await f.render(f.a, index + 2, name);
    assert.ok(document.querySelector(`[aria-label="Edit ${name}"]`));
    assert.equal(document.querySelector('.paper-main-document select').value, "paper/main.tex");
    await click("Recompile"); await settle();
    assert.equal(f.compiles.at(-1).name, "paper/main.tex");
  }
});

test("a root-level manuscript can create files and folders through the Writing dialog", async t => {
  const f = await fixture(t);
  fs.writeFileSync(path.join(f.a, "root.tex"), source("Top-level manuscript"));
  await f.render(f.a, 1, "root.tex");
  await autoCompileOff();
  for (const [label, kind] of [["New LaTeX file", "file"], ["New folder", "directory"]]) {
    await click(label);
    const form = document.querySelector('form[role="dialog"]');
    const name = form.querySelector("input").value;
    await React.act(async () => form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
    const entry = fs.statSync(path.join(f.a, name));
    assert.equal(kind === "file" ? entry.isFile() : entry.isDirectory(), true);
  }
});

test("preview addresses stay with the execution folder that produced the manuscript", () => {
  const main = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
  const body = main.slice(main.indexOf("function setWindowWorkspace("), main.indexOf("function workspaceStatePath("));
  const tokens = new Map();
  const api = new Function("randomUUID", "windowWorkspaces", "windowPreviewTokens", "previewTokenWorkspaces", "windowApprovalClaims",
    body + "\nreturn {setWindowWorkspace, createPreviewToken};")(require("node:crypto").randomUUID, new Map(), new Map(), tokens, new Map());
  api.setWindowWorkspace(1, "/data");
  const first = api.createPreviewToken(1, "/project-a");
  const second = api.createPreviewToken(1, "/project-b");
  assert.notEqual(first, second);
  assert.equal(tokens.get(first), "/project-a");
  assert.equal(api.createPreviewToken(1, "/project-a"), first);
  assert.equal(tokens.get(second), "/project-b");
});
