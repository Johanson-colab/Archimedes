const { randomUUID } = require('node:crypto');
const { skillReadActivity } = require('./research-skills.cjs');
const OUTPUT_LIMIT = 32768;
const TEXT_LIMIT = 1_000_000;
const ITEM_LIMIT = 512;
const clip = (value, limit = 4000) => String(value ?? '').slice(0, limit);
const tail = value => String(value ?? '').slice(-OUTPUT_LIMIT);

function createNativeEvents({ emit = () => {}, recordEvent = () => {}, onError = () => {} } = {}) {
  const items = new Map();
  const pending = new Set();
  const snapshots = new Map();
  let timer, finalStream = '', finished = false;
  function send(type, field, value, persist = false) {
    const title = value?.title || ({ native_usage: 'Codex context', native_plan: 'Codex plan', native_diff: 'Codex changes' }[type]) || 'Codex';
    const detail = value?.detail || title;
    emit({ type, title, detail, [field]: value });
    if (persist) recordEvent({ type, payload: { [field]: value } });
  }
  function flush() {
    clearTimeout(timer); timer = null;
    for (const key of pending) {
      const entry = items.get(key);
      if (entry?.activity) send('native_activity', 'activity', { ...entry.activity });
    }
    pending.clear();
    for (const snapshot of snapshots.values()) if (snapshot.dirty) {
      send(snapshot.type, snapshot.field, snapshot.value);
      snapshot.dirty = false;
    }
  }
  function schedule() {
    if (!timer && !finished) timer = setTimeout(() => {
      try { flush(); }
      catch (error) {
        // Timer callbacks have no awaiting caller to catch emitter/persistence
        // failures. Stop this stream and hand failure to the owning session.
        finished = true;
        pending.clear();
        clearTimeout(timer); timer = null;
        onError(error);
      }
    }, 80);
  }
  function entry(id) {
    if (!id) return null;
    if (!items.has(id)) {
      if (items.size >= ITEM_LIMIT) throw new Error('Codex exceeded the activity limit. No request was replayed.');
      items.set(id, { id: randomUUID(), type: '', phase: null, text: '', streamed: '', output: '' });
    }
    return items.get(id);
  }
  function stream(e) {
    if (e.phase !== 'final_answer') return;
    // Completed item text is authoritative; the final return value always uses it.
    if (e.text.startsWith(e.streamed)) {
      const delta = e.text.slice(e.streamed.length);
      if (delta) { emit({ type: 'assistant_delta', title: 'Codex', detail: 'Streaming final response', delta }); finalStream += delta; }
    }
    e.streamed = e.text;
  }
  function describe(item, e, completed) {
    const kind = item.type === 'agentMessage' ? (e.phase || 'commentary') : item.type;
    const title = item.type === 'mcpToolCall' ? `Codex · ${clip(item.server, 120)} / ${clip(item.tool, 120)}` : `Codex · ${kind}`;
    let detail = item.command || item.query || item.path || item.text || item.tool || kind;
    if (item.type === 'fileChange') detail = (item.changes || []).map(change => change.path).join('\n');
    if (item.type === 'mcpToolCall' && item.arguments) detail = JSON.stringify(item.arguments);
    const status = ['failed', 'declined'].includes(item.status) || item.error || (typeof item.exitCode === 'number' && item.exitCode !== 0) ? 'failed' : item.status === 'interrupted' ? 'interrupted' : completed ? 'completed' : 'running';
    let output = e.output;
    if (item.type === 'agentMessage') output = e.text;
    else if (typeof item.aggregatedOutput === 'string') output = item.aggregatedOutput;
    else if (item.type === 'mcpToolCall' && (item.result || item.error)) output = JSON.stringify(item.result || item.error);
    const skillRead = skillReadActivity({ tool: item.type, command: item.type === 'commandExecution' ? item.command : '', filePath: item.path });
    return { id: e.id, kind, title, ...(skillRead ? { ...skillRead, title: `Codex · ${skillRead.title}` } : {}), detail: clip(detail), status, ...(output ? { output: tail(output) } : {}) };
  }
  function snapshot(type, field, value) { snapshots.set(type, { type, field, value, dirty: true }); schedule(); }
  function handle(method, params) {
    if (method === 'item/started' || method === 'item/completed') {
      const item = params.item || {};
      // Reasoning (including summaries), injected hook prompts, and internal user
      // message items are private. Never serialize raw native item objects.
      if (!item.id || ['reasoning', 'hookPrompt', 'userMessage', 'functionCallOutput'].includes(item.type)) return;
      const e = entry(item.id);
      e.type = item.type;
      if (item.type === 'agentMessage') {
        if (item.phase) e.phase = item.phase;
        if (typeof item.text === 'string' && (method === 'item/completed' || item.text)) e.text = clip(item.text, TEXT_LIMIT);
        if (!e.phase || e.phase === 'final_answer') { stream(e); return; }
      }
      const completed = method === 'item/completed';
      e.activity = describe(item, e, completed);
      pending.delete(item.id);
      send('native_activity', 'activity', { ...e.activity }, true);
      return;
    }
    if (method === 'item/agentMessage/delta') {
      const e = entry(params.itemId);
      if (!e) return;
      e.type = 'agentMessage';
      if (e.text.length + String(params.delta || '').length > TEXT_LIMIT) throw new Error('Codex response exceeded the text limit.');
      e.text += clip(params.delta, TEXT_LIMIT);
      if (e.phase && e.phase !== 'final_answer') {
        e.activity = describe({ type: 'agentMessage', text: e.text }, e, false);
        pending.add(params.itemId); schedule();
      } else stream(e);
      return;
    }
    if (['item/commandExecution/outputDelta', 'item/fileChange/outputDelta', 'item/mcpToolCall/progress'].includes(method)) {
      const e = items.get(params.itemId);
      if (!e?.activity || e.activity.status !== 'running') return;
      e.output = tail(e.output + clip(params.delta ?? params.message, OUTPUT_LIMIT));
      e.activity = { ...e.activity, output: e.output };
      pending.add(params.itemId); schedule();
      return;
    }
    if (method === 'thread/tokenUsage/updated') {
      const last = params.tokenUsage?.last;
      if (!last) return;
      const number = value => Number.isFinite(value) && value >= 0 ? value : 0;
      snapshot('native_usage', 'usage', { inputTokens: number(last.inputTokens), cachedInputTokens: number(last.cachedInputTokens), outputTokens: number(last.outputTokens), totalTokens: number(last.totalTokens), modelContextWindow: Number.isFinite(params.tokenUsage.modelContextWindow) ? params.tokenUsage.modelContextWindow : null });
    }
    if (method === 'turn/plan/updated') snapshot('native_plan', 'plan', { explanation: clip(params.explanation), steps: (params.plan || []).slice(0, 100).map(s => ({ step: clip(s.step), status: clip(s.status, 40) })) });
    if (method === 'turn/diff/updated') snapshot('native_diff', 'diff', clip(params.diff, 128_000));
  }
  function response() {
    const messages = [...items.values()].filter(e => e.type === 'agentMessage');
    const finals = messages.filter(e => e.phase === 'final_answer');
    return (finals.length ? finals : messages.filter(e => !e.phase)).map(e => e.text).join('\n\n').trim();
  }
  function finish(status = 'completed') {
    if (finished) return;
    finished = true;
    for (const e of items.values()) {
      if (e.type === 'agentMessage' && !e.phase) { e.phase = 'final_answer'; stream(e); }
      if (e.activity?.status === 'running') {
        e.activity = { ...e.activity, status: status === 'completed' ? 'completed' : status };
        send('native_activity', 'activity', { ...e.activity }, true);
      }
    }
    flush();
    for (const s of snapshots.values()) recordEvent({ type: s.type, payload: { [s.field]: s.value } });
  }
  return { handle, response, finish, usage: () => snapshots.get('native_usage')?.value, dispose: () => { clearTimeout(timer); timer = null; } };
}
module.exports = { createNativeEvents, OUTPUT_LIMIT };
