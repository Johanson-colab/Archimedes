const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "../src/App.tsx"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "../src/styles.css"), "utf8");

function extractFunction(name) {
  const start = source.search(new RegExp(`^function ${name}\\(`, "m"));
  assert.ok(start >= 0, name);
  const end = source.indexOf("\n}", start);
  assert.ok(end > start, name);
  return source.slice(start, end + 2);
}

test("the model setup hint follows the conversation's effective harness", async () => {
  const { transformWithOxc } = await import("vite");
  const { code } = await transformWithOxc(
    [extractFunction("effectiveResearchHarness"), extractFunction("researchModelSetupNeeded")].join("\n"),
    "model-setup-hint.ts",
  );
  const { effectiveResearchHarness, researchModelSetupNeeded } = new Function(`${code}\nreturn { effectiveResearchHarness, researchModelSetupNeeded };`)();

  // A conversation's binding wins over the global backend, including an
  // explicit API binding while another global harness is selected.
  assert.equal(effectiveResearchHarness("codex", "api"), "codex");
  assert.equal(effectiveResearchHarness("claude", "codex"), "claude");
  assert.equal(effectiveResearchHarness("opencode", "api"), "opencode");
  assert.equal(effectiveResearchHarness(null, "codex"), "codex");
  assert.equal(effectiveResearchHarness(null, "api"), "api");
  assert.equal(effectiveResearchHarness(null, null), "api");

  assert.equal(researchModelSetupNeeded("api", { hasApiKey: false }), true);
  assert.equal(researchModelSetupNeeded("api", { hasApiKey: true }), false);
  assert.equal(researchModelSetupNeeded("api", null), false);
  for (const harness of ["codex", "claude", "opencode"]) {
    assert.equal(researchModelSetupNeeded(harness, { hasApiKey: false }), false, harness);
  }

  assert.match(source, /const selectedHarness = effectiveResearchHarness\(boundHarness, nativeBackend\?\.backend\);/);
  assert.match(source, /modelSetupHint=\{researchModelSetupNeeded\(selectedHarness, activeModelConfig\) \?/);
  assert.doesNotMatch(source, /modelSetupHint=\{\(!nativeBackend/);
});

test("research-app entry errors render as a dismissible alert overlay", async () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { transformWithOxc } = await import("vite");

  const inlineSource = fs.readFileSync(path.join(__dirname, "../src/InlineNotice.tsx"), "utf8")
    .replace(/^import[\s\S]*?from\s+"[^"]+";\r?\n/gm, "");
  const { code: inlineCode } = await transformWithOxc(inlineSource, "InlineNotice.tsx", { jsx: { runtime: "classic" } });
  const X = () => React.createElement("svg");
  const { InlineNotice } = new Function("React", "X", `${inlineCode.replace(/^export /gm, "")}\nreturn { InlineNotice };`)(React, X);

  const start = source.indexOf("function ResearchAppEntryNotice(");
  const end = source.indexOf("\nfunction App()", start);
  assert.ok(start >= 0 && end > start, "ResearchAppEntryNotice is available");
  const { code: componentCode } = await transformWithOxc(source.slice(start, end), "ResearchAppEntryNotice.tsx", { jsx: { runtime: "classic" } });
  const ResearchAppEntryNotice = new Function("React", "InlineNotice", `${componentCode}\nreturn ResearchAppEntryNotice;`)(React, InlineNotice);

  let dismissals = 0;
  const html = renderToStaticMarkup(React.createElement(ResearchAppEntryNotice, {
    message: "Could not open this Research App. Try again. save failed",
    dismissLabel: "Dismiss",
    onDismiss: () => { dismissals += 1; },
  }));
  assert.match(html, /class="ui-notice ui-notice-danger app-entry-notice"/);
  assert.match(html, /role="alert"/);
  assert.match(html, /aria-live="assertive"/);
  assert.match(html, /aria-label="Dismiss"/);
  assert.match(html, /Could not open this Research App\. Try again\. save failed/);
  assert.equal(dismissals, 0);

  const noticeLine = source.split("\n").find((line) => line.includes("ResearchAppEntryNotice message={appEntryError}"));
  assert.ok(noticeLine, "the main workspace renders the entry notice");
  assert.match(noticeLine, /onDismiss=\{\(\) => setAppEntryError\(""\)\}/);
  assert.doesNotMatch(noticeLine, /composer-attachment-error/);
});

test("the entry notice stays bounded, top-centered and scrollable above full-height views", () => {
  const match = /\.app-entry-notice\s*\{([^}]*)\}/.exec(styles);
  assert.ok(match, "app-entry-notice styles are defined");
  const rule = match[1];
  assert.match(rule, /position: absolute;/);
  assert.match(rule, /top: 16px;/);
  assert.match(rule, /right: 0;/);
  assert.match(rule, /left: 0;/);
  assert.match(rule, /z-index: 40;/);
  assert.match(rule, /width: min\(560px, calc\(100% - 32px\)\);/);
  assert.match(rule, /max-height: min\(45vh, 320px\);/);
  assert.match(rule, /margin-inline: auto;/);
  assert.match(rule, /overflow-y: auto;/);
  assert.match(rule, /box-shadow: var\(--dialog-shadow-md\);/);
  assert.doesNotMatch(rule, /inset:\s*0/);
});
