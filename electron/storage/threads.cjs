const { presentStoredAssistantMessage } = require("../agent/model-response.cjs");

function readThreadTurns(db, id, checkpoint) {
  const after = checkpoint ? "AND (created_at, rowid) > (?, ?)" : "";
  const params = checkpoint ? [id, checkpoint.created_at, checkpoint.rowid] : [id];
  return db.prepare(`
    SELECT id, thread_id, task_id, mode, user_message, assistant_message, status, created_at, completed_at
    FROM research_turns WHERE thread_id = ? ${after} ORDER BY created_at ASC, rowid ASC
  `).all(...params).map((turn) => ({
    ...turn,
    assistant_message: presentStoredAssistantMessage(turn.assistant_message),
  }));
}

function readThreadEvents(db, id, checkpoint) {
  const after = checkpoint ? "AND (t.created_at, t.rowid) > (?, ?)" : "";
  const params = checkpoint ? [id, checkpoint.created_at, checkpoint.rowid] : [id];
  const ordinalOffset = checkpoint ? db.prepare(`
    SELECT COUNT(*) AS count FROM research_events e
    JOIN research_turns t ON t.id = e.turn_id
    WHERE e.thread_id = ? AND (t.created_at, t.rowid) <= (?, ?)
  `).get(...params).count : 0;
  return db.prepare(`
    SELECT e.id, e.turn_id, e.sequence, e.type, e.payload_json, e.created_at
    FROM research_events e
    JOIN research_turns t ON t.id = e.turn_id
    WHERE e.thread_id = ? ${after}
    ORDER BY t.created_at ASC, t.rowid ASC, e.sequence ASC
  `).all(...params).map((event, index) => {
    let payload;
    try {
      payload = JSON.parse(event.payload_json);
    } catch {
      payload = event.payload_json;
    }
    // Each turn starts its sequence at 1. Journey and seen markers need a
    // stable ordinal across the thread.
    return { id: event.id, turn_id: event.turn_id, sequence: event.sequence, ordinal: ordinalOffset + index + 1, type: event.type, payload, created_at: event.created_at };
  });
}

module.exports = { readThreadEvents, readThreadTurns };
