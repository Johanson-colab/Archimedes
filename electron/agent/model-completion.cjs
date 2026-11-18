class ModelIncompleteError extends Error {
  constructor({ provider, reason, finishReason = null, partialResponse = "", detail }) {
    super(detail || `The ${provider} response is incomplete (${reason}).`);
    this.name = "ModelIncompleteError";
    this.code = "MODEL_RESPONSE_INCOMPLETE";
    this.provider = provider;
    this.reason = reason;
    this.finishReason = finishReason;
    this.partialResponse = partialResponse;
  }
}

function assertModelCompletion({ provider, finishReason, terminalSeen = true, partialResponse = "", toolCalls = [] }) {
  const fail = (reason, detail) => { throw new ModelIncompleteError({ provider, reason, finishReason, partialResponse, detail }); };
  if (["length", "max_tokens", "model_context_window_exceeded"].includes(finishReason)) fail("length", "Model output was truncated. The partial response was kept; no tool from this response was executed.");
  if (!terminalSeen) fail("missing_terminal", "The model stream ended without a completion event. The partial response was kept.");
  const accepted = provider === "anthropic" ? ["end_turn", "stop_sequence", "tool_use", "refusal"] : ["stop", "tool_calls", "function_call"];
  if (!accepted.includes(finishReason)) fail(finishReason ? "unsupported_stop_reason" : "missing_stop_reason");
  if (["tool_use", "tool_calls", "function_call"].includes(finishReason) && !toolCalls.length) fail("missing_tool_calls");
  for (const call of toolCalls) {
    if (!call?.id || !call.function?.name) fail("malformed_tool_call");
    let args;
    try { args = JSON.parse(call.function.arguments); }
    catch { fail("malformed_tool_arguments", "The model returned incomplete tool arguments. No tool from this response was executed."); }
    if (!args || typeof args !== "object" || Array.isArray(args)) fail("malformed_tool_arguments");
  }
}

module.exports = { ModelIncompleteError, assertModelCompletion };
