const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
test('selected literature exports safely to JSON, CSV, BibTeX and RIS', async () => {
  const { transformWithOxc } = await import('vite');
  const source = fs.readFileSync(path.join(__dirname, '../src/literature-export.ts'), 'utf8').replace('export function exportLiteraturePapers', 'function exportLiteraturePapers');
  const { code } = await transformWithOxc(source, 'literature-export.ts');
  const exportPapers = new Function(`${code.replace(/^export \{\};?$/gm, '')}\nreturn exportLiteraturePapers;`)();
  const papers = [{ title: '=unsafe', authors: ['A, B'], year: 2024, venue: 'Venue', doi: '10.1/x', url: 'javascript:alert(1)', abstract: 'text' }];
  assert.match(exportPapers(papers, 'csv'), /"'=unsafe"/);
  assert.match(exportPapers(papers, 'bib'), /@article\{paper1/);
  assert.match(exportPapers(papers, 'ris'), /TI  - =unsafe/);
  assert.doesNotMatch(exportPapers(papers, 'bib'), /javascript:/);
  assert.equal(JSON.parse(exportPapers(papers, 'json'))[0].title, '=unsafe');
});
