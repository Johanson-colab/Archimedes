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
  await assert.rejects(searchLiterature({ question: 'agent memory', source: 'arxiv' }, { modelConfig: {}, searchSource: async () => [] }), /No matching papers/);
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

test('Chinese and English questions use English arXiv concepts without whole-sentence matching', async () => {
  for (const question of ['我想研究 Agent 能否自己设计、测试和改进执行框架，而不只是执行任务？', 'Can agents design test and improve their own execution frameworks?']) {
    const queries = [], prompts = [];
    const reply = mockModel([{ queries: ['large language model agent self improvement'] }, { queries: [] }, { results: [{ id: 0, score: 9, reason: 'Related method' }] }]);
    const result = await searchLiterature({ question, source: 'arxiv' }, {
      modelConfig,
      fetchImpl: async (url, init) => {
        if (url.startsWith('https://export.arxiv.org/')) {
          queries.push(new URL(url).searchParams.get('search_query'));
          return { ok: true, text: async () => '<feed><entry><id>https://arxiv.org/abs/2401.00001</id><title>Agent self improvement</title><summary>Agents design execution frameworks</summary><author><name>Researcher</name></author><published>2024-01-01T00:00:00Z</published></entry></feed>' };
        }
        prompts.push(JSON.parse(init.body));
        return reply(url, init);
      },
    });
    assert.equal(result.results.length, 1);
    assert.equal(result.question, question);
    assert.match(queries[0], /all:"large" AND all:"language"/);
    assert.doesNotMatch(queries[0], /all:"large language model agent self improvement"|\p{Script=Han}/u);
    assert.match(prompts[0].messages[0].content, /English academic keyword/);
    assert.equal(JSON.parse(prompts.at(-1).messages[1].content).question, question);
  }
});

test('Chinese-only plans are translated again and Chinese refinement never reaches the index', async () => {
  const queries = [];
  const result = await searchLiterature({ question: '研究智能体的长期记忆机制', source: 'arxiv' }, {
    modelConfig,
    fetchImpl: mockModel([{ queries: ['智能体 长期记忆'] }, { queries: ['agent long term memory'] }, { queries: ['长期记忆 检索'] }, { results: [{ id: 0, score: 8 }] }]),
    searchSource: async query => { queries.push(query); return [paper(1, 'Long term agent memory')]; },
  });
  assert.deepEqual(queries, ['agent long term memory']);
  assert.equal(result.results.length, 1);
});

test('translation failure reports the model problem before any Chinese source request', async () => {
  let calls = 0;
  await assert.rejects(searchLiterature({ question: '如何让智能体从失败经验中学习？', source: 'arxiv' }, { modelConfig: {}, searchSource: async () => { calls++; return []; } }), /Could not translate.*Settings → Models/);
  assert.equal(calls, 0);
});

test('English question fallback extracts concepts and broadens rather than sending a full sentence', async () => {
  const queries = [];
  const result = await searchLiterature({ question: 'How can agents design and improve their own execution frameworks?', source: 'arxiv' }, {
    modelConfig: {}, searchSource: async query => { queries.push(query); return query.split(' ').length <= 3 ? [paper(1, 'Agent framework design')] : []; },
  });
  assert.deepEqual(queries, ['agents design improve execution frameworks', 'agents design improve']);
  assert.equal(result.results.length, 1);
  assert.match(result.warnings.join(' '), /using keywords/);
});

test('empty results and failed source requests produce different errors without raw provider details', async () => {
  await assert.rejects(searchLiterature({ question: 'agent memory', source: 'arxiv' }, { modelConfig: {}, searchSource: async () => [] }), /No matching papers/);
  await assert.rejects(searchLiterature({ question: 'agent memory', source: 'arxiv' }, { modelConfig: {}, searchSource: async () => { throw Error('HTTP 429 secret-provider-detail'); } }), error => /source requests failed/.test(error.message) && !/secret-provider-detail/.test(error.message));
});
