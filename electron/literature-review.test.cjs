const test = require('node:test');
const assert = require('node:assert/strict');
const { generateLiteratureReview } = require('./literature-review.cjs');
const config = { baseUrl: 'https://example.test/v1', apiKey: 'test', model: 'test' };
const papers = [{ title: 'A paper', year: 2024, abstract: 'A relevant abstract.' }, { title: 'Another paper', year: 2023, abstract: 'A different abstract.' }];
function reply(value) { return async (_url, options) => { const payload = JSON.parse(options.body); assert.equal(payload.stream, false); return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(value) } }] }) }; }; }
test('review uses selected metadata, keeps valid citations, and discards unsupported paragraphs', async () => {
  const result = await generateLiteratureReview({ question: 'How do agents use memory?', papers }, { modelConfig: config, fetchImpl: reply({ sections: [{ title: 'Approaches', paragraphs: [{ text: 'Supported claim.', sources: [1, 2, 99, 1] }, { text: 'Unsupported claim.', sources: [99] }] }], limitations: 'Abstracts only.' }) });
  assert.deepEqual(result, { sections: [{ title: 'Approaches', paragraphs: [{ text: 'Supported claim.', sources: [1, 2] }] }], limitations: 'Abstracts only.' });
});
test('rejects missing abstracts and unlinked outputs', async () => {
  await assert.rejects(generateLiteratureReview({ question: 'How do agents use memory?', papers: [{ title: 'Paper', abstract: '' }] }, { modelConfig: config }), /no abstracts/);
  await assert.rejects(generateLiteratureReview({ question: 'How do agents use memory?', papers }, { modelConfig: config, fetchImpl: reply({ sections: [{ title: 'Bad', paragraphs: [{ text: 'Claim', sources: [9] }] }] }) }), /source-linked/);
});
