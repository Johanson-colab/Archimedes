function opencodeLaunch({ config, root }) { return { backend: 'opencode', binary: config.binary || 'opencode', args: ['acp'], cwd: root }; }
async function initializeOpenCode(client) {
  const result = await client.request('initialize', { protocolVersion: 1, clientInfo: { name: 'archimedes', version: '0.1.0' }, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false } });
  if (result?.protocolVersion !== 1) throw new Error('OpenCode does not support ACP protocol version 1.');
  return result;
}
function openCodeModels(result) {
  const option = result?.configOptions?.find(o => o.id === 'model');
  return (option?.options || []).filter(o => typeof o.value === 'string').slice(0, 1000).map(o => ({ id: o.value.slice(0, 300), label: String(o.name || o.value).slice(0, 300), efforts: [] }));
}
async function configureOpenCode(client, config, result, sessionId) {
  let options = result?.configOptions || [];
  for (const [configId, value] of [['model', config.model], ['effort', config.effort]]) {
    if (!value) continue;
    const option = options.find(o => o.id === configId);
    if (!option?.options?.some(o => o.value === value)) throw new Error(`Selected OpenCode ${configId} is not advertised by its ACP session.`);
    const changed = await client.request('session/set_config_option', { sessionId, configId, value });
    if (!changed?.configOptions?.some(o => o.id === configId && o.currentValue === value)) throw new Error(`OpenCode did not confirm the selected ${configId}.`);
    options = changed.configOptions;
  }
}
function openCodePrompt(prompt, items) {
  const blocks = [{ type: 'text', text: prompt }];
  for (const item of items.filter(item => item.type === 'image').slice(0, 4)) {
    const match = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(item.image?.dataUrl || '');
    if (!match) throw new Error('OpenCode image attachments require a PNG, JPEG, GIF or WebP data URL.');
    blocks.push({ type: 'image', mimeType: match[1], data: match[2] });
  }
  return blocks;
}
function handleOpenCode(message, session) {
  const params = message.params || {};
  if (Object.hasOwn(message, 'id') && message.method) {
    if (message.method !== 'session/request_permission' || params.sessionId !== session.sessionId) return session.client.unsupported(message.id);
    const call = params.toolCall || {};
    const once = params.options?.find(o => o.kind === 'allow_once');
    const reject = params.options?.find(o => o.kind === 'reject_once');
    if (!once || !reject) return session.client.respond(message.id, { outcome: { outcome: 'cancelled' } });
    return session.permission(message.id, { tool: call.name || call.kind || 'native tool', input: call.rawInput, title: call.title, content: call.content, locations: call.locations }, allowed => session.client.respond(message.id, { outcome: { outcome: 'selected', optionId: allowed ? once.optionId : reject.optionId } }));
  }
  if (message.method !== 'session/update' || params.sessionId !== session.sessionId || !session.delivered) return;
  const update = params.update || {};
  if (update.sessionUpdate === 'agent_message_chunk' && update.content?.type === 'text') session.append(update.content.text);
  if (['tool_call', 'tool_call_update'].includes(update.sessionUpdate)) session.activity(update.toolCallId, { tool: update.name || update.kind, title: update.title, status: update.status, input: update.rawInput, output: update.content });
  if (update.sessionUpdate === 'plan') session.plan(update.entries);
  // agent_thought_chunk and raw provider metadata are deliberately not rendered.
}
module.exports = { opencodeLaunch, initializeOpenCode, openCodeModels, configureOpenCode, openCodePrompt, handleOpenCode };
