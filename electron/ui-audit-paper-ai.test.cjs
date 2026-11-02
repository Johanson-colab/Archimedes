const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const library = fs.readFileSync(path.join(root, "src", "LibraryView.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");

test("paper AI drops the redundant panel title and keeps one compact mode switch", () => {
  assert.doesNotMatch(library, /<span className="eyebrow">Archimedes<\/span><h2>\{t\("Paper chat"\)\}<\/h2>/);
  assert.match(library, /<header className="paper-ai-header">/);
  assert.match(library, /className="paper-ai-mode-toggle"[\s\S]*?<Tab value="brief">\{t\("Briefing"\)\}<\/Tab>/);
  assert.match(css, /\.paper-ai-panel > \.paper-ai-header \{/);
});

test("paper AI messages use the main agent conversation structure", () => {
  assert.match(library, /className=\{`conversation-message paper-ai-message \$\{message\.role\}/);
  assert.match(library, /<div className="message-markdown paper-ai-code-markdown">/);
  assert.match(library, /className="paper-ai-conversation" ref=\{threadRef\}/);
  assert.match(library, /thread\.scrollTop = thread\.scrollHeight/);
  assert.match(css, /\.paper-ai-conversation \.conversation-message\.user \.conversation-message-copy/);
  assert.match(css, /\.paper-ai-conversation \.message-markdown \{ font-size: 13px; line-height: 1\.7; \}/);
});

test("paper AI uses the rounded agent composer with the send action in the footer", () => {
  assert.match(library, /className="conversation-composer paper-ai-composer"/);
  assert.match(library, /className="conversation-composer-footer paper-ai-composer-footer"/);
  assert.match(library, /className="conversation-send paper-ai-send"/);
  assert.match(library, /<ArrowUp size=\{16\} strokeWidth=\{2\.4\} \/>/);
  assert.match(css, /\.paper-ai-panel \.paper-ai-composer textarea \{[^}]*font-size: 13px/);
  assert.match(css, /@supports \(field-sizing: content\)[\s\S]*?\.paper-ai-panel \.paper-ai-composer textarea/);
});
