const { fetchModelWithRetry } = require("./model-retry.cjs");
const { assertModelCompletion, ModelIncompleteError } = require("./model-completion.cjs");

function inputItems(messages) {
  return messages.flatMap(message => {
    if (message.responseItems) return message.responseItems;
    if (message.role === "tool") return [{ type: "function_call_output", call_id: message.tool_call_id, output: message.content }];
    const items = [];
    if (message.content) {
      const content = Array.isArray(message.content) ? message.content.map(part => {
        if (part.type === "image_url") return { type: "input_image", image_url: part.image_url.url, detail: part.image_url.detail || "auto" };
        return { type: "input_text", text: part.text };
      }) : message.content;
      items.push({ role: message.role, content });
    }
    for (const call of message.tool_calls || []) {
      items.push({ type: "function_call", call_id: call.id, name: call.function.name, arguments: call.function.arguments });
    }
    return items;
  });
}

async function readStream(response, onTextDelta) {
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "", text = "", terminal;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += value || "";
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop();
      if (done && buffer.trim()) frames.push(buffer);
      for (const frame of frames) {
        const data = frame.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
        if (!data || data === "[DONE]") continue;
        const event = JSON.parse(data);
        if (event.type === "response.output_text.delta" || event.type === "response.refusal.delta") {
          text += event.delta; onTextDelta(event.delta);
        } else if (["response.completed", "response.failed", "response.incomplete"].includes(event.type)) {
          terminal = event.response;
        } else if (event.type === "error") {
          throw new ModelIncompleteError({ provider: "openai", reason: event.code || "stream_error", partialResponse: text });
        }
      }
      if (done || terminal) break;
    }
  } catch (error) {
    if (error.name === "AbortError") {
      error.partialResponse = text;
      throw error;
    }
    if (error instanceof ModelIncompleteError) throw error;
    throw new ModelIncompleteError({ provider: "openai", reason: "stream_error", partialResponse: text });
  } finally {
    // An aborted connection can already have errored the readable stream.
    try { await reader.cancel(); } catch { /* Preserve the original stream error. */ }
  }
  if (!terminal) throw new ModelIncompleteError({ provider: "openai", reason: "missing_terminal", partialResponse: text });
  return { response: terminal, text };
}

function visibleText(output) {
  return output.filter(item => item.type === "message").flatMap(item => item.content)
    .map(part => part.type === "output_text" ? part.text : part.type === "refusal" ? part.refusal : "").join("");
}

async function completeResponses(config, profile, messages, { signal, tools, effort, tokenLimit, responseFormat, onTextDelta }) {
  const body = { model: config.model, input: inputItems(messages), store: false, stream: profile.stream,
    reasoning: { effort }, include: ["reasoning.encrypted_content"] };
  if (tokenLimit) body.max_output_tokens = tokenLimit;
  if (tools.length) body.tools = tools.map(({ function: definition }) => ({ type: "function", ...definition, strict: definition.strict ?? false }));
  if (responseFormat) body.text = { format: responseFormat.type === "json_schema"
    ? { type: "json_schema", ...responseFormat.json_schema } : responseFormat };
  const response = await fetchModelWithRetry(`${config.baseUrl.replace(/\/+$/, "")}/responses`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` }, body: JSON.stringify(body), signal,
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const detail = String(errorBody?.error?.message || response.statusText || "Request rejected").replaceAll(config.apiKey, "[redacted]").replace(/sk-[\w-]+/g, "[redacted]");
    throw new Error(`Model request failed (${response.status}): ${detail.slice(0, 500)}`);
  }
  const streamed = (response.headers?.get("content-type") || "").includes("text/event-stream");
  const result = streamed ? await readStream(response, onTextDelta) : { response: await response.json(), text: "" };
  const output = result.response?.output || [];
  const content = visibleText(output);
  if (result.response?.status !== "completed") throw new ModelIncompleteError({ provider: "openai",
    reason: result.response?.incomplete_details?.reason || result.response?.error?.code || result.response?.status || "missing_terminal",
    partialResponse: content || result.text });
  const calls = output.filter(item => item.type === "function_call");
  if (calls.some(call => call.status && call.status !== "completed")) {
    throw new ModelIncompleteError({ provider: "openai", reason: "incomplete_tool_call", partialResponse: content });
  }
  const toolCalls = calls.map(item => ({
    id: item.call_id, type: "function", function: { name: item.name, arguments: item.arguments },
  }));
  assertModelCompletion({ provider: "openai", finishReason: toolCalls.length ? "tool_calls" : "stop", partialResponse: content, toolCalls });
  if (!content && !toolCalls.length) throw new ModelIncompleteError({ provider: "openai", reason: "empty_response", partialResponse: result.text });
  if (content && !result.text) onTextDelta(content);
  return { content, tool_calls: toolCalls, protocol: "openai", resolvedModel: result.response.model || config.model, ...(toolCalls.length ? { responseItems: output } : {}) };
}

module.exports = { completeResponses };
