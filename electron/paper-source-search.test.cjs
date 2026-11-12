const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { stripTypeScriptTypes } = require("node:module");
const compiled = stripTypeScriptTypes(fs.readFileSync(path.join(__dirname, "../src/paper-source-search.ts"), "utf8"));
const { findSourceMatches, sourceMarksByLine } = new Function(compiled.replace(/export /g, "") + "\nreturn { findSourceMatches, sourceMarksByLine };")();

test("search treats LaTeX commands and regex punctuation literally", () => {
  const source = "\\section{A.*} and \\section{A.*}";
  assert.deepEqual(findSourceMatches(source, "\\section{A.*}"), [{ start: 0, end: 13 }, { start: 18, end: 31 }]);
  assert.deepEqual(findSourceMatches(source, "[missing]"), []);
  assert.deepEqual(findSourceMatches(source, ""), []);
});

test("search ignores case and keeps original Unicode textarea offsets", () => {
  const source = "İ 😀论文 Paper PAPER paper";
  const matches = findSourceMatches(source, "paper");
  assert.equal(matches.length, 3);
  assert.deepEqual(matches.map(({ start, end }) => source.slice(start, end)), ["Paper", "PAPER", "paper"]);
  assert.equal(matches[0].start, 7);
  assert.deepEqual(findSourceMatches(source, "论文"), [{ start: 4, end: 6 }]);
  assert.deepEqual(findSourceMatches("aaaaa", "aa"), [{ start: 0, end: 2 }, { start: 2, end: 4 }]);
});

test("highlights keep line-relative offsets and one identity across lines", () => {
  const source = "one\n\n论文 paper\nlast paper";
  const matches = findSourceMatches(source, "paper");
  assert.deepEqual([...sourceMarksByLine(source, matches)], [
    [2, [{ start: 3, end: 8, index: 0 }]],
    [3, [{ start: 5, end: 10, index: 1 }]],
  ]);
  assert.deepEqual([...sourceMarksByLine("a\nb\na\nb", findSourceMatches("a\nb\na\nb", "a\nb"))], [
    [0, [{ start: 0, end: 1, index: 0 }]],
    [1, [{ start: 0, end: 1, index: 0 }]],
    [2, [{ start: 0, end: 1, index: 1 }]],
    [3, [{ start: 0, end: 1, index: 1 }]],
  ]);
});

test("newlines and trailing empty lines never add highlight text", () => {
  const source = "a\n\nb\n";
  assert.deepEqual([...sourceMarksByLine(source, findSourceMatches(source, "\n"))], []);
  assert.deepEqual([...sourceMarksByLine(source, [])], []);
  assert.deepEqual([...sourceMarksByLine(source, findSourceMatches(source, "\nb"))], [[2, [{ start: 0, end: 1, index: 0 }]]]);
});
