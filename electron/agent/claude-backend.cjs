const { randomUUID } = require('node:crypto');
function claudeLaunch({ config, root, resume, binding }) {
  const sessionId = resume ? binding.native_thread_id : randomUUID();
  if (!/^[a-f0-9-]{36}$/i.test(sessionId)) throw new Error('Invalid Claude native session binding. No request was sent.');
  const args = ['--print', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--permission-mode', 'default', '--permission-prompt-tool', 'stdio'];
  args.push(resume ? `--resume=${sessionId}` : `--session-id=${sessionId}`);
  if (config.model) args.push('--model', config.model);
  if (config.effort) args.push('--effort', config.effort);
  return { backend: 'claude', binary: config.binary || 'claude', cwd: root, args, sessionId };
}
function claudeModels(initialized) {
  return (Array.isArray(initialized?.models) ? initialized.models : []).slice(0, 500).filter(m => typeof m.value === 'string').map(m => ({ id: m.value.slice(0, 300), label: String(m.displayName || m.value).slice(0, 300), efforts: (m.supportedEffortLevels || []).filter(x => typeof x === 'string').slice(0, 20) }));
}
async function initializeClaude(client, config) {
  const initialized = await client.request('initialize', { hooks: {} });
  if (!initialized || typeof initialized !== 'object') throw new Error('Claude control initialization returned no capabilities.');
  const models = claudeModels(initialized);
  if (config.model && !models.some(m => m.id === config.model)) throw new Error('Selected Claude model is not advertised by this native installation. Refresh models or use its default.');
  if (config.effort) {
    const model = models.find(m => m.id === (config.model || 'default'));
    if (!model?.efforts.includes(config.effort)) throw new Error('Selected effort is not advertised for this Claude model.');
  }
  return { sessionId: client.sessionId || client.options?.sessionId, models };
}
function claudePrompt(prompt, contextItems) {
  const content = [{ type: 'text', text: prompt }];
  for (const item of contextItems.filter(item => item.type === 'image').slice(0, 4)) {
    const match = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(item.image?.dataUrl || '');
    if (!match) throw new Error('Claude image attachments require a PNG, JPEG, GIF or WebP data URL.');
    content.push({ type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } });
  }
  return { type: 'user', message: { role: 'user', content }, parent_tool_use_id: null };
}
function handleClaude(message, session) {
  if (message.parent_tool_use_id && ['assistant', 'stream_event', 'user'].includes(message.type)) return;
  if (message.type === 'control_cancel_request') return session.cancelApproval(message.request_id);
  if (message.type === 'control_request') {
    const request = message.request || {};
    if (request.subtype !== 'can_use_tool') return session.client.unsupported(message.request_id);
    if (request.tool_name === 'AskUserQuestion') return session.client.respond(message.request_id, { behavior: 'deny', message: 'Interactive questions are unsupported by this adapter. Ask the user in visible text and end the turn.' });
    return session.permission(message.request_id, { tool: request.tool_name, input: request.input, request }, result => session.client.respond(message.request_id, result ? { behavior: 'allow', updatedInput: request.input } : { behavior: 'deny', message: 'The operation was not approved by the user.' }));
  }
  if (message.type === 'system' && message.subtype === 'init' && message.session_id && message.session_id !== session.sessionId) throw new Error('Claude returned a different native session. No request was replayed.');
  if (message.type === 'stream_event') {
    const event = message.event || {};
    if (event.type === 'message_start') session.claudeText = '';
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      session.claudeText = (session.claudeText || '') + event.delta.text;
      session.append(event.delta.text);
    }
    return; // Thinking, signatures, hooks and raw system events stay private.
  }
  if (message.type === 'assistant') {
    let text = '';
    for (const block of message.message?.content || []) {
      if (block.type === 'text') text += block.text || '';
      if (block.type === 'tool_use') session.activity(block.id, { tool: block.name, input: block.input, status: 'running' });
    }
    if (text) {
      const streamed = session.claudeText || '';
      session.append(text.startsWith(streamed) ? text.slice(streamed.length) : text);
    }
    session.claudeText = '';
    return;
  }
  if (message.type === 'user') {
    for (const block of message.message?.content || []) if (block.type === 'tool_result') session.activity(block.tool_use_id, { output: block.content, status: block.is_error ? 'failed' : 'completed' });
    return;
  }
  if (message.type === 'result') {
    if (message.session_id && message.session_id !== session.sessionId) throw new Error('Claude returned an unexpected session.');
    if (message.subtype !== 'success' || message.is_error) return session.finish(new Error('Claude reported a native turn failure. Check model access and native configuration. No request was replayed.'));
    if (typeof message.result === 'string') session.authoritative(message.result);
    const usage = message.usage;
    if (usage) {
      const n = v => Number.isFinite(v) && v >= 0 ? v : 0;
      session.usage({ inputTokens: n(usage.input_tokens) + n(usage.cache_read_input_tokens) + n(usage.cache_creation_input_tokens), cachedInputTokens: usage.cache_read_input_tokens, outputTokens: usage.output_tokens });
    }
    session.finish();
  }
}
module.exports = { claudeLaunch, claudeModels, initializeClaude, claudePrompt, handleClaude };
