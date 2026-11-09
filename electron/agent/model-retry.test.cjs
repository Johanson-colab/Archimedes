const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchModelWithRetry, retryDelay } = require('./model-retry.cjs');

test('retries transient responses and network errors before a stream is consumed', async t => {
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  let calls = 0, canceled = false;
  global.fetch = async () => {
    calls++;
    if (calls === 1) throw new TypeError('network');
    if (calls === 2) return { status: 429, headers: { get: () => '0' }, body: { cancel: async () => { canceled = true; } } };
    return { status: 200, ok: true };
  };
  const delays = [];
  const result = await fetchModelWithRetry('https://example.test', {}, { sleep: async ms => delays.push(ms) });
  assert.equal(result.ok, true);
  assert.equal(calls, 3);
  assert.equal(canceled, true);
  assert.deepEqual(delays, [250, 0]);
  assert.equal(retryDelay({ headers: { get: () => '600' } }, 0), 10000);
});

test('does not retry invalid requests or canceled requests', async t => {
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  let calls = 0;
  global.fetch = async () => { calls++; return { status: 401 }; };
  assert.equal((await fetchModelWithRetry('https://example.test', {})).status, 401);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(fetchModelWithRetry('https://example.test', { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(calls, 1);
});
