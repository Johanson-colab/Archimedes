const { randomUUID } = require("node:crypto");
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
  `).all(...params).map((event, index) => presentEvent(event, ordinalOffset + index + 1));
}

function presentEvent(event, ordinal) {
  let payload;
  try { payload = JSON.parse(event.payload_json); } catch { payload = event.payload_json; }
  return { id: event.id, turn_id: event.turn_id, sequence: event.sequence, ordinal, type: event.type, payload, created_at: event.created_at };
}

// A cloud update can change an existing payload without inserting a row.
// After a rewrite, the next poll refreshes only the event list.
const generations = new WeakMap();
function invalidateEventCursor(db) { generations.set(db, randomUUID()); }
function generation(db) {
  if (!generations.has(db)) invalidateEventCursor(db);
  return generations.get(db);
}

function eventCursor(db, id, events) {
  const newest = events.length && db.prepare("SELECT id FROM research_events WHERE thread_id = ? ORDER BY rowid DESC LIMIT 1").get(id);
  return { generation: generation(db), newest: newest?.id || null, tail: events.at(-1)?.id || null, count: events.length };
}

function readEventChanges(db, id, cursor) {
  const reset = () => {
    const events = readThreadEvents(db, id);
    return { reset: true, events, cursor: eventCursor(db, id, events) };
  };
  if (!cursor || cursor.generation !== generation(db) || !Number.isSafeInteger(cursor.count) || cursor.count < 0) return reset();
  const anchor = cursor.newest && db.prepare("SELECT rowid FROM research_events WHERE thread_id = ? AND id = ?").get(id, cursor.newest);
  if (cursor.newest && !anchor) return reset();
  const rows = db.prepare(`
    SELECT e.rowid AS insertion, e.id, e.turn_id, e.sequence, e.type, e.payload_json, e.created_at,
           t.created_at AS turn_time, t.rowid AS turn_order
    FROM research_events e CROSS JOIN research_turns t ON t.id = e.turn_id
    WHERE e.rowid > ? AND e.thread_id = ?
    ORDER BY t.created_at, t.rowid, e.sequence
  `).all(anchor?.rowid || 0, id);
  if (!rows.length) return { reset: false, events: [], cursor };
  if (cursor.tail) {
    const first = rows[0];
    const follows = db.prepare(`
      SELECT 1 FROM research_events e JOIN research_turns t ON t.id = e.turn_id
      WHERE e.id = ? AND e.thread_id = ? AND (t.created_at, t.rowid, e.sequence) < (?, ?, ?)
    `).get(cursor.tail, id, first.turn_time, first.turn_order, first.sequence);
    if (!follows) return reset();
  }
  const events = rows.map((row, index) => presentEvent(row, cursor.count + index + 1));
  const newest = rows.reduce((latest, row) => latest.insertion > row.insertion ? latest : row);
  return { reset: false, events, cursor: { generation: cursor.generation, newest: newest.id, tail: events.at(-1).id, count: cursor.count + events.length } };
}

module.exports = { readThreadEvents, readThreadTurns, readEventChanges, eventCursor, invalidateEventCursor };
