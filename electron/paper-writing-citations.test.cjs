const assert = require("node:assert/strict");
const { test, before } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
let api;

before(async () => {
  const bibliographic = await import("../src/bibliography.ts");
  const { transformWithOxc } = await import("vite");
  const filename = path.join(__dirname, "../src/paper-writing-citations.ts");
  const source = fs.readFileSync(filename, "utf8").replace(/^import .*;\n/, "").replace(/^export /gm, "");
  const { code } = await transformWithOxc(source, filename);
  api = new Function(...Object.keys(bibliographic), code.replace(/^export \{\};?$/gm, "") + "\nreturn { manuscriptBibliographyPaths, prepareManuscriptCitation, insertCitationAt };")(...Object.values(bibliographic));
});

const paper = {
  id: "fixture", citekey: "doe2025", title: "Measured Models", authors: ["Jane Doe"],
  year: 2025, doi: "10.1000/measured", arxiv_id: "", url: "", venue: "Research Notes",
};

test("creates one new bibliography entry and one cite at the same cursor on a retry", () => {
  const comment = "% Keep this comment and its bytes\r\n";
  const saved = api.prepareManuscriptCitation(comment, paper);
  assert.ok(saved.content.startsWith(comment));
  assert.equal(saved.key, "doe2025");
  assert.deepEqual(api.prepareManuscriptCitation(saved.content, paper), saved);
  assert.equal(api.insertCitationAt(api.insertCitationAt("Before after", 7, saved.key), 7, saved.key), "Before \\cite{doe2025}after");
});

test("reuses a matching reference byte for byte and refuses occupied keys", () => {
  const current = "@article{local, title={Measured Models}, doi={10.1000/measured}, note={Hand-edited}}\n";
  assert.deepEqual(api.prepareManuscriptCitation(current, paper), { content: current, key: "local" });
  for (const input of [
    "@article{Doe2025, title={Different}, doi={10.1000/other}}",
    "@article{doe2025, title=unknown_macro}",
    "@article{doe2025, title={Measured Models}, author={Different}, year={2025}}",
    "@article{doe2025, title={Measured Models}, doi={10.1000/measured}}\n@article{doe2025, title={Different}}",
  ]) assert.throws(() => api.prepareManuscriptCitation(input, paper), /different bibliography entry/);
});

test("suggests only bibliography paths declared inside the manuscript folder", () => {
  const main = "% \\bibliography{unused}\n\\bibliography{references,../outside}\n\\addbibresource{more.bib}";
  assert.deepEqual(api.manuscriptBibliographyPaths(main, "paper/main.tex"), ["paper/references.bib", "paper/more.bib"]);
});
