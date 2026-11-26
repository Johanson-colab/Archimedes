const { fitContinuitySummary } = require('./context.cjs');

const CONTEXT_BUDGET_FAILURE = 'MODEL_CONTEXT_BUDGET_EXCEEDED';
const CONTEXT_BUDGET_MESSAGE = "The active prompt exceeds this model profile's context budget. Shorten the prompt or increase the context window in Model settings.";

function toolPreview(content, length) {
  return JSON.stringify({ truncated: true, preview: content.slice(0, length), note: 'Result exceeded the context budget. Re-read a narrower range when needed.' });
}

// Keep model protocol call/result groups intact when bounding a long active turn.
function boundActiveContext(messages, characterLimit, { strict = false, continuitySummary, measure } = {}) {
  const limit = strict ? characterLimit : Math.max(32_000, Number(characterLimit) || 500_000);
  const messageSize = (message) => {
    if (!strict || !Array.isArray(message.content)) return JSON.stringify(message).length;
    // Image payload bytes are unrelated to the number of text characters.
    const content = message.content.map((part) => part.type === 'image_url' ? { type: part.type } : part);
    return JSON.stringify({ ...message, content }).length;
  };
  const size = () => measure ? measure(messages) : messages.reduce((total, message) => total + messageSize(message), 0);
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
    messages.splice(group.start - offset, group.count);
    offset += group.count;
    used = size();
    removed++;
  }
  if (strict && used > limit && continuitySummary) {
    const summaryIndex = messages.indexOf(continuitySummary);
    if (summaryIndex !== -1) {
      const previous = messageSize(continuitySummary);
      if (fitContinuitySummary(continuitySummary, previous - (used - limit))) {
        clipped++;
      } else {
        messages.splice(summaryIndex, 1);
        removed++;
      }
      used = size();
    }
  }

  // An exceptionally large latest result may itself exceed the budget. Keep a
  // protocol-compatible result with an explicit omission marker, never a false result.
  if (used > limit) {
    for (const message of messages) {
      if (message.role !== 'tool' || typeof message.content !== 'string' || message.content.length <= (strict ? 0 : 8000)) continue;
      const original = message.content;
      if (strict) {
        // Escapes in a structured result are encoded again inside the preview.
        // Find the longest prefix that fits when serialized for the request.
        message.content = toolPreview(original, 0);
        if (size() > limit) {
          // An empty marker can still reclaim space before another result or
          // an older conversation turn is removed.
          if (size() >= used) { message.content = original; continue; }
        } else {
          let low = 0;
          let high = Math.min(8000, original.length);
          while (low < high) {
            const middle = Math.ceil((low + high) / 2);
            message.content = toolPreview(original, middle);
            if (size() <= limit) low = middle;
            else high = middle - 1;
          }
          message.content = toolPreview(original, low);
        }
      } else {
        message.content = toolPreview(original, 8000);
        if (size() >= used) { message.content = original; continue; }
      }
      used = size();
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
      messages.splice(start, next - start);
      used = size();
      removed++;
      start = messages.findIndex((message) => message.role === 'user');
    }
    if (used > limit) throw Object.assign(new Error(CONTEXT_BUDGET_MESSAGE), { code: CONTEXT_BUDGET_FAILURE });
  }
  return { removed, clipped };
}
module.exports = { boundActiveContext, CONTEXT_BUDGET_FAILURE };
