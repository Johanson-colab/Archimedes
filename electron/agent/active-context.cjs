// Keep model protocol call/result groups intact when bounding a long active turn.
function boundActiveContext(messages, characterLimit) {
  const limit = Math.max(32_000, Number(characterLimit) || 500_000);
  const size = () => messages.reduce((total, message) => total + JSON.stringify(message).length, 0);
  let used = size(), removed = 0, clipped = 0;
  if (used <= limit) return { removed, clipped };
  const groups = [];
  for (let i = 0; i < messages.length; i += 1) {
    const calls = messages[i]?.role === 'assistant' && messages[i].tool_calls;
    if (!Array.isArray(calls) || !calls.length) continue;
    const results = messages.slice(i + 1, i + 1 + calls.length);
    if (results.length !== calls.length || results.some((m, index) => m.role !== 'tool' || m.tool_call_id !== calls[index].id)) continue;
    groups.push({ start: i, count: calls.length + 1 });
    i += calls.length;
  }
  // Keep the most recent group so the model can respond to its last tool results.
  let offset = 0;
  for (let i = 0; i < groups.length - 1 && used > limit; i += 1) {
    const group = groups[i];
    const discarded = messages.splice(group.start - offset, group.count);
    offset += group.count;
    used -= discarded.reduce((total, message) => total + JSON.stringify(message).length, 0);
    removed++;
  }
  // An exceptionally large latest result may itself exceed the budget. Keep a
  // protocol-compatible result with an explicit omission marker, never a false result.
  if (used > limit) {
    for (const message of messages) {
      if (message.role !== 'tool' || typeof message.content !== 'string' || message.content.length <= 8000) continue;
      const previous = JSON.stringify(message).length;
      message.content = JSON.stringify({ truncated: true, preview: message.content.slice(0, 8000), note: 'Result exceeded the context budget. Re-read a narrower range when needed.' });
      used -= previous - JSON.stringify(message).length;
      clipped++;
      if (used <= limit) break;
    }
  }
  return { removed, clipped };
}
module.exports = { boundActiveContext };
