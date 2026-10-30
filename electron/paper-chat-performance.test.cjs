const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("paper composer avoids per-keystroke layout measurement when browser supports content sizing", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "LibraryView.tsx"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "..", "src", "styles.css"), "utf8");
  assert.match(source, /CSS\.supports\("field-sizing", "content"\)\) return/);
  assert.match(css, /@supports \(field-sizing: content\) \{ \.paper-ai-compose textarea \{ field-sizing: content; overflow-y: auto/);
  assert.match(css, /\.paper-ai-thread article\.assistant:not\(\.streaming\) \{ content-visibility: auto; contain-intrinsic-size: auto 240px/);
  assert.match(source, /const askPaperSuggestion = useCallback\(\(prompt: string\) => \{ void askAIRef\.current\(prompt\); \}, \[\]\)/);
});
