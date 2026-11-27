const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("workspace naming leaves Enter and Escape to an active IME", async t => {
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
  const globals = {
    document: dom.window.document, window: dom.window, HTMLElement: dom.window.HTMLElement,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  Object.assign(globalThis, globals);
  t.after(() => {
    dom.window.close();
    for (const key of Object.keys(globals)) delete globalThis[key];
  });
  const React = require("react");
  const { createRoot } = require("react-dom/client");
  const { transformWithOxc } = await import("vite");
  const translate = key => key;
  const scope = { React, ...React, ...require("lucide-react"), createPortal: require("react-dom").createPortal, useUISettings: () => ({ t: translate }) };
  for (const [file, name] of [
    ["useDialogFocus.ts", "useDialogFocus"],
    ["DialogPortal.tsx", "DialogPortal"],
    ["Dialog.tsx", "Dialog"],
    ["WorkspaceDialog.tsx", "WorkspaceDialog"],
  ]) {
    const source = read(`src/${file}`).replace(/^import .*;\r?\n/gm, "").replace(/export (?:default )?(?=function)/g, "");
    const { code } = await transformWithOxc(source, file, { jsx: { runtime: "classic" } });
    scope[name] = new Function(...Object.keys(scope), `${code.replace(/^export \{\};?$/gm, "")}\nreturn ${name};`)(...Object.values(scope));
  }

  const root = createRoot(document.getElementById("root"));
  const submissions = [];
  let closes = 0;
  const fireKey = (target, key, isComposing, keyCode) => {
    const event = new dom.window.KeyboardEvent("keydown", { key, isComposing, keyCode, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  };

  try {
    await React.act(async () => root.render(React.createElement(scope.WorkspaceDialog, {
      open: true, mode: "create", initialKind: "sandbox",
      onSubmit: input => submissions.push(input), onClose: () => { closes += 1; },
    })));
    const input = document.querySelector(".workspace-name-dialog input");
    await React.act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(input, "论文");
      input.dispatchEvent(new dom.window.InputEvent("input", { bubbles: true }));
    });
    for (const key of ["Enter", "Escape"]) {
      assert.equal(fireKey(input, key, true, key === "Enter" ? 13 : 27), false, `${key} must remain available to the IME`);
      assert.equal(fireKey(input, key, false, 229), false, `${key} on a browser process key must remain available to the IME`);
    }
    assert.deepEqual(submissions, []);
    assert.equal(closes, 0);
    assert.equal(input.value, "论文");

    assert.equal(fireKey(input, "Enter", false, 13), true);
    assert.deepEqual(submissions, [{ name: "论文", kind: "sandbox" }]);
    const createButton = document.querySelector(".workspace-name-dialog .primary-button");
    assert.equal(fireKey(createButton, "Enter", false, 13), false, "ordinary button activation stays native");
    assert.equal(fireKey(input, "Escape", false, 27), true);
    assert.equal(closes, 1);
    document.querySelector(".dialog-ref-backdrop").dispatchEvent(new dom.window.MouseEvent("mousedown", { bubbles: true }));
    assert.equal(closes, 2, "intentional outside clicks still close the dialog");
  } finally {
    await React.act(async () => root.unmount());
  }
});

test("shared dialog hook implements escape, tab trapping, scroll lock and focus return", () => {
  const hook = read("src/useDialogFocus.ts");
  assert.match(hook, /event\.key === "Escape"/);
  assert.match(hook, /event\.key !== "Tab"/);
  assert.match(hook, /document\.body\.style\.overflow = "hidden"/);
  assert.match(hook, /previous\.focus\(\)/);
});

test("all modal surfaces use the shared dialog shell", () => {
  for (const file of [
    "src/App.tsx",
    "src/LibraryView.tsx",
    "src/ProjectSidebar.tsx",
    "src/PaperWritingView.tsx",
    "src/ImageCreationView.tsx",
    "src/ArtifactsPanel.tsx",
    "src/ExtensionsView.tsx",
  ]) {
    const source = read(file);
    assert.match(source, /<Dialog\b/, `${file} should use the shared Dialog shell`);
    assert.doesNotMatch(source, /role="dialog"/, `${file} should not recreate dialog semantics`);
  }
  const dialog = read("src/Dialog.tsx");
  assert.match(dialog, /DialogPortal/);
  assert.match(dialog, /useDialogFocus/);
  assert.match(dialog, /aria-modal/);
  assert.match(dialog, /app-dialog/);
});

test("welcome composer stays quiet while resizers keep explicit focus styling", () => {
  const css = read("src/styles.css");
  assert.doesNotMatch(css, /\.has-welcome \.conversation-composer:focus-within/);
  assert.match(css, /\.sidebar-resizer:focus-visible \{ outline: 2px solid/);
  assert.match(css, /\.paper-pane-resizer:focus-visible \{ outline: 2px solid/);
});

test("paper project dialog is dismissible before a project exists", () => {
  const paper = read("src/PaperWritingView.tsx");
  assert.match(paper, /<Dialog open=\{dialogOpen\} onClose=\{\(\) => setChooserOpen\(false\)\}/);
  assert.match(paper, /overlayClassName="paper-create-backdrop app-dialog-overlay"/);
  assert.doesNotMatch(paper, /activeProject && <button[^>]*aria-label="Close project chooser"/);
  assert.match(paper, /<button className="app-dialog-close" onClick=\{\(\) => setChooserOpen\(false\)\} aria-label="Close project chooser">/);
});
