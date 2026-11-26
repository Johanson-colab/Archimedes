const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "src", "BrowserView.tsx"), "utf8");

test("the workbench browser removes every webview listener when it unmounts", () => {
  for (const event of ["dom-ready", "did-start-loading", "did-stop-loading", "did-navigate", "did-navigate-in-page", "page-title-updated", "did-fail-load"]) {
    assert.match(source, new RegExp(`view\\.addEventListener\\("${event}"`), `missing listener ${event}`);
    assert.match(source, new RegExp(`view\\.removeEventListener\\("${event}"`), `missing cleanup for ${event}`);
  }
  assert.match(source, /cleanupRef\.current\?\.\(\)/);
  assert.match(source, /view\.remove\(\)/);
});

test("webview error labels use the current language instead of the creation-time closure", () => {
  assert.match(source, /const translateRef = useRef\(t\)/);
  assert.match(source, /translateRef\.current = t/);
  assert.match(source, /const translate = translateRef\.current/);
  assert.doesNotMatch(source, /return t\("The site refused the connection\."\)/);
});
