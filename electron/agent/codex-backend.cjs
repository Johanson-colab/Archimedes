const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { CodexClient } = require('./codex-client.cjs');
const { createNativeEvents } = require('./codex-events.cjs');
const { validateNativeChoice } = require('./codex-models.cjs');
const { assertJsonSize, VISIBLE_IMPORT_LIMIT } = require('./codex-limits.cjs');
const { prepareResearchSkill, SKILL_NAME } = require('./research-skills.cjs');
const activeNativeRuns = new Map();

function nativeContext(items = []) {
  if (items.some(item => ['plugin', 'skill'].includes(item.type))) throw new Error('Native backend does not yet support Archimedes plugin/skill attachments. Remove them or select API harness.');
  return items.filter(item => item.type !== 'image').map(item => ({
    type: item.type, name: item.name, path: item.path, detail: item.detail, selection: item.selection,
    paper: item.paper ? { title: item.paper.title, abstract: item.paper.abstract, url: item.paper.url, pdf_url: item.paper.pdf_url } : undefined,
    repository: item.repository ? { url: item.repository.url, checkout: item.repository.checkout } : undefined,
  }));
}
function canResume(binding, { workspace, model, previousTurnId }) {
  return Boolean(binding?.native_thread_id && (!binding.backend || binding.backend === 'codex') && binding.last_turn_id && binding.workspace === workspace && binding.model === (model || '') && binding.last_turn_id === previousTurnId);
}
function nativePolicy(config, root) {
  const mode = config.permissionMode || 'ask';
  if (!['ask', 'auto-review', 'full-access', 'read-only', 'workspace-write'].includes(mode)) throw new Error('Unsupported Codex permission mode.');
  const fullAccess = mode === 'full-access';
  const sandbox = fullAccess ? 'danger-full-access' : mode === 'read-only' ? 'read-only' : 'workspace-write';
  const approvalPolicy = fullAccess ? 'never' : 'on-request';
  const approvalsReviewer = mode === 'auto-review' ? 'auto_review' : 'user';
  return { setup: { cwd: root, sandbox, approvalPolicy, approvalsReviewer, ...(config.model ? { model: config.model } : {}) },
    turn: { approvalPolicy, approvalsReviewer, sandboxPolicy: fullAccess ? { type: 'dangerFullAccess' } : sandbox === 'workspace-write'
      ? { type: 'workspaceWrite', writableRoots: [root], networkAccess: false, excludeSlashTmp: true, excludeTmpdirEnvVar: true }
      : { type: 'readOnly', networkAccess: false }, ...(config.effort ? { effort: config.effort } : {}) } };
}
// Retain a bounded display snapshot, never the full native patch object.
// An incomplete snapshot cannot authorize the original operation.
function approvalSnapshot(item) {
  let truncated = false, remaining = 64_000;
  const bounded = (value, limit) => {
    if (value === undefined || value === null) return value;
    const text = String(value);
    if (text.length > limit) truncated = true;
    return text.slice(0, limit);
  };
  const command = bounded(item.command, 64_000);
  const cwd = bounded(item.cwd, 4000);
  const changes = [];
  if (Array.isArray(item.changes)) {
    if (item.changes.length > 40) truncated = true;
    for (const change of item.changes.slice(0, 40)) {
      const snapshot = { path: bounded(change.path, 4000), kind: { type: bounded(change.kind?.type, 40), ...(change.kind?.move_path ? { move_path: bounded(change.kind.move_path, 4000) } : {}) }, diff: bounded(change.diff, Math.min(32768, Math.max(0, remaining))) };
      const size = JSON.stringify(snapshot).length;
      if (size > remaining) { truncated = true; break; }
      remaining -= size;
      changes.push(snapshot);
    }
  }
  return { command, cwd, changes, truncated };
}
function* visibleMessages(thread, turn) {
  for (const previous of thread.turns || []) {
    if (previous.id === turn.id) continue;
    if (previous.user_message) yield { role: 'user', content: previous.user_message };
    for (const event of previous.events || []) if (event.type === 'native_steer' && event.payload?.text) yield { role: 'user', content: event.payload.text };
    for (const event of thread.events || []) if (event.turn_id === previous.id && event.type === 'native_steer' && event.payload?.text) yield { role: 'user', content: event.payload.text };
    if (previous.assistant_message) yield { role: 'assistant', content: previous.assistant_message };
  }
}
function userPrompt(thread, turn, resume, attachments) {
  let prompt = String(turn.user_message ?? turn.prompt ?? '');
  const tooLarge = 'The visible history exceeds the native import limit. This chat was preserved; no history was summarized or replayed. Continue an existing native chat or start a smaller chat.';
  if (!resume) {
    // Preflight before allocating the all-history array or serialized history.
    // Never silently trim, summarize through the API, or partially import a chat.
    let remaining = VISIBLE_IMPORT_LIMIT - assertJsonSize(prompt, VISIBLE_IMPORT_LIMIT, tooLarge) - 256;
    for (const message of visibleMessages(thread, turn)) remaining -= assertJsonSize(message, remaining, tooLarge) + 1;
    if (attachments.length) remaining -= assertJsonSize(attachments, remaining, tooLarge);
    if (remaining < 0) throw new Error(tooLarge);
    const history = [...visibleMessages(thread, turn)];
    if (history.length) prompt = `Prior visible conversation (context only; completed actions must not be repeated):\n${JSON.stringify(history)}\n\nCurrent request:\n${prompt}`;
  } else if (attachments.length) {
    assertJsonSize(attachments, VISIBLE_IMPORT_LIMIT, 'The attached context exceeds the native request limit. No request was sent or replayed.');
  }
  if (attachments.length) prompt += `\n\nUser-attached context (metadata only):\n${JSON.stringify(attachments)}`;
  return prompt;
}
function activeRun(localThreadId) {
  const active = activeNativeRuns.get(localThreadId);
  if (!active || active.settled || !active.nativeTurnId || active.compaction) throw new Error('This chat has no active native Codex turn.');
  return active;
}
async function steerNative(localThreadId, text) {
  const active = activeRun(localThreadId);
  if (typeof text !== 'string' || !text.trim() || text.length > 100_000) throw new Error('Enter a steering message of at most 100,000 characters.');
  const expectedTurnId = active.nativeTurnId;
  await active.client.request('turn/steer', { threadId: active.nativeThreadId, expectedTurnId, input: [{ type: 'text', text }] });
  if (activeNativeRuns.get(localThreadId) !== active || active.settled || active.nativeTurnId !== expectedTurnId) throw new Error('The native turn ended before steering was acknowledged. No request was replayed.');
  active.recordEvent({ type: 'native_steer', payload: { text } });
  return { accepted: true };
}
async function answerNativeQuestion(localThreadId, questionId, answers) {
  const active = activeRun(localThreadId);
  const pending = active.questions.get(questionId);
  if (!pending || pending.nativeTurnId !== active.nativeTurnId) throw new Error('This native question is stale or no longer pending.');
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw new Error('Provide an answer for every question.');
  const answerEntries = [];
  const ids = pending.questions.map(q => q.id);
  if (Object.keys(answers).some(id => !ids.includes(id))) throw new Error('The answer contains an unknown question.');
  for (const id of ids) {
    const values = Object.hasOwn(answers, id) ? answers[id] : undefined;
    if (!Array.isArray(values) || !values.length || values.length > 20 || values.some(v => typeof v !== 'string' || !v.trim() || v.length > 20_000)) throw new Error('Provide a nonempty answer for every question. Empty answers do not cancel a native question.');
    answerEntries.push([id, { answers: values }]);
  }
  active.client.respond(pending.requestId, { answers: Object.fromEntries(answerEntries) });
  active.questions.delete(questionId);
  active.emit({ type: 'native_question_resolved', title: 'Codex question answered', detail: 'Your answer was sent to the active turn', questionId });
  return { answered: true };
}

async function nativeSession({ config, workspace, thread, turn, contextItems = [], researchSkill, nativeSkill, mineruToken, signal = new AbortController().signal, emit = () => {}, recordEvent = () => {}, approve = async () => false, bindings, Client = CodexClient, timeoutMs, compaction = false }) {
  const root = fs.realpathSync(workspace);
  const policy = nativePolicy(config, root);
  const attachments = nativeContext(contextItems);
  const previousTurnId = compaction ? thread.turns?.at(-1)?.id : (thread.turns || []).filter(item => item.id !== turn.id).at(-1)?.id || null;
  const binding = bindings.get();
  const resume = canResume(binding, { workspace: root, model: config.model, previousTurnId });
  if (compaction && !resume) throw new Error('Native compaction requires an identical completed Codex binding. Continue this chat successfully before compacting.');
  if (thread.id && activeNativeRuns.has(thread.id)) throw new Error('This chat already has an active native Codex operation.');
  const prompt = compaction ? null : userPrompt(thread, turn, resume, attachments);
  if (signal.aborted) throw new Error('Codex turn interrupted before skill setup.');
  if (nativeSkill && (nativeSkill !== 'paper-deep-reading' || researchSkill)) throw new Error('Unsupported native skill.');
  const skill = compaction ? null : nativeSkill === 'paper-deep-reading'
    ? { skillName: 'paper-deep-reading', skillFile: path.join(__dirname, '../assets/research-skills/paper-deep-reading/SKILL.md') }
    : prepareResearchSkill({ workspace: root, backend: 'codex', thread, requested: researchSkill, emit, recordEvent });
  const client = new Client({ binary: config.binary, ...(mineruToken ? { env: { MINERU_API_TOKEN: mineruToken } } : {}) });
  const events = createNativeEvents({ emit, recordEvent, onError: (error) => {
    try { finish(error); }
    finally { client.close(); }
  } });
  const items = new Map();
  const active = { client, emit, recordEvent, questions: new Map(), approvals: new Map(), resolvedRequests: new Set(), settled: false, compaction, nativeThreadId: null, nativeTurnId: null };
  if (thread.id) activeNativeRuns.set(thread.id, active);
  let accepted = false, compacted = false, serverQueue = Promise.resolve(), resultStatus = 'failed';
  let resolveDone, rejectDone;
  const done = new Promise((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
  done.catch(() => {});
  function finish(error) {
    if (active.settled) return;
    active.settled = true;
    if (error) rejectDone(error); else { resultStatus = 'completed'; resolveDone(); }
  }
  function onAbort() {
    resultStatus = 'interrupted';
    if (active.nativeTurnId && active.nativeThreadId) void client.request('turn/interrupt', { threadId: active.nativeThreadId, turnId: active.nativeTurnId }).catch(() => {});
    finish(new Error('Codex turn interrupted. Check any partial changes before continuing.'));
    client.close();
  }
  const timeout = setTimeout(() => { finish(new Error(`Codex ${compaction ? 'compaction' : 'turn'} timed out. No request was replayed.`)); client.close(); }, timeoutMs ?? (compaction ? 120_000 : 30 * 60_000));
  signal.addEventListener('abort', onAbort, { once: true });
  client.on('closed', error => finish(error || new Error('Codex connection closed before completion. No request was replayed.')));
  function deny(id, message) {
    emit({ type: 'status', title: 'Codex request denied', detail: message });
    client.respond(id, { decision: 'decline' });
  }
  async function serverRequest(message) {
    const { id, method, params = {} } = message;
    if (client.closed || active.resolvedRequests.has(id)) return;
    if (active.settled || signal.aborted || compaction) return client.unsupported(id);
    if (params.threadId !== active.nativeThreadId || !active.nativeTurnId || params.turnId !== active.nativeTurnId) return client.unsupported(id);
    if (method === 'item/tool/requestUserInput' && nativeSkill === 'paper-deep-reading') {
      emit({ type: 'status', title: 'Codex question unavailable', detail: 'Questions cannot be answered in this reading; continue with the supplied paper.' });
      return client.unsupported(id);
    }
    if (method === 'item/tool/requestUserInput') {
      if (!Array.isArray(params.questions) || !params.questions.length || params.questions.length > 10 || active.questions.size >= 20) return client.unsupported(id);
      if (params.questions.some(q => !q || typeof q.id !== 'string' || !q.id.trim() || q.id.length > 200)) return client.unsupported(id);
      const questions = params.questions.map(q => ({ id: q.id, header: String(q.header || '').slice(0, 200), question: String(q.question || '').slice(0, 20_000), ...(q.isSecret ? { isSecret: true } : {}), ...(Array.isArray(q.options) ? { options: q.options.slice(0, 30).map(o => ({ label: String(o.label || '').slice(0, 2000), description: String(o.description || '').slice(0, 4000) })) } : {}) }));
      if (questions.some(q => !q.id || !q.question) || new Set(questions.map(q => q.id)).size !== questions.length) return client.unsupported(id);
      const questionId = randomUUID();
      active.questions.set(questionId, { requestId: id, nativeTurnId: active.nativeTurnId, questions });
      emit({ type: 'native_question', title: 'Codex needs your input', detail: questions[0].question, question: { id: questionId, questions } });
      return;
    }
    if (!['item/commandExecution/requestApproval', 'item/fileChange/requestApproval'].includes(method)) {
      emit({ type: 'status', title: 'Unsupported Codex request', detail: `${method} was denied because this client cannot faithfully display and answer it.` });
      return client.unsupported(id);
    }
    const file = method === 'item/fileChange/requestApproval';
    const item = items.get(params.itemId) || {};
    if (item.truncated && (file || !params.command)) return deny(id, 'The native operation display was truncated, so incomplete changes cannot be approved.');
    if (params.kind && params.kind !== 'command') return deny(id, 'Terminal input approval is not supported.');
    // grantRoot broadens the filesystem grant; the current approval surface can
    // only approve a concrete operation, never a root/session/policy grant.
    if (params.grantRoot || params.additionalPermissions || params.environmentId) return deny(id, 'This permission grant cannot be represented as a one-time operation approval.');
    const cwd = path.resolve(params.cwd || item.cwd || root);
    if (cwd !== root && !cwd.startsWith(root + path.sep)) return deny(id, 'The requested working directory is outside this workspace.');
    let command = file ? `Codex file changes:\n${JSON.stringify(item.changes || [])}` : params.command || item.command;
    if (typeof command !== 'string' || !command || command.length > 100_000 || (file && !item.changes?.length)) return deny(id, 'Codex did not provide a bounded, concrete operation for approval.');
    if (params.networkApprovalContext) {
      const { host, protocol } = params.networkApprovalContext;
      if (typeof host !== 'string' || !host || host.length > 500 || !['http', 'https', 'socks5Tcp', 'socks5Udp'].includes(protocol)) return deny(id, 'This network approval cannot be displayed faithfully.');
      command += `\n\nNetwork access for this command only: ${protocol}://${host}`;
    }
    const expectedTurnId = active.nativeTurnId;
    const approvalController = new AbortController();
    active.approvals.set(id, approvalController);
    try {
      const decision = await approve({ command, cwd, reason: String(params.reason || '').slice(0, 4000), nativeMethod: method, signal: approvalController.signal });
      if (!active.settled && !signal.aborted && !approvalController.signal.aborted && active.nativeTurnId === expectedTurnId && !client.closed) client.respond(id, { decision: decision ? 'accept' : 'decline' });
    } catch (error) { if (!approvalController.signal.aborted) throw error; }
    finally { active.approvals.delete(id); }
  }
  client.on('message', message => {
    if (Object.hasOwn(message, 'id')) {
      serverQueue = serverQueue.then(() => serverRequest(message)).catch(() => { if (!client.closed) { try { client.unsupported(message.id); } catch { /* connection closed */ } } });
      return;
    }
    if (active.settled) return;
    const { method, params = {} } = message;
    if (params.threadId !== active.nativeThreadId) return;
    const eventTurnId = params.turnId || params.turn?.id;
    if (active.nativeTurnId && eventTurnId && eventTurnId !== active.nativeTurnId) return;
    if (method === 'serverRequest/resolved') {
      if (active.resolvedRequests.size < 512) active.resolvedRequests.add(params.requestId);
      active.approvals.get(params.requestId)?.abort();
      for (const [questionId, pending] of active.questions) if (pending.requestId === params.requestId) {
        active.questions.delete(questionId);
        emit({ type: 'native_question_resolved', title: 'Codex question resolved', detail: 'This native question is no longer pending', questionId });
      }
      return;
    }
    if (method === 'turn/started') active.nativeTurnId = params.turn?.id || active.nativeTurnId;
    try {
      if ((method === 'item/started' || method === 'item/completed') && params.item?.id) {
        const item = params.item;
        // Only the concrete data needed for an approval is retained here.
        if (['commandExecution', 'fileChange'].includes(item.type)) {
          if (items.size >= 512 && !items.has(item.id)) throw new Error('Codex exceeded the activity limit.');
          items.set(item.id, approvalSnapshot(item));
        }
        if (compaction && method === 'item/completed' && item.type === 'contextCompaction') compacted = true;
      }
      events.handle(method, params);
      if (compaction && method === 'thread/compacted') { compacted = true; if (!active.nativeTurnId) finish(); }
      if (method === 'turn/completed') {
        const status = params.turn?.status;
        finish(status === 'completed' && (!compaction || compacted) ? null : new Error(`Codex ${compaction ? 'compaction' : 'turn'} ${status === 'completed' ? 'did not confirm context compaction' : status || 'failed'}. No request was replayed.`));
      }
      if (method === 'error' && !params.willRetry) finish(new Error('Codex reported a turn error. Check login, model access and native configuration; the request was not replayed.'));
    } catch (error) { finish(error); client.close(); }
  });
  try {
    if (signal.aborted) throw new Error('Codex turn interrupted.');
    await client.start();
    const account = await client.request('account/read', { refreshToken: false });
    if (!account?.account) throw new Error('Codex is not signed in. Run codex login, then retry.');
    await validateNativeChoice(client, config, root);
    const result = await client.request(resume ? 'thread/resume' : 'thread/start', { ...policy.setup, ...(skill?.instructions ? { developerInstructions: skill.instructions } : {}), ...(resume ? { threadId: binding.native_thread_id } : {}) });
    active.nativeThreadId = result?.thread?.id;
    if (!active.nativeThreadId) throw new Error('Codex did not return a thread ID.');
    if (resume && active.nativeThreadId !== binding.native_thread_id) throw new Error('Codex returned a different native thread while resuming. No request was replayed.');
    if (active.settled || signal.aborted) throw new Error('Codex operation ended before it could start.');
    if (!resume) {
      const reset = { type: 'native_usage', title: 'Codex context', detail: 'Starting a new native context', usage: null };
      emit(reset); recordEvent({ type: 'native_usage', payload: { usage: null } });
    }
    // Dirty before either RPC: a lost acknowledgement may follow real execution
    // or compaction. Future turns must not silently resume uncertain history.
    bindings.save({ native_thread_id: active.nativeThreadId, workspace: root, model: config.model || '', last_turn_id: null });
    emit({ type: 'status', title: 'Codex backend', detail: `${compaction ? 'Compacting' : resume ? 'Resuming' : 'Starting'} Codex · ${config.permissionMode || 'ask'} · native approvals` });
    if (compaction) {
      await client.request('thread/compact/start', { threadId: active.nativeThreadId });
      accepted = true;
    } else {
      const input = [{ type: 'text', text: prompt }];
      if (skill) input.push({ type: 'skill', name: skill.skillName || SKILL_NAME, path: skill.skillFile });
      for (const attachment of contextItems.filter(item => item.type === 'image' && item.image?.dataUrl).slice(0, 4)) input.push({ type: 'image', url: attachment.image.dataUrl });
      const started = await client.request('turn/start', { threadId: active.nativeThreadId, input, ...policy.turn });
      accepted = true;
      active.nativeTurnId = started?.turn?.id || active.nativeTurnId;
      if (!active.nativeTurnId) throw new Error('Codex returned no turn ID; outcome is unknown.');
    }
    await done;
    // Persist final bounded snapshots before declaring continuity successful.
    events.finish(resultStatus);
    if (compaction) {
      bindings.save({ native_thread_id: active.nativeThreadId, workspace: root, model: config.model || '', last_turn_id: previousTurnId });
      recordEvent({ type: 'native_compacted', payload: { compacted: true } });
      return { compacted: true, usage: events.usage() || null };
    }
    const response = events.response();
    if (!response) throw new Error('Codex completed without a final text response. Inspect recorded activity before continuing.');
    bindings.save({ native_thread_id: active.nativeThreadId, workspace: root, model: config.model || '', last_turn_id: turn.id });
    return response;
  } catch (error) {
    if (events.response()) error.partialResponse = events.response();
    if (accepted && !compaction) error.message += ' Any partial changes were not rolled back.';
    throw error;
  } finally {
    active.settled = true;
    clearTimeout(timeout);
    signal.removeEventListener('abort', onAbort);
    try {
      for (const questionId of active.questions.keys()) emit({ type: 'native_question_resolved', title: 'Codex question expired', detail: 'The native turn ended', questionId });
      events.finish(resultStatus);
    } finally {
      active.questions.clear();
      for (const controller of active.approvals.values()) controller.abort();
      active.approvals.clear();
      active.resolvedRequests.clear();
      events.dispose();
      if (thread.id && activeNativeRuns.get(thread.id) === active) activeNativeRuns.delete(thread.id);
      client.close();
    }
  }
}
async function runCodex(options) { return nativeSession(options); }
async function compactNative(options) { return nativeSession({ ...options, compaction: true }); }
module.exports = { runCodex, canResume, nativeContext, userPrompt, steerNative, answerNativeQuestion, compactNative };
