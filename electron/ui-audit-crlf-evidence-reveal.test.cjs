const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "../src/PaperWritingView.tsx"), "utf8");
const lineStartSource = /function lineStart\(content: string, line: number\) \{[\s\S]*?\n\}/.exec(source)?.[0].replace(/: string|: number/g, "");
assert.ok(lineStartSource, "lineStart helper should exist in the Writing view");
const lineStart = new Function(`${lineStartSource}\nreturn lineStart;`)();

const marker = "onOpenSource={(source) => {";
const begin = source.indexOf(marker) + marker.length;
const end = source.indexOf("\n      }}", begin);
assert.ok(begin > 0 && end > begin, "evidence source-open handler should exist");
const handler = new Function("source", "setEvidenceDialog", "file", "openFile", "requestAnimationFrame", "owner", "lineStart", "editorRef", "revealSearchMatch", "Promise", source.slice(begin, end));

test("evidence links reveal the same range in a CRLF source as in the LF textarea", async () => {
  const raw = "Intro\r\n\\section{Methods}\r\nValue is 71\\%.\r\n";
  const normalized = raw.replace(/\r\n?/g, "\n");
  const text = "71";
  const offset = normalized.indexOf(text);
  const line = normalized.slice(0, offset).split("\n").length;
  const column = offset - normalized.lastIndexOf("\n", offset - 1);
  const evidence = { sourcePath: "paper/main.tex", line, column, text };
  const observed = {};

  handler(evidence,
    () => {},
    { path: "other.tex" },
    async () => {},
    callback => callback(),
    { documents: new Map([["paper/main.tex", { draft: raw }]]) },
    lineStart,
    { current: { focus() {}, setSelectionRange(start, finish) { observed.selection = [start, finish]; } } },
    (start, finish, content) => { observed.reveal = [start, finish]; observed.content = content; },
    Promise);
  await new Promise(resolve => setImmediate(resolve));

  assert.deepEqual(observed.reveal, [offset, offset + text.length]);
  assert.equal(observed.content, normalized);
});
