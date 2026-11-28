// Original Anthropic adapter with a no-network fake fetch and a real Web stream.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const repo = path.resolve(__dirname, '../../../..');

test('requireComplete rejects a clean transport EOF without a model completion event', async t => {
  const { completeAnthropic } = require(path.join(repo, 'electron/agent/anthropic.cjs'));
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  const frames = [
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Partial scientific conclusion' } },
  ];
  global.fetch = async () => new Response(new ReadableStream({ start(controller) {
    for (const frame of frames) controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(frame)}\n\n`));
    controller.close();
  } }), { headers: { 'content-type': 'text/event-stream' } });
  let result, error;
  try { result = await completeAnthropic({ baseUrl: 'https://provider.invalid', model: 'fake', apiKey: 'fake-review-key' }, [], { requireComplete: true }); }
  catch (caught) { error = caught; }
  console.log(JSON.stringify({ probe: 'model-clean-eof', requireComplete: true, rejected: Boolean(error), response: result?.content || '' }));
  assert.ok(error, 'missing model terminal event must preserve partial text as incomplete');
});
