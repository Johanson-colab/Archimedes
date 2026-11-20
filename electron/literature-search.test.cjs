const test = require('node:test');
const assert = require('node:assert/strict');
const { searchLiterature, fuseCandidates, normalizeRequest } = require('./literature-search.cjs');
const modelConfig = { baseUrl: 'https://model.example/v1', model: 'm', apiKey: 'synthetic' };
function mockModel(outputs) { let index = 0; return async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(outputs[index++]) } }] }) }); }
function paper(id, title) { return { external_id: `https://openalex.org/W${id}`, doi: `10.1/${id}`, arxiv_id: '', s2_id: '', title, authors: [], year: 2024, abstract: 'agent memory', source: 'openalex', citation_count: 0, url: '', pdf_url: '' }; }
test('one selected source, feedback-driven refinement, citation provenance and scoring', async () => {
  const requests = [], progress = [];
  const result = await searchLiterature({ question: 'agent memory research', source: 'openalex' }, {
    modelConfig, fetchImpl: mockModel([{ queries: ['first'] }, { queries: ['second'] }, { results: [{ id: 1, score: 9, reason: 'Relevant abstract.' }] }]),
    searchSource: async query => { requests.push(query); return query === 'first' ? [paper(1, 'First paper')] : [paper(2, 'Second paper')]; },
    expandCitations: async () => ({ lanes: [{ name: 'citations:W1', papers: [paper(3, 'Third paper')] }], edges: [{ from: 'https://openalex.org/W1', to: 'https://openalex.org/W3' }], warnings: [] }),
    onProgress: p => progress.push(p.stage),
  });
  assert.deepEqual(requests, ['first', 'second']); assert.equal(result.history.length, 2); assert.equal(result.totalCandidates, 3);
  assert.equal(result.edges.length, 1); assert.equal(result.results[0].score, 9); assert.equal(result.results.length, 3); assert.ok(result.warnings.some(x => /not be scored/.test(x))); assert.ok(progress.includes('refining')); assert.ok(progress.includes('citations'));
});
test('cross-source aliases merge without removing new evidence', () => {
  const first = paper(1, 'Same title'), other = { ...paper(2, 'Same title'), abstract: 'a longer abstract', doi: '10.2/other' };
  const rows = fuseCandidates('agent memory', [{ name: 'a', papers: [first] }, { name: 'b', papers: [other] }]);
  assert.equal(rows.length, 1); assert.equal(rows[0].paper.abstract, 'a longer abstract'); assert.deepEqual(rows[0].match, ['a', 'b']);
});
test('fails honestly on no sources, and allows local fallback if models fail', async () => {
  assert.throws(() => normalizeRequest({ question: 'valid question', source: 'unknown' }), /supported/);
  await assert.rejects(searchLiterature({ question: 'agent memory', source: 'arxiv' }, { modelConfig: {}, searchSource: async () => [] }), /No papers/);
  const result = await searchLiterature({ question: 'agent memory', source: 'arxiv' }, { modelConfig: {}, searchSource: async () => [paper(1, 'Agent memory')] });
  assert.equal(result.results[0].score, null); assert.ok(result.warnings.length);
});

test('OpenAlex citation expansion preserves observed edge directions', async () => {
  const { defaultCitationExpansion } = require('./literature-search.cjs');
  const reply = async url => ({ ok: true, json: async () => url.includes('/works/W1') ? { referenced_works: ['https://openalex.org/W2'] } : url.includes('cites:') ? { results: [{ id: 'https://openalex.org/W3', display_name: 'Citing paper' }] } : { results: [{ id: 'https://openalex.org/W2', display_name: 'Reference paper' }] } });
  const result = await defaultCitationExpansion([paper(1, 'Seed paper')], reply);
  assert.deepEqual(result.edges, [{ from: 'https://openalex.org/W3', to: 'https://openalex.org/W1' }, { from: 'https://openalex.org/W1', to: 'https://openalex.org/W2' }]);
  assert.equal(result.lanes[0].papers.length, 2);
});

test('cancellation stops the search before issuing further queries', async () => {
  const controller = new AbortController(); let calls = 0;
  await assert.rejects(searchLiterature({ question: 'agent memory', source: 'arxiv' }, { modelConfig: {}, signal: controller.signal, onProgress: event => { if (event.stage === 'searching') controller.abort(); }, searchSource: async () => { calls++; return [paper(1, 'Agent memory')]; } }), /cancelled/);
  assert.equal(calls, 0);
});
