const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "src", "App.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");

test("composer keystrokes are isolated from long conversation history", () => {
  const historyStart = app.indexOf("const ConversationHistory = memo");
  const conversationStart = app.indexOf("function ConversationView", historyStart);
  assert.ok(historyStart >= 0 && conversationStart > historyStart, "expected a memoized conversation history boundary");

  const history = app.slice(historyStart, conversationStart);
  assert.match(history, /messages: Message\[\]/);
  assert.match(history, /<ChatActivityTimeline/);
  assert.doesNotMatch(history, /\bprompt\b|setPrompt/, "draft state must not enter the history render boundary");
  assert.match(history, /const tailStart = Math\.max\(0, messages\.length - INITIAL_VISIBLE_MESSAGE_COUNT\)/);
  assert.match(history, /historyExpandedRef\.current \? Math\.min\(current, tailStart\) : tailStart/);
  assert.match(history, /historyExpandedRef\.current = true/);

  assert.match(app.slice(conversationStart), /<ConversationHistory[\s\S]*?messages=\{messages\}/);
  assert.match(app.slice(conversationStart), /const \[prompt, setPrompt\] = useState\(""\)/);
});

test("offscreen chat messages can skip layout and paint work", () => {
  assert.match(css, /\.conversation-message\s*\{[^}]*content-visibility:\s*auto;/);
  assert.match(css, /\.conversation-message\s*\{[^}]*contain-intrinsic-size:\s*auto\s+240px;/);
});
