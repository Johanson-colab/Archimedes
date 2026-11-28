const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { stripTypeScriptTypes } = require("node:module");
const compiled = stripTypeScriptTypes(fs.readFileSync(path.join(__dirname, "../src/paper-writing-sources.ts"), "utf8"));
const { manuscriptSourcePaths } = new Function(compiled.replace(/export /g, "") + "\nreturn { manuscriptSourcePaths };")();

test("root-level manuscripts keep independent compile save sets", () => {
  const contents = new Map([
    ["a.tex", "\\documentclass{article}\n\\input{shared-a}"],
    ["b.tex", "\\documentclass{article}\n\\input{shared-b}"],
    ["shared-a.tex", "A"],
    ["shared-b.tex", "B"],
  ]);
  assert.deepEqual([...manuscriptSourcePaths("b.tex", contents)], ["b.tex", "shared-b.tex"]);
});

test("compile save sets follow transitive inputs outside the main folder", () => {
  const contents = new Map([
    ["paper/main.tex", "\\documentclass{article}\n\\input{../shared/section}\n\\bibliography{refs}"],
    ["shared/section.tex", "\\input{part}\n\\input{../common}"],
    ["shared/part.tex", "Part"],
    ["common.tex", "Common"],
    ["paper/refs.bib", "@misc{key, title={Title}}"],
    ["paper/unrelated.tex", "Unrelated"],
  ]);
  assert.deepEqual([...manuscriptSourcePaths("paper/main.tex", contents)], [
    "paper/main.tex", "shared/section.tex", "paper/refs.bib", "shared/part.tex", "common.tex",
  ]);
});

test("dependency parsing ignores comments, cycles and workspace escapes", () => {
  const contents = new Map([
    ["main.tex", "% \\input{ignored}\n\\input{section}\n\\input{../../outside}"],
    ["section.tex", "\\input{main}"],
  ]);
  assert.deepEqual([...manuscriptSourcePaths("main.tex", contents)], ["main.tex", "section.tex"]);
});
