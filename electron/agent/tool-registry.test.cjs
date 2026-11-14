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

test('API IdeaSpark invokes a fresh isolated model context and records correlated phase events', async t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'archimedes-api-phase-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  store.openWorkspace(root); modelConfig.initializeModelConfig(root);
  fs.writeFileSync(path.join(root, 'model-config.json'), JSON.stringify({ provider: 'custom', baseUrl: 'https://example.test/v1', model: 'fixture', apiKey: 'test' }));
  const previous = global.fetch;
  t.after(() => { global.fetch = previous; });
  let count = 0;
  global.fetch = async (_url, options) => {
    const request = JSON.parse(options.body); count++;
    let message;
    if (count === 1) {
      assert.ok(request.messages.some(m => String(m.content).includes('Research mode: use the installed IdeaSpark')));
      message = { role: 'assistant', content: '', tool_calls: [call('run_isolated_phase', { task: 'Return search queries', output_paths: [] })] };
    } else if (count === 2) {
      assert.equal(request.messages.length, 2);
      assert.equal(request.messages[1].content, 'Return search queries');
      assert.ok(!request.messages.some(m => String(m.content).includes('private main prompt')));
      assert.ok(!request.tools.some(tool => tool.function.name === 'propose_command' || tool.function.name === 'run_isolated_phase'));
      message = { role: 'assistant', content: 'query one; query two' };
    } else {
      assert.equal(JSON.parse(request.messages.at(-1).content).status, 'finished');
      message = { role: 'assistant', content: 'Queries ready.' };
    }
    return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ choices: [{ message }] }) };
  };
  const result = await runAgent({ prompt: 'private main prompt', workspace: root, origin: 'research', researchSkill: 'idea-spark', mode: 'free-chat', capabilities: { command: 'ask', write: 'ask' } });
  assert.equal(result.status, 'completed');
  const started = result.thread.events.find(event => event.type === 'phase_started');
  const finished = result.thread.events.find(event => event.type === 'phase_finished');
  assert.ok(started?.payload.worker_id);
  assert.equal(finished.payload.worker_id, started.payload.worker_id);
});

test('an existing output is not proof that an isolated phase wrote it', async t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'archimedes-api-output-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const runRelative = 'ideaspark_run/research-example';
  fs.mkdirSync(path.join(root, runRelative, 'phase1'), { recursive: true });
  fs.writeFileSync(path.join(root, runRelative, 'phase1/output.json'), 'old');
  const previous = global.fetch;
  t.after(() => { global.fetch = previous; });
  global.fetch = async () => ({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({ choices: [{ message: { role: 'assistant', content: 'done' } }] }) });
  const registry = createToolRegistry();
  const phaseCall = call('run_isolated_phase', { task: 'Write output', output_paths: [`${runRelative}/phase1/output.json`] });
  const result = await registry.invoke(phaseCall, {
    root, registry, call: phaseCall, config: { provider: 'custom', baseUrl: 'https://example.test/v1', model: 'fixture', apiKey: 'test' }, signal: new AbortController().signal,
    researchRun: { runRelative, runDirectory: path.join(root, runRelative) }, capabilities: { write: 'ask', command: 'ask' },
  });
  assert.equal(JSON.parse(result.content).status, 'incomplete');
});

test('API harness initializes IdeaSpark only when the user explicitly selects it', async t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'archimedes-modes-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  store.openWorkspace(root); modelConfig.initializeModelConfig(root);
  fs.writeFileSync(path.join(root, 'model-config.json'), JSON.stringify({ provider: 'custom', baseUrl: 'https://example.test/v1', model: 'fixture', apiKey: 'test' }));
  const previous = global.fetch, requests = [];
  t.after(() => { global.fetch = previous; });
  global.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ choices: [{ message: { role: 'assistant', content: 'done' } }] }) };
  };
  for (const mode of ['standard', 'create', 'research']) {
    const result = await runAgent({ prompt: 'Design an experiment', workspace: root, origin: 'research', mode, capabilities: { command: 'ask', write: 'ask' }, autoBuildGraph: false });
    assert.equal(result.status, 'completed');
    assert.equal(result.thread.mode, mode);
    const request = requests.at(-1);
    assert.match(request.messages[0].content, new RegExp(`Operate in ${mode[0].toUpperCase() + mode.slice(1)} mode`));
    assert.doesNotMatch(request.messages[0].content, /Operate in Idea spark mode/);
    assert.equal(request.messages.some(message => String(message.content).includes('Research mode: use the installed IdeaSpark')), false);
    assert.equal(result.thread.events.some(event => event.type === 'research_skill' && event.payload.skill === 'idea-spark'), false);
  }
  const explicit = await runAgent({ prompt: 'Find a testable idea', workspace: root, origin: 'research', mode: 'research', researchSkill: 'idea-spark', capabilities: { command: 'ask', write: 'ask' }, autoBuildGraph: false });
  assert.equal(explicit.status, 'completed');
  assert.ok(requests.at(-1).messages.some(message => String(message.content).includes('Research mode: use the installed IdeaSpark')));
  assert.equal(explicit.thread.events.some(event => event.type === 'research_skill' && event.payload.skill === 'idea-spark'), true);
});
