const { outputTokenLimit } = require("./model-capabilities.cjs");
const { fetchModelWithRetry } = require("./model-retry.cjs");
const { ModelIncompleteError, assertModelCompletion } = require("./model-completion.cjs");
const { buildModelRequestOptions, formatModelRequestError, modelProviderErrorDetail } = require("../model-request-headers.cjs");

function parseArguments(value) {
  try { return JSON.parse(value || "{}"); } catch { return {}; }
}

function userBlocks(content) {
  if (typeof content === "string") return [{ type: "text", text: content }];
  if (!Array.isArray(content)) return [{ type: "text", text: String(content || "") }];
  return content.flatMap((part) => {
    if (part.type === "text") return [{ type: "text", text: String(part.text || "") }];
    const dataUrl = part.image_url?.url;
    const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/s.exec(dataUrl || "");
    return match ? [{ type: "image", source: { type: "base64", media_type: match[1], data: match[2] } }] : [];
  });
}

function toAnthropicRequest(config, messages, { allowTools = true, availableTools = [], maxOutputTokens, allowLargeOutput = false } = {}) {
  const system = [];
  const converted = [];
  for (const message of messages) {
    if (message.role === "system") { system.push(String(message.content || "")); continue; }
    let role;
    let content;
    if (message.role === "assistant") {
      role = "assistant";
      content = [ ...(message.content ? [{ type: "text", text: String(message.content) }] : []),
        ...(message.tool_calls || []).map((call) => ({ type: "tool_use", id: call.id, name: call.function.name, input: parseArguments(call.function.arguments) })) ];
    } else if (message.role === "tool") {
      role = "user";
      content = [{ type: "tool_result", tool_use_id: message.tool_call_id, content: String(message.content || "") }];
    } else {
      role = "user";
      content = userBlocks(message.content);
    }
    if (converted.at(-1)?.role === role) converted.at(-1).content.push(...content);
    else converted.push({ role, content });
  }
  const request = { model: config.model, max_tokens: outputTokenLimit(config, { maxOutputTokens, allowTools, allowLargeOutput }) || 4096, stream: true, messages: converted };
  if (system.length) request.system = system.join("\n\n");
  if (allowTools && availableTools.length) request.tools = availableTools.map((tool) => ({
    name: tool.function.name, description: tool.function.description || "", input_schema: tool.function.parameters,
  }));
  return request;
}

function normalizeBlocks(blocks) {
  return {
    content: blocks.filter((block) => block.type === "text").map((block) => block.text || "").join(""),
    tool_calls: blocks.filter((block) => block.type === "tool_use").map((block) => ({
      id: block.id, type: "function", function: { name: block.name, arguments: JSON.stringify(block.input || {}) },
    })),
    protocol: "anthropic",
  };
}

async function completeAnthropic(config, messages, { signal, onTextDelta = () => {}, allowTools = true, availableTools = [], maxOutputTokens, allowLargeOutput = false, requireComplete = false, sessionId = "archimedes-internal" }) {
  const response = await fetchModelWithRetry(`${config.baseUrl.replace(/\/+$/, "")}/messages`, {
    method: "POST",
    ...buildModelRequestOptions(config, sessionId, { anthropic: true, baseHeaders: { "Content-Type": "application/json" } }),
    body: JSON.stringify(toAnthropicRequest(config, messages, { allowTools, availableTools, maxOutputTokens, allowLargeOutput })),
    signal,
  });
  if (!response.ok) throw new Error(formatModelRequestError(response.status, await response.text(), config));
  if (!(response.headers.get("content-type") || "").includes("text/event-stream") || !response.body) {
    const body = await response.json();
    if (!Array.isArray(body?.content)) throw new Error("Anthropic response did not contain content blocks.");
    const normalized = normalizeBlocks(body.content);
    assertModelCompletion({ provider: "anthropic", finishReason: body.stop_reason, partialResponse: normalized.content, toolCalls: normalized.tool_calls });
    if (normalized.content) onTextDelta(normalized.content);
    return normalized;
  }

  const blocks = [];
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let terminalSeen = false, finishReason = null;
  const openBlocks = new Set();
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() || "";
      if (done && buffer.trim()) { frames.push(buffer); buffer = ""; }
      for (const frame of frames) {
        const data = frame.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("");
        if (!data) continue;
        let event;
        try { event = JSON.parse(data); }
        catch { throw new ModelIncompleteError({ provider: "anthropic", reason: "malformed_frame" }); }
        if (event.type === "message_delta" && event.delta?.stop_reason) finishReason = event.delta.stop_reason;
        if (event.type === "message_stop") terminalSeen = true;
        if (event.type === "error" || event.error) throw new Error(`Anthropic stream error: ${event.error?.message || event.message || "Unknown error"}`);
        if (event.type === "content_block_start") {
          blocks[event.index] = { ...event.content_block, text: event.content_block?.text || "", partialInput: "" };
          openBlocks.add(event.index);
        }
        if (event.type === "content_block_delta" && blocks[event.index]) {
          if (event.delta?.type === "text_delta") { blocks[event.index].text += event.delta.text || ""; onTextDelta(event.delta.text || ""); }
          if (event.delta?.type === "input_json_delta") blocks[event.index].partialInput += event.delta.partial_json || "";
        }
        if (event.type === "content_block_stop" && blocks[event.index]?.type === "tool_use" && blocks[event.index].partialInput) {
          try { blocks[event.index].input = JSON.parse(blocks[event.index].partialInput); }
          catch { throw new ModelIncompleteError({ provider: "anthropic", reason: "malformed_tool_arguments" }); }
        }
        if (event.type === "content_block_stop") openBlocks.delete(event.index);
      }
      if (done) break;
    }
  } catch (error) {
    const partialResponse = normalizeBlocks(blocks.filter(Boolean)).content;
    try { await reader.cancel(); } catch { /* Preserve the actual stream error. */ }
    if (signal?.aborted || error?.name === "AbortError") throw Object.assign(new Error("Model request interrupted."), { name: "AbortError", partialResponse });
    if (error.code === "MODEL_RESPONSE_INCOMPLETE") { error.partialResponse = partialResponse; throw error; }
    throw new ModelIncompleteError({ provider: "anthropic", reason: "stream_error", partialResponse, detail: modelProviderErrorDetail(error?.message, config) });
  } finally { reader.releaseLock(); }
  const normalized = normalizeBlocks(blocks.filter(Boolean));
  assertModelCompletion({ provider: "anthropic", finishReason, terminalSeen, partialResponse: normalized.content, toolCalls: normalized.tool_calls });
  if (openBlocks.size) throw new ModelIncompleteError({ provider: "anthropic", reason: "unfinished_content_block", finishReason, partialResponse: normalized.content });
  if (!normalized.content && !normalized.tool_calls.length) throw new Error("Anthropic stream did not contain a message.");
  return normalized;
}

module.exports = { completeAnthropic, toAnthropicRequest };
