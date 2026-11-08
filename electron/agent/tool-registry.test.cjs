const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { ToolRegistry, MAX_RESULT_BYTES } = require('./tool-registry.cjs');
const { createToolRegistry, executeTool, runAgent } = require('../agent.cjs');
const store = require('../store.cjs');
const modelConfig = require('../model-config.cjs');

const definition = name => ({ type: 'function', function: { name, description: 'fixture', parameters: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'], additionalProperties: false } } });
const call = (name, args) => ({ id: `call-${name}`, function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) } });

test('built-in, MCP and Research App adapters use the same events and validated result contract', async () => {
  const registry = new ToolRegistry();
  for (const source of ['builtin', 'mcp', 'research-app']) registry.register({ definition: definition(source.replace('-', '_')), source, authorize: source === 'builtin' ? undefined : async () => true, execute: async (_context, args) => ({ content: JSON.stringify({ result: args.value }) }) });
  const events = [], live = [];
  for (const source of ['builtin', 'mcp', 'research-app']) {
    const name = source.replace('-', '_');
    const result = await registry.invoke(call(name, { value: source }), { recordEvent: e => events.push(e), emit: e => live.push(e) });
    assert.equal(JSON.parse(result.content).result, source);
  }
  assert.deepEqual(events.map(e => [e.type, e.payload.source]), [['tool_call','builtin'], ['tool_result','builtin'], ['tool_call','mcp'], ['tool_result','mcp'], ['tool_call','research-app'], ['tool_result','research-app']]);
  assert.ok(events.filter(e => e.type === 'tool_result').every(e => e.payload.status === 'completed' && Number.isFinite(e.payload.duration_ms)));
  assert.deepEqual(live.map(e => [e.toolCall.source, e.toolCall.status]), [['builtin','running'], ['builtin','completed'], ['mcp','running'], ['mcp','completed'], ['research-app','running'], ['research-app','completed']]);
});

test('external tools require authorization, cannot overwrite built-ins and cannot mutate advertised schemas', async () => {
  const registry = createToolRegistry();
  assert.throws(() => registry.register({ definition: definition('ext'), source: 'mcp', execute: () => {} }), /authorization/);
  assert.throws(() => registry.register({ definition: definition('read_workspace_file'), source: 'mcp', authorize: () => true, execute: () => {} }), /already registered/);
  let ran = false;
  const original = definition('ext');
  registry.register({ definition: original, source: 'mcp', authorize: async () => false, execute: async () => { ran = true; return { content: '{}' }; } });
  original.function.parameters.required = [];
  const advertised = registry.definitions().find(d => d.function.name === 'ext');
  advertised.function.parameters.required = [];
  await assert.rejects(executeTool({ registry, call: call('ext', {}), emit: () => {} }), /required/);
  await assert.rejects(executeTool({ registry, call: call('ext', { value: 'x' }), emit: () => {} }), /not authorized/);
  assert.equal(ran, false);
  const unsupported = definition('unsupported');
  unsupported.function.parameters.properties.value.pattern = '.*';
  assert.throws(() => registry.register({ definition: unsupported, source: 'mcp', authorize: () => true, execute: () => {} }), /schema keyword/);
});

test('bad input and failed tools record one correlated call and result without running unauthorized code', async () => {
  const registry = new ToolRegistry(), events = [];
  let executions = 0;
  registry.register({ definition: definition('fixture'), execute: async () => { executions++; throw new Error('fixture failed'); } });
  for (const args of ['{broken', { value: 3 }, { value: 'valid', extra: 1 }, { value: 'valid' }]) {
    await assert.rejects(registry.invoke(call('fixture', args), { recordEvent: e => events.push(e) }));
  }
  assert.equal(executions, 1);
  assert.deepEqual(events.map(e => e.type), ['tool_call','tool_result','tool_call','tool_result','tool_call','tool_result','tool_call','tool_result']);
  assert.ok(events.filter(e => e.type === 'tool_result').every(e => e.payload.status === 'failed'));
});

test('aborting while an external authorization waits prevents execution', async () => {
  const registry = new ToolRegistry(), controller = new AbortController();
  let ran = false, release;
  registry.register({ definition: definition('external'), source: 'research-app', authorize: () => new Promise(resolve => { release = resolve; }), execute: async () => { ran = true; return { content: '{}' }; } });
  const pending = registry.invoke(call('external', { value: 'x' }), { signal: controller.signal });
  await new Promise(resolve => setImmediate(resolve));
  controller.abort(); release(true);
  await assert.rejects(pending, /interrupted/);
  assert.equal(ran, false);
});

test('an abandoned external authorization is released on cancellation', async () => {
  const registry = new ToolRegistry(), controller = new AbortController();
  let ran = false;
  registry.register({ definition: definition('waiting'), source: 'mcp', authorize: () => new Promise(() => {}), execute: async () => { ran = true; return { content: '{}' }; } });
  const pending = registry.invoke(call('waiting', { value: 'x' }), { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, /interrupted/);
  assert.equal(ran, false);
});

test('oversized tool results are rejected instead of inflating the model context', async () => {
  const registry = new ToolRegistry();
  registry.register({ definition: definition('large'), execute: async () => ({ content: 'x'.repeat(MAX_RESULT_BYTES + 1) }) });
  await assert.rejects(registry.invoke(call('large', { value: 'x' })), /oversized/);
});

test('registered external adapters are advertised and invoked through the actual API agent loop', async t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'archimedes-registry-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  store.openWorkspace(root); modelConfig.initializeModelConfig(root);
  fs.writeFileSync(path.join(root, 'model-config.json'), JSON.stringify({ provider: 'custom', baseUrl: 'https://example.test/v1', model: 'fixture', apiKey: 'test' }));
  const registry = createToolRegistry();
  for (const source of ['mcp', 'research-app']) {
    const name = source.replace('-', '_');
    registry.register({ definition: definition(name), source, authorize: async () => true, execute: async (_ctx, args) => ({ content: JSON.stringify({ source, value: args.value }) }) });
  }
  const previous = global.fetch;
  t.after(() => { global.fetch = previous; });
  let count = 0, second;
  global.fetch = async (_url, options) => {
    const request = JSON.parse(options.body); count++;
    if (count === 1) {
      assert.ok(request.tools.some(t => t.function.name === 'mcp'));
      assert.ok(request.tools.some(t => t.function.name === 'research_app'));
      return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ choices: [{ message: { role: 'assistant', content: '', tool_calls: [call('mcp', { value: 'one' }), call('research_app', { value: 'two' })] } }] }) };
    }
    second = request.messages.filter(m => m.role === 'tool');
    return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ choices: [{ message: { role: 'assistant', content: 'done' } }] }) };
  };
  const result = await runAgent({ prompt: 'Test registered tools', workspace: root, origin: 'research', mode: 'free-chat', capabilities: { command: 'ask', write: 'ask' }, toolRegistry: registry });
  assert.equal(result.status, 'completed');
  assert.deepEqual(second.map(m => JSON.parse(m.content).source), ['mcp','research-app']);
  assert.deepEqual(result.thread.events.filter(e => e.type === 'tool_result').map(e => e.payload.source), ['mcp','research-app']);
});
