const { randomUUID } = require("node:crypto");

const DSML_PREFIX = "<｜｜DSML｜｜";
const DSML_OPEN = "<｜｜DSML｜｜tool_calls>";
const DSML_CLOSE = "</｜｜DSML｜｜tool_calls>";

class ModelProtocolError extends Error {
  constructor(message) {
    super(message);
    this.name = "ModelProtocolError";
  }
}

function decodeEntities(value) {
  const entities = { quot: "\"", apos: "'", lt: "<", gt: ">", amp: "&" };
  return value.replace(/&(quot|apos|lt|gt|amp);/g, (_, name) => entities[name]);
}

function parseParameterValue(rawValue, stringValue) {
  const value = decodeEntities(rawValue.trim());
  if (stringValue === "true") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function parseDsmlToolCalls(content) {
  const trimmed = String(content || "").trim();
  if (!trimmed.startsWith(DSML_PREFIX)) return null;
  if (!trimmed.startsWith(DSML_OPEN) || !trimmed.endsWith(DSML_CLOSE)) {
    throw new ModelProtocolError("The model returned a malformed DSML tool-call envelope.");
  }

  const body = trimmed.slice(DSML_OPEN.length, -DSML_CLOSE.length);
  const invokePattern = /<｜｜DSML｜｜invoke\s+name="([^"]+)">([\s\S]*?)<\/｜｜DSML｜｜invoke>/g;
  const parameterPattern = /<｜｜DSML｜｜parameter\s+name="([^"]+)"(?:\s+string="(true|false)")?>([\s\S]*?)<\/｜｜DSML｜｜parameter>/g;
  const calls = [];

  for (const invoke of body.matchAll(invokePattern)) {
    const name = decodeEntities(invoke[1]).trim();
    if (!/^[A-Za-z0-9_.-]+$/.test(name)) {
      throw new ModelProtocolError(`The model returned an invalid DSML tool name: ${name || "(empty)"}.`);
    }

    const parameterBody = invoke[2];
    const args = {};
    for (const parameter of parameterBody.matchAll(parameterPattern)) {
      const parameterName = decodeEntities(parameter[1]).trim();
      if (!parameterName) throw new ModelProtocolError("The model returned a DSML parameter without a name.");
      args[parameterName] = parseParameterValue(parameter[3], parameter[2]);
    }

    if (parameterBody.replace(parameterPattern, "").trim()) {
      throw new ModelProtocolError(`The model returned malformed DSML parameters for ${name}.`);
    }
    calls.push({
      id: `dsml_${randomUUID()}`,
      type: "function",
      function: { name, arguments: JSON.stringify(args) },
    });
  }

  if (!calls.length || body.replace(invokePattern, "").trim()) {
    throw new ModelProtocolError("The model returned malformed DSML tool calls.");
  }
  return { content: "", tool_calls: calls, protocol: "dsml" };
}

function normalizeAssistantMessage(message) {
  const content = typeof message?.content === "string" ? message.content : "";
  const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls.filter(Boolean) : [];
  if (toolCalls.length) return { content, tool_calls: toolCalls, protocol: "openai" };
  return parseDsmlToolCalls(content) || { content, tool_calls: [], protocol: "text" };
}

function presentStoredAssistantMessage(content) {
  const text = String(content || "");
  if (!text.trimStart().startsWith(DSML_PREFIX)) return text;
  return "This earlier turn returned an internal tool-call protocol before its tools could run. Retry the request or continue in this chat; the original event remains available for diagnostics.";
}

class StreamContentGuard {
  constructor(onTextDelta = () => {}) {
    this.onTextDelta = onTextDelta;
    this.pending = "";
    this.mode = "undecided";
  }

  push(delta) {
    if (typeof delta !== "string" || !delta) return;
    if (this.mode === "text") {
      this.onTextDelta(delta);
      return;
    }
    this.pending += delta;
    const probe = this.pending.trimStart();
    if (!probe || DSML_PREFIX.startsWith(probe)) return;
    if (probe.startsWith(DSML_PREFIX)) {
      this.mode = "protocol";
      return;
    }
    this.mode = "text";
    this.onTextDelta(this.pending);
    this.pending = "";
  }

  finish(message) {
    if (message.protocol === "dsml" || this.mode === "protocol") {
      this.pending = "";
      return;
    }
    if (this.pending) this.onTextDelta(this.pending);
    this.pending = "";
  }
}

module.exports = {
  ModelProtocolError,
  StreamContentGuard,
  normalizeAssistantMessage,
  parseDsmlToolCalls,
  presentStoredAssistantMessage,
};
