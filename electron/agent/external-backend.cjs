const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const codex = require('./codex-backend.cjs');
const { closeAllCodexClients } = require('./codex-client.cjs');
const { NativeProcess, closeAllExternalClients } = require('./native-process.cjs');
const { claudeLaunch, initializeClaude, claudePrompt, handleClaude } = require('./claude-backend.cjs');
const { opencodeLaunch, initializeOpenCode, openCodeModels, configureOpenCode, openCodePrompt, handleOpenCode } = require('./opencode-backend.cjs');
const active = new Map();
const clip = (value, max = 4000) => String(value ?? '').slice(0, max);
function canResumeExternal(binding, { backend, workspace, model, previousTurnId }) {
  return Boolean(binding?.backend === backend && binding.native_thread_id && binding.last_turn_id && binding.workspace === workspace && binding.model === (model || '') && binding.last_turn_id === previousTurnId);
}
function assertPolicy(config) {
  if (!['claude', 'opencode'].includes(config.backend)) throw new Error('Unsupported native backend.');
  if ((config.permissionMode || 'ask') !== 'ask') throw new Error(`${config.backend} does not support the requested permission mode. Use native approvals; this adapter does not provide a filesystem sandbox.`);
}
function boundedText(value, max) {
  if (typeof value === 'string') return value.slice(-max);
  if (!value) return '';
  // Tool outputs are visible content; embedded images/resources and metadata are omitted.
  if (Array.isArray(value)) return value.map(block => block?.type === 'text' ? block.text : block?.type === 'content' && block.content?.type === 'text' ? block.content.text : block?.type === 'diff' ? `File: ${clip(block.path)}\n${clip(block.newText, max)}` : '').join('\n').slice(-max);
  return '';
}
async function runExternal(options) {
  const { config, workspace, thread, turn, contextItems = [], bindings, emit = () => {}, recordEvent = () => {}, approve = async () => false, signal = new AbortController().signal, Client = NativeProcess, timeoutMs = 30 * 60_000 } = options;
  assertPolicy(config);
  const backend = config.backend, title = backend === 'claude' ? 'Claude Code' : 'OpenCode';
  const root = fs.realpathSync(workspace);
  const attachments = codex.nativeContext(contextItems);
  if (contextItems.filter(item => item.type === 'image').length > 4) throw new Error('Native turns support at most four image attachments. No request was sent.');
  const previousTurnId = (thread.turns || []).filter(t => t.id !== turn.id).at(-1)?.id || null;
  const binding = bindings.get();
  const resume = canResumeExternal(binding, { backend, workspace: root, model: config.model, previousTurnId });
  const prompt = codex.userPrompt(thread, turn, resume, attachments);
  const input = backend === 'claude' ? claudePrompt(prompt, contextItems) : openCodePrompt(prompt, contextItems);
  if (Buffer.byteLength(JSON.stringify(input)) > 8 * 1024 * 1024 - 1000) throw new Error('Native attachments exceed the protocol limit. No request was sent.');
  if (thread.id && active.has(thread.id)) throw new Error('This chat already has an active native turn.');
  const launch = backend === 'claude' ? claudeLaunch({ config, root, resume, binding }) : opencodeLaunch({ config, root });
  const client = new Client(launch);
  let response = '', streamed = false, settled = false, sent = false, resultStatus = 'failed';
  const approvals = new Map(), resolved = new Set(), items = new Map();
  const pendingActivities = new Set(), persistedActivities = new Set();
  let activityTimer;
  let resolveDone, rejectDone;
  const done = new Promise((resolve, reject) => { resolveDone = resolve; rejectDone = reject; }); done.catch(() => {});
  function finish(error) { if (settled) return; settled = true; if (error) rejectDone(error); else { resultStatus = 'completed'; resolveDone(); } }
  function append(delta) {
    if (settled || typeof delta !== 'string' || !delta) return;
    if (response.length + delta.length > 1_000_000) throw new Error(`${title} response exceeded the text limit.`);
    response += delta; streamed = true; emit({ type: 'assistant_delta', title, detail: 'Streaming native response', delta });
  }
  function activity(id, update) {
    if (!id || settled) return;
    if (!items.has(id) && items.size >= 512) throw new Error(`${title} exceeded the native activity limit.`);
    const old = items.get(id) || { id: randomUUID(), kind: clip(update.tool || 'tool', 120), title: `${title} · ${clip(update.tool || 'tool', 120)}`, status: 'running', detail: '' };
    const input = update.input || {};
    const item = { ...old, ...(update.title ? { title: `${title} · ${clip(update.title, 500)}` } : {}), ...(update.tool ? { kind: clip(update.tool, 120) } : {}), ...(update.status ? { status: ['completed', 'failed', 'interrupted'].includes(update.status) ? update.status : 'running' } : {}), detail: clip(input.command || input.file_path || input.path || update.title || old.detail), ...(update.output ? { output: boundedText(update.output, 32768) } : {}) };
    const first = !items.has(id), ended = old.status === 'running' && item.status !== 'running';
    items.set(id, item);
    if (first || ended) {
      pendingActivities.delete(id); sendActivity(item);
    } else {
      pendingActivities.add(id);
      if (!activityTimer) activityTimer = setTimeout(() => {
        try { flushActivities(); } catch (error) { finish(error); client.close(); }
      }, 80);
    }
  }
  function sendActivity(item) { emit({ type: 'native_activity', title: item.title, detail: item.detail || item.title, activity: item }); }
  function flushActivities() {
    clearTimeout(activityTimer); activityTimer = null;
    const ids = [...pendingActivities]; pendingActivities.clear();
    for (const id of ids) if (items.has(id)) sendActivity(items.get(id));
  }
  function completeActivities() {
    clearTimeout(activityTimer); activityTimer = null;
    for (const [id, item] of items) {
      const snapshot = item.status === 'running' ? { ...item, status: resultStatus } : item;
      items.set(id, snapshot);
      if (item.status === 'running' || pendingActivities.has(id)) { pendingActivities.delete(id); sendActivity(snapshot); }
      if (!persistedActivities.has(id)) { persistedActivities.add(id); recordEvent({ type: 'native_activity', payload: { activity: snapshot } }); }
    }
    pendingActivities.clear();
  }
  async function permission(id, request, respond) {
    if (settled || signal.aborted || resolved.has(id) || approvals.has(id)) return;
    if (resolved.size >= 512 || approvals.size >= 20) { respond(false); return; }
    const controller = new AbortController(); approvals.set(id, controller);
    try {
      if (!request.input || typeof request.input !== 'object' || Array.isArray(request.input)) { respond(false); return; }
      const display = JSON.stringify({ tool: request.tool, input: request.input, ...(request.content ? { previews: request.content } : {}) });
      if (display.length > 64000) { respond(false); return; }
      const cwd = request.input.cwd ? path.resolve(root, request.input.cwd) : root;
      if (cwd !== root && !cwd.startsWith(root + path.sep)) { respond(false); return; }
      // Only this concrete tool invocation can be authorized. Native permission
      // suggestions and permanent/session grants are never sent back.
      const allowed = await approve({ command: display, cwd, reason: `${title}: approve this native operation once`, nativeMethod: `${backend}/tool`, signal: controller.signal });
      if (!settled && !signal.aborted && !controller.signal.aborted && !client.closed) respond(Boolean(allowed));
    } catch (error) { if (!controller.signal.aborted && !settled && !client.closed) { try { respond(false); } catch {} } }
    finally { approvals.delete(id); resolved.add(id); }
  }
  const session = {
    backend, client, delivered: false, sessionId: launch.sessionId, append, activity, permission, finish,
    hasStream: () => streamed,
    cancelApproval: id => {
      if (resolved.size >= 512 && !resolved.has(id)) throw new Error(`${title} exceeded the native request limit.`);
      approvals.get(id)?.abort(); approvals.delete(id); resolved.add(id);
    },
    authoritative(text) { if (text.length > 1_000_000) throw new Error(`${title} response exceeded the text limit.`); if (text.startsWith(response)) append(text.slice(response.length)); else if (!response.endsWith(text)) append((response ? '\n\n' : '') + text); response = text; },
    usage(value) { const n = v => Number.isFinite(v) && v >= 0 ? v : 0; const usage = { inputTokens: n(value.inputTokens), cachedInputTokens: n(value.cachedInputTokens), outputTokens: n(value.outputTokens), totalTokens: n(value.inputTokens) + n(value.outputTokens), modelContextWindow: null }; emit({ type: 'native_usage', title: `${title} context`, detail: 'Native token usage; context capacity unavailable', usage }); recordEvent({ type: 'native_usage', payload: { usage } }); },
    plan(entries) { const plan = { explanation: '', steps: (entries || []).slice(0, 100).map(e => ({ step: clip(e.content), status: e.status === 'in_progress' ? 'inProgress' : e.status })) }; emit({ type: 'native_plan', title: `${title} plan`, detail: 'Native plan', plan }); recordEvent({ type: 'native_plan', payload: { plan } }); },
  };
  if (thread.id) active.set(thread.id, session);
  const onAbort = () => { resultStatus = 'interrupted'; finish(new Error(`${title} turn interrupted. Check partial changes before continuing. No request was replayed.`)); client.close(); };
  const timer = setTimeout(() => { finish(new Error(`${title} turn timed out. No request was replayed.`)); client.close(); }, timeoutMs);
  signal.addEventListener('abort', onAbort, { once: true });
  client.on('closed', error => finish(error || new Error(`${title} closed before completion.`)));
  client.on('message', message => {
    if (settled) return;
    try {
      const pending = backend === 'claude' ? handleClaude(message, session) : handleOpenCode(message, session);
      if (pending?.catch) pending.catch(error => { finish(error); client.close(); });
    } catch (error) { finish(error); client.close(); }
  });
  try {
    if (signal.aborted) throw new Error(`${title} turn interrupted.`);
    await client.start();
    if (backend === 'claude') {
      const initialized = await initializeClaude(client, config); session.sessionId = initialized.sessionId;
    } else {
      const capabilities = await initializeOpenCode(client);
      if (contextItems.some(item => item.type === 'image') && !capabilities.agentCapabilities?.promptCapabilities?.image) throw new Error('OpenCode does not advertise image capability. No request was sent.');
      if (resume && !capabilities.agentCapabilities?.loadSession) throw new Error('This OpenCode installation cannot resume native ACP sessions. No request was sent.');
      const created = await client.request(resume ? 'session/load' : 'session/new', { cwd: root, mcpServers: [], ...(resume ? { sessionId: binding.native_thread_id } : {}) });
      session.sessionId = resume ? binding.native_thread_id : created?.sessionId;
      if (resume && created?.sessionId && created.sessionId !== binding.native_thread_id) throw new Error('OpenCode returned a different native session.');
      if (!session.sessionId) throw new Error('OpenCode did not provide a native session.');
      await configureOpenCode(client, config, created, session.sessionId);
    }
    if (!session.sessionId || settled || signal.aborted) throw new Error(`${title} ended before starting. No request was sent.`);
    bindings.save({ backend, native_thread_id: session.sessionId, workspace: root, model: config.model || '', last_turn_id: null });
    emit({ type: 'status', title: `${title} backend`, detail: `${resume ? 'Resuming' : 'Starting'} native harness · native configured permissions and one-time approvals` });
    const reset = { type: 'native_usage', title: `${title} context`, detail: 'Context capacity unavailable', usage: null }; emit(reset); recordEvent({ type: 'native_usage', payload: { usage: null } });
    sent = true; session.delivered = true;
    if (backend === 'claude') client.send(input);
    else {
      const outcome = await client.request('session/prompt', { sessionId: session.sessionId, prompt: input }, timeoutMs);
      finish(outcome?.stopReason === 'end_turn' ? null : new Error(`OpenCode ended without a completed turn. No request was replayed.`));
    }
    await done;
    if (!response.trim()) throw new Error(`${title} completed without a visible text response. Check its recorded activity before continuing.`);
    completeActivities();
    bindings.save({ backend, native_thread_id: session.sessionId, workspace: root, model: config.model || '', last_turn_id: turn.id });
    return response.trim();
  } catch (error) {
    if (response) error.partialResponse = response;
    if (sent) error.message += ' Any partial changes were not rolled back.';
    throw error;
  } finally {
    settled = true; clearTimeout(timer); signal.removeEventListener('abort', onAbort);
    for (const controller of approvals.values()) controller.abort(); approvals.clear();
    try { completeActivities(); } finally {
      if (thread.id && active.get(thread.id) === session) active.delete(thread.id);
      client.close();
    }
  }
}
async function runNative(options) { return options.config.backend === 'codex' || !options.config.backend ? codex.runCodex(options) : runExternal(options); }
async function steerNative(threadId, text) {
  if (active.has(threadId)) throw new Error('Live steering is not supported by this native adapter. Interrupt the turn and send a new message.');
  return codex.steerNative(threadId, text);
}
async function answerNativeQuestion(threadId, questionId, answers) {
  if (active.has(threadId)) throw new Error('Native questions are not supported by this adapter. Use the native tool approval or interrupt the turn.');
  return codex.answerNativeQuestion(threadId, questionId, answers);
}
async function compactNative(options) {
  if (options.config.backend && options.config.backend !== 'codex') throw new Error('Explicit compaction is not supported by this native adapter. Native automatic compaction remains managed by its CLI.');
  return codex.compactNative(options);
}
function closeAllNativeClients() { closeAllExternalClients(); closeAllCodexClients(); }
async function checkNative(config, { Client = NativeProcess } = {}) {
  if (!['claude', 'opencode'].includes(config.backend)) throw new Error('Choose a supported native backend.');
  let client;
  try {
    assertPolicy(config);
    const launch = config.backend === 'claude' ? claudeLaunch({ config: { ...config, model: '', effort: '' }, root: os.tmpdir(), resume: false }) : opencodeLaunch({ config, root: os.tmpdir() });
    client = new Client(launch); await client.start();
    const initialized = config.backend === 'claude' ? await initializeClaude(client, {}) : await initializeOpenCode(client);
    return { ready: true, models: config.backend === 'claude' ? initialized.models : [], message: config.backend === 'claude' ? 'Claude control protocol is ready. Uses native login and configuration; no inference was requested.' : 'OpenCode ACP is ready. Uses native login and configuration. Models and effort are validated when a native session starts; no inference was requested.' };
  } catch (error) { return { ready: false, models: [], message: error.message }; }
  finally { client?.close(); }
}
module.exports = { runNative, steerNative, answerNativeQuestion, compactNative, closeAllNativeClients, checkNative, canResumeExternal };
