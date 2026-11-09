const test = require('node:test');
const assert = require('node:assert/strict');
const { boundActiveContext } = require('./active-context.cjs');
function group(id, size) {
  return [
    { role: 'assistant', content: '', tool_calls: [{ id, type: 'function', function: { name: 'read_workspace_file', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: id, content: 'x'.repeat(size) },
  ];
}
test('bounds active tool history without leaving orphan tool messages', () => {
  const messages = [{ role: 'system', content: 'system' }, { role: 'user', content: 'question' }, ...group('one', 25000), ...group('two', 25000), ...group('three', 25000)];
  const result = boundActiveContext(messages, 32000);
  assert.equal(result.removed, 2);
  assert.deepEqual(messages.map(m => m.role), ['system', 'user', 'assistant', 'tool']);
  assert.equal(messages[2].tool_calls[0].id, messages[3].tool_call_id);
});
test('large latest result is explicitly truncated while preserving its call', () => {
  const messages = [{ role: 'user', content: 'question' }, ...group('one', 100000)];
  const result = boundActiveContext(messages, 32000);
  assert.equal(result.clipped, 1);
  assert.equal(JSON.parse(messages[2].content).truncated, true);
  assert.equal(messages[1].tool_calls[0].id, messages[2].tool_call_id);
});
test('removes the oldest complete group first', () => {
  const messages = [{ role: 'user', content: 'question' }, ...group('one', 15000), ...group('two', 15000), ...group('three', 15000)];
  const result = boundActiveContext(messages, 32000);
  assert.equal(result.removed, 1);
  assert.deepEqual(messages.filter(m => m.role === 'tool').map(m => m.tool_call_id), ['two', 'three']);
});
