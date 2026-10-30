const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const library = fs.readFileSync(path.join(root, "src", "LibraryView.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");

test("reader back, tabs, and actions share one compact bar", () => {
  assert.doesNotMatch(library, /paper-workbench-header paper-reader-header/);
  assert.doesNotMatch(library, /className="reader-title"/);
  assert.doesNotMatch(library, /reader-header-divider/);
  assert.match(library, /<header id="paper-reader-bar" className="paper-reader-bar" title=\{`\$\{library\.name\} · \$\{paper\.title\}`\} inert=\{!readerChromeOpen\}>/);
  assert.match(library, /<button className="reader-back-button"[^>]*aria-label=\{t\("Library"\)\}[^>]*><ChevronLeft size=\{15\} \/><\/button>/);
  assert.doesNotMatch(library, /<ChevronLeft size=\{15\} \/>\{t\("Library"\)\}/);
  assert.match(library, /<div className="paper-reader-tabs" role="tablist">/);
  assert.match(library, /<div className="reader-header-actions">/);
  assert.match(css, /\.paper-workbench-page \{ grid-template-rows: 44px minmax\(0, 1fr\); \}/);
  assert.match(css, /\.paper-reader-bar \.paper-reader-tabs button \{ height: 43px;/);
});

test("reader controls start open and can be toggled without hovering", () => {
  assert.match(library, /\[readerChromeOpen, setReaderChromeOpen\] = useState\(true\)/);
  assert.match(library, /className="paper-reader-chrome-toggle"/);
  assert.match(library, /aria-expanded=\{readerChromeOpen\} aria-controls="paper-reader-bar"/);
  assert.match(library, /setReaderChromeOpen\(\(open\) => !open\)/);
  assert.match(library, /className="paper-reader-toolbar" inert=\{!readerChromeOpen\}/);
  assert.doesNotMatch(library, /onPointerLeave=\{\(\) => setReaderChromeOpen\(false\)\}/);
  assert.match(css, /\.paper-workbench-page:not\(\.chrome-open\) \{ grid-template-rows: 0 minmax\(0, 1fr\); \}/);
  assert.match(css, /\.paper-workbench-page:not\(\.chrome-open\) \.original-paper-reader:has\(> \.paper-reader-toolbar\)/);
  assert.match(css, /\.theme-paper \.paper-reader-bar,[\s\S]*?\.theme-paper \.paper-reader-toolbar \{[\s\S]*?background: var\(--surface-canvas\)/);
});
