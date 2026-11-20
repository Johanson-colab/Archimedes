// Keep model protocol call/result groups intact when bounding a long active turn.
function boundActiveContext(messages, characterLimit, { strict = false } = {}) {
  const limit = strict ? characterLimit : Math.max(32_000, Number(characterLimit) || 500_000);
  const messageSize = (message) => {
    if (!strict || !Array.isArray(message.content)) return JSON.stringify(message).length;
    // Image payload bytes are unrelated to the number of text characters.
    const content = message.content.map((part) => part.type === 'image_url' ? { type: part.type } : part);
    return JSON.stringify({ ...message, content }).length;
  };
  const size = () => messages.reduce((total, message) => total + messageSize(message), 0);
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
    used -= discarded.reduce((total, message) => total + messageSize(message), 0);
    removed++;
  }
  // An exceptionally large latest result may itself exceed the budget. Keep a
  // protocol-compatible result with an explicit omission marker, never a false result.
  if (used > limit) {
    for (const message of messages) {
      if (message.role !== 'tool' || typeof message.content !== 'string' || message.content.length <= (strict ? 0 : 8000)) continue;
      const previous = messageSize(message);
      const original = message.content;
      const preview = original.slice(0, strict ? Math.max(0, Math.min(8000, original.length - (used - limit) - 160)) : 8000);
      message.content = JSON.stringify({ truncated: true, preview, note: 'Result exceeded the context budget. Re-read a narrower range when needed.' });
      const reduction = previous - messageSize(message);
      if (reduction <= 0) {
        message.content = original;
        continue;
      }
      used -= reduction;
      clipped++;
      if (used <= limit) break;
    }
  }
  if (strict && used > limit) {
    // Discard older conversation turns as whole units, including any matching
    // tool results. Keep the latest user message and the system instructions.
    let start = messages.findIndex((message) => message.role === 'user');
    while (start >= 0 && used > limit) {
      const next = messages.findIndex((message, index) => index > start && message.role === 'user');
      if (next === -1) break;
      const discarded = messages.splice(start, next - start);
      used -= discarded.reduce((total, message) => total + messageSize(message), 0);
      removed++;
      start = messages.findIndex((message) => message.role === 'user');
    }
    if (used > limit) throw new Error("The active prompt exceeds this model profile's context budget. Shorten the prompt or increase the context window in Model settings.");
  }
  return { removed, clipped };
}
module.exports = { boundActiveContext };
