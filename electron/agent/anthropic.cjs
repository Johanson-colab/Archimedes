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

function toAnthropicRequest(config, messages, { allowTools = true, availableTools = [] } = {}) {
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
  const request = { model: config.model, max_tokens: 4096, stream: true, messages: converted };
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

async function completeAnthropic(config, messages, { signal, onTextDelta = () => {}, allowTools = true, availableTools = [] }) {
  const response = await fetch(`${config.baseUrl.replace(/\/+$/, "")}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": config.apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(toAnthropicRequest(config, messages, { allowTools, availableTools })),
    signal,
  });
  if (!response.ok) throw new Error(`Model request failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
  if (!(response.headers.get("content-type") || "").includes("text/event-stream") || !response.body) {
    const body = await response.json();
    if (!Array.isArray(body?.content)) throw new Error("Anthropic response did not contain content blocks.");
    const normalized = normalizeBlocks(body.content);
    if (normalized.content) onTextDelta(normalized.content);
    return normalized;
  }

  const blocks = [];
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() || "";
    for (const frame of frames) {
      const data = frame.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("");
      if (!data) continue;
      let event;
      try { event = JSON.parse(data); } catch { continue; }
      if (event.type === "error") throw new Error(`Anthropic stream error: ${event.error?.message || "Unknown error"}`);
      if (event.type === "content_block_start") blocks[event.index] = { ...event.content_block, text: event.content_block?.text || "", partialInput: "" };
      if (event.type === "content_block_delta" && blocks[event.index]) {
        if (event.delta?.type === "text_delta") { blocks[event.index].text += event.delta.text || ""; onTextDelta(event.delta.text || ""); }
        if (event.delta?.type === "input_json_delta") blocks[event.index].partialInput += event.delta.partial_json || "";
      }
      if (event.type === "content_block_stop" && blocks[event.index]?.type === "tool_use" && blocks[event.index].partialInput) {
        blocks[event.index].input = parseArguments(blocks[event.index].partialInput);
      }
    }
    if (done) break;
  }
  const normalized = normalizeBlocks(blocks.filter(Boolean));
  if (!normalized.content && !normalized.tool_calls.length) throw new Error("Anthropic stream did not contain a message.");
  return normalized;
}

module.exports = { completeAnthropic, toAnthropicRequest };
