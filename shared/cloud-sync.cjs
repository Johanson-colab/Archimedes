// A turn ID is one execution, not an editable document. Revision 1 is active;
// revision 2 is final (including partial/incomplete). A retry uses a new turn ID.
// Final records are immutable, so delayed active snapshots cannot undo delivery.
const TERMINAL_TURN_STATUSES = new Set(['completed', 'failed', 'incomplete', 'interrupted', 'needs_configuration', 'cancelled']);

function turnRevision(turn) {
  return TERMINAL_TURN_STATUSES.has(turn?.status) ? 2 : 1;
}

function mergeTurn(current, incoming) {
  if (!current) return { ...incoming, sync_revision: turnRevision(incoming) };
  if (current.id !== incoming.id || (current.thread_id && incoming.thread_id && current.thread_id !== incoming.thread_id)) {
    throw new Error('A synced turn cannot move to another conversation.');
  }
  const previous = turnRevision(current), next = turnRevision(incoming);
  if (previous === 2 || next < previous) return current;
  if (next === previous) {
    const before = String(current.assistant_message || ''), after = String(incoming.assistant_message || '');
    if (!after.startsWith(before) || after.length <= before.length) return current;
  }
  return { ...incoming, thread_id: current.thread_id || incoming.thread_id,
    mode: current.mode, user_message: current.user_message, created_at: current.created_at,
    sync_revision: next };
}

function threadStatus(turns, fallback = 'idle') {
  if (turns.some(turn => turn.status === 'running')) return 'running';
  const latest = [...turns].sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || ''))).at(-1);
  if (!latest) return fallback;
  return ['failed', 'incomplete', 'needs_configuration'].includes(latest.status) ? 'error' : 'idle';
}

function mergeCloudThread(current, incoming) {
  if (current && current.id !== incoming.thread?.id) throw new Error('A synced conversation cannot change identity.');
  const local = new Map((current?.turns || []).map(turn => [turn.id, turn]));
  const turns = (incoming.turns || []).map(turn => mergeTurn(local.get(turn.id), turn));
  const all = new Map(local);
  for (const turn of turns) all.set(turn.id, turn);
  const keepMetadata = current && Date.parse(incoming.thread.updated_at || '') < Date.parse(current.updated_at || '');
  return { ...incoming, thread: { ...incoming.thread,
    ...(keepMetadata ? Object.fromEntries(['title', 'mode', 'context_summary', 'visibility', 'archived_at', 'updated_at'].map(key => [key, current[key]])) : {}),
    status: threadStatus([...all.values()], incoming.thread.status || 'idle') }, turns };
}

module.exports = { TERMINAL_TURN_STATUSES, turnRevision, mergeTurn, mergeCloudThread, threadStatus };
