const MAX_ARGUMENT_BYTES = 600_000;
const MAX_RESULT_BYTES = 2_000_000;
const SOURCES = new Set(['builtin', 'mcp', 'research-app']);
const SCHEMA_KEYS = new Set(['type', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'description', 'title', 'default', 'minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems']);

function checkSchema(schema, depth = 0) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema) || depth > 12) throw new Error('Invalid tool input schema.');
  for (const key of Object.keys(schema)) if (!SCHEMA_KEYS.has(key)) throw new Error(`Unsupported tool schema keyword: ${key}.`);
  if (!['object', 'array', 'integer', 'number', 'string', 'boolean'].includes(schema.type)) throw new Error('Tool schemas require a supported type.');
  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || schema.enum.length > 1000)) throw new Error('Invalid tool schema enum.');
  if (schema.type === 'object') {
    if (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== 'boolean') throw new Error('Unsupported additionalProperties schema.');
    if (schema.required !== undefined && (!Array.isArray(schema.required) || schema.required.some(key => typeof key !== 'string'))) throw new Error('Invalid required fields in tool schema.');
    if (schema.properties !== undefined && (!schema.properties || typeof schema.properties !== 'object' || Array.isArray(schema.properties))) throw new Error('Invalid tool schema properties.');
    for (const child of Object.values(schema.properties || {})) checkSchema(child, depth + 1);
  }
  if (schema.type === 'array' && schema.items) checkSchema(schema.items, depth + 1);
}

function waitForAuthorization(promise, signal) {
  if (!signal) return Promise.resolve(promise);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => { if (settled) return; settled = true; signal.removeEventListener('abort', onAbort); callback(value); };
    const onAbort = () => finish(reject, Object.assign(new Error('Tool authorization interrupted.'), { name: 'AbortError' }));
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
    Promise.resolve(promise).then(value => finish(resolve, value), error => finish(reject, error));
  });
}

function validate(value, schema, location = 'arguments', depth = 0) {
  if (depth > 12) throw new Error('Tool arguments are nested too deeply.');
  if (!schema || typeof schema !== 'object') throw new Error('Invalid tool input schema.');
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) throw new Error(`${location} is not an allowed value.`);
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${location} must be an object.`);
    const keys = Object.keys(value);
    if (keys.length > 200) throw new Error(`${location} has too many fields.`);
    const properties = schema.properties || {};
    for (const key of schema.required || []) if (!Object.hasOwn(value, key)) throw new Error(`${location}.${key} is required.`);
    for (const key of keys) {
      if (!Object.hasOwn(properties, key)) { if (schema.additionalProperties === false) throw new Error(`${location}.${key} is not allowed.`); continue; }
      validate(value[key], properties[key], `${location}.${key}`, depth + 1);
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length > 1000) throw new Error(`${location} must be a bounded array.`);
    if ((schema.minItems !== undefined && value.length < schema.minItems) || (schema.maxItems !== undefined && value.length > schema.maxItems)) throw new Error(`${location} has an invalid length.`);
    if (schema.items) for (let index = 0; index < value.length; index += 1) validate(value[index], schema.items, `${location}[${index}]`, depth + 1);
  } else if (schema.type === 'integer') {
    if (!Number.isSafeInteger(value)) throw new Error(`${location} must be an integer.`);
  } else if (schema.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${location} must be a finite number.`);
  } else if (schema.type === 'string' || schema.type === 'boolean') {
    if (typeof value !== schema.type) throw new Error(`${location} must be ${schema.type}.`);
    if (schema.type === 'string' && ((schema.minLength !== undefined && value.length < schema.minLength) || (schema.maxLength !== undefined && value.length > schema.maxLength))) throw new Error(`${location} has an invalid length.`);
  } else if (schema.type !== undefined) throw new Error(`Unsupported schema type: ${schema.type}.`);
  if (typeof value === 'number' && ((schema.minimum !== undefined && value < schema.minimum) || (schema.maximum !== undefined && value > schema.maximum))) throw new Error(`${location} is outside its permitted range.`);
}

class ToolRegistry {
  constructor() { this.entries = new Map(); }

  register({ definition, source = 'builtin', execute, authorize }) {
    const name = definition?.function?.name;
    if (definition?.type !== 'function' || typeof name !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(name) || definition.function.parameters?.type !== 'object') throw new Error('Invalid tool definition.');
    if (!SOURCES.has(source) || typeof execute !== 'function') throw new Error('Invalid tool source or executor.');
    if (source !== 'builtin' && typeof authorize !== 'function') throw new Error('External tools require an authorization handler.');
    if (this.entries.has(name)) throw new Error(`Tool ${name} is already registered.`);
    checkSchema(definition.function.parameters);
    this.entries.set(name, { definition: structuredClone(definition), source, execute, authorize });
  }

  definitions() { return [...this.entries.values()].map(entry => structuredClone(entry.definition)); }

  async invoke(call, context = {}) {
    const name = call?.function?.name;
    const id = call?.id;
    const record = context.recordEvent || (() => {});
    const emit = context.emit || (() => {});
    const entry = this.entries.get(name);
    const source = entry?.source || 'unknown';
    const started = Date.now();
    const title = String(name || 'tool').replaceAll('_', ' ');
    const publish = (status, detail) => emit({ type: 'tool', title, detail, toolCall: { id, name, source, status, durationMs: Date.now() - started } });
    let args = {}, callRecorded = false, resultRecorded = false;
    try {
      const serialized = call?.function?.arguments || '{}';
      if (typeof serialized !== 'string' || Buffer.byteLength(serialized) > MAX_ARGUMENT_BYTES) throw new Error('Tool arguments exceed the size limit.');
      try { args = JSON.parse(serialized); } catch { throw new Error('The model returned invalid tool arguments.'); }
      record({ type: 'tool_call', payload: { call_id: id, name, arguments: args, source } });
      callRecorded = true;
      publish('running', name === 'search_academic_papers' ? 'Searching scholarly metadata' : name === 'web_search' ? 'Searching the web' : name === 'add_artifact' ? 'Registering a durable output' : 'Running tool');
      if (!entry) throw new Error(`Unsupported Agent tool: ${name}`);
      validate(args, entry.definition.function.parameters);
      if (context.signal?.aborted) throw Object.assign(new Error('Tool invocation interrupted.'), { name: 'AbortError' });
      if (context.preflight) await context.preflight(name, args);
      if (entry.authorize && (await waitForAuthorization(entry.authorize({ name, args, context }), context.signal)) !== true) throw new Error(`The ${source} tool was not authorized.`);
      if (context.signal?.aborted) throw Object.assign(new Error('Tool invocation interrupted.'), { name: 'AbortError' });
      const result = await entry.execute(context, args);
      if (!result || typeof result.content !== 'string' || Buffer.byteLength(result.content) > MAX_RESULT_BYTES) throw new Error('Tool returned an invalid or oversized result.');
      record({ type: 'tool_result', payload: { call_id: id, name, source, status: 'completed', duration_ms: Date.now() - started, content: result.content } });
      resultRecorded = true;
      publish('completed', 'Tool completed');
      return result;
    } catch (error) {
      if (resultRecorded) throw error;
      if (!callRecorded) record({ type: 'tool_call', payload: { call_id: id, name, arguments: {}, source } });
      const status = context.signal?.aborted ? 'interrupted' : 'failed';
      record({ type: 'tool_result', payload: { call_id: id, name, source, status, duration_ms: Date.now() - started, content: JSON.stringify({ error: error.message || String(error) }) } });
      publish(status, String(error.message || error).slice(0, 500));
      throw error;
    }
  }
}

module.exports = { ToolRegistry, validate, MAX_ARGUMENT_BYTES, MAX_RESULT_BYTES };
