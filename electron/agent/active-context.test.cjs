const test = require('node:test');
const assert = require('node:assert/strict');
const { boundActiveContext } = require('./active-context.cjs');
const { prepareConversation } = require('./context.cjs');
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
test('keeps the latest prompt and tool pair under a small profile budget', () => {
  const messages = [
    { role: 'system', content: 'instructions' },
    { role: 'user', content: 'earlier question' },
    { role: 'assistant', content: 'x'.repeat(24000) },
    { role: 'user', content: 'current question' },
    ...group('latest', 27000),
  ];
  const result = boundActiveContext(messages, 24000, { strict: true });
  assert.deepEqual(result, { removed: 1, clipped: 1 });
  assert.ok(messages.reduce((total, message) => total + JSON.stringify(message).length, 0) <= 24000);
  assert.deepEqual(messages.map(message => message.role), ['system', 'user', 'assistant', 'tool']);
  assert.equal(messages[1].content, 'current question');
  assert.equal(messages[2].tool_calls[0].id, messages[3].tool_call_id);
});

test('a small profile can reclaim continuity summary space for the next tool round', () => {
  const limit = 24_000;
  const turns = Array.from({ length: 20 }, (_, index) => ({
    id: 'prior-' + index,
    user_message: 'Earlier research question ' + index,
    assistant_message: 'x'.repeat(51_000),
  }));
  const { messages, continuitySummary } = prepareConversation({
    thread: { turns: [...turns, { id: 'current', user_message: 'Read the workspace results and continue.' }] },
    currentTurnId: 'current',
    contextCharacterLimit: limit,
    strictContextLimit: true,
  });
  const characters = () => messages.reduce((total, message) => total + JSON.stringify(message).length, 0);
  assert.ok(characters() >= limit - 1 && characters() <= limit);
  const initialSummary = continuitySummary.content;
  const results = group('workspace-result', 180);
  const toolResult = results[1].content;
  messages.push(...results);
  assert.ok(characters() > limit);

  const adjustment = boundActiveContext(messages, limit, { strict: true, continuitySummary });
  assert.deepEqual(adjustment, { removed: 0, clipped: 1 });
  assert.ok(characters() <= limit);
  assert.ok(initialSummary.length > continuitySummary.content.length);
  assert.match(continuitySummary.content, /Earlier research context/);
  assert.match(continuitySummary.content, /continuity context, not a source of evidence/);
  assert.match(messages.at(-3).content, /Read the workspace results/);
  assert.equal(messages.at(-1).content, toolResult);
  assert.equal(messages.at(-1).tool_call_id, messages.at(-2).tool_calls[0].id);
});
