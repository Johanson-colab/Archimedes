const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
test('visual context contains only allowlisted theme values, never host secrets or bridge methods', async () => {
  const { transformWithOxc } = await import('vite');
  const source = fs.readFileSync(path.join(__dirname, '../src/research-app-context.ts'), 'utf8').replace(/^import .*;\n/gm, '').replace('export function', 'function');
  const { code } = await transformWithOxc(source, 'context.ts', {});
  const dom = new JSDOM('<body></body>');
  try {
    dom.window.document.documentElement.dataset.theme = 'paper';
    dom.window.document.documentElement.style.setProperty('--surface-ground', '#faf7f2');
    dom.window.document.documentElement.style.setProperty('--PRIVATE_TOKEN', 'synthetic-secret');
    const context = new Function('document', 'getComputedStyle', 'protocol', `${code}\nreturn researchAppContext('zh');`)(dom.window.document, dom.window.getComputedStyle.bind(dom.window), require('../shared/research-app-context.json'));
    assert.equal(context.theme, 'paper'); assert.equal(context.language, 'zh'); assert.equal(context.tokens['--surface-ground'], '#faf7f2');
    assert.doesNotMatch(JSON.stringify(context), /PRIVATE|synthetic-secret|researchDesk|workspace|apiKey/);
  } finally { dom.window.close(); }
});
