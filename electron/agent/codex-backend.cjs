const fs = require("node:fs");
const path = require("node:path");
const { CodexClient } = require("./codex-client.cjs");

function nativeContext(items) {
  if (items.some((item) => ["plugin", "skill"].includes(item.type))) throw new Error("Codex backend does not yet support Archimedes plugin/skill attachments. Remove them or select API harness.");
  return items.filter((item) => item.type !== "image").map((item) => ({
    type: item.type, name: item.name, path: item.path, detail: item.detail, selection: item.selection,
    paper: item.paper ? { title: item.paper.title, abstract: item.paper.abstract, url: item.paper.url, pdf_url: item.paper.pdf_url } : undefined,
    repository: item.repository ? { url: item.repository.url, checkout: item.repository.checkout } : undefined,
  }));
}

function canResume(binding, { workspace, model, previousTurnId }) {
  return Boolean(binding?.native_thread_id && binding.last_turn_id && binding.workspace === workspace && binding.model === model && binding.last_turn_id === previousTurnId);
}

async function runCodex({ config, workspace, thread, turn, context, contextItems, signal, emit, recordEvent, approve, bindings, Client = CodexClient }) {
  const root = fs.realpathSync(workspace);
  const attachments = nativeContext(contextItems);
  const previousTurnId = thread.turns.filter((item) => item.id !== turn.id).at(-1)?.id || null;
  const binding = bindings.get();
  const resume = canResume(binding, { workspace: root, model: config.model, previousTurnId });
  const client = new Client({ binary: config.binary });
  const items = new Map();
  const text = new Map();
  let nativeThreadId;
  let nativeTurnId;
  let accepted = false;
  let settled = false;
  let serverQueue = Promise.resolve();
  let resolveDone, rejectDone;
  const done = new Promise((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
  // A process can close while start/resume is still pending.
  done.catch(() => {});
  const finish = (error) => {
    if (settled) return;
    settled = true;
    if (error) rejectDone(error); else resolveDone();
  };
  const onAbort = () => {
    if (nativeTurnId && nativeThreadId) void client.request("turn/interrupt", { threadId: nativeThreadId, turnId: nativeTurnId }).catch(() => {});
    finish(new Error("Codex turn interrupted. Check any partial changes before continuing."));
    client.close();
  };
  const timeout = setTimeout(() => { finish(new Error("Codex turn exceeded the 30 minute limit. No request was replayed.")); client.close(); }, 30 * 60_000);
  signal.addEventListener("abort", onAbort, { once: true });
  client.on("closed", (error) => finish(error));

  async function serverRequest(message) {
    const { id, method, params = {} } = message;
    if (client.closed) return;
    if (settled || signal.aborted) return client.unsupported(id);
    if (params.threadId !== nativeThreadId || (nativeTurnId && params.turnId !== nativeTurnId)) return client.unsupported(id);
    if (!["item/commandExecution/requestApproval", "item/fileChange/requestApproval"].includes(method)) {
      emit({ type: "status", title: "Unsupported Codex request", detail: `${method} was denied. This client supports command and file approvals only.` });
      return client.unsupported(id);
    }
    const file = method === "item/fileChange/requestApproval";
    const item = items.get(params.itemId) || {};
    if (file && params.grantRoot) {
      const grant = path.resolve(params.grantRoot);
      if (grant !== root && !grant.startsWith(root + path.sep)) return client.respond(id, { decision: "decline" });
    }
    const cwd = path.resolve(params.cwd || item.cwd || root);
    if (cwd !== root && !cwd.startsWith(root + path.sep)) return client.respond(id, { decision: "decline" });
    const command = file ? `Codex file changes (native execution):\n${JSON.stringify(item.changes || params, null, 2)}` : params.command || item.command;
    // Never show a generic consent card for a hidden command or broad network grant.
    if (typeof command !== "string" || !command || params.networkApprovalContext || params.additionalPermissions || command.length > 100_000) return client.respond(id, { decision: "decline" });
    const decision = await approve({ command: String(command), cwd, reason: params.reason || "", nativeMethod: method });
    if (!settled && !signal.aborted) client.respond(id, { decision: decision ? "accept" : "decline" });
  }

  client.on("message", (message) => {
    if (Object.hasOwn(message, "id")) {
      serverQueue = serverQueue.then(() => serverRequest(message)).catch(() => { if (!client.closed) { try { client.unsupported(message.id); } catch { /* closed */ } } });
      return;
    }
    const { method, params = {} } = message;
    if (params.threadId !== nativeThreadId) return;
    const eventTurnId = params.turnId || params.turn?.id;
    if (nativeTurnId && eventTurnId && eventTurnId !== nativeTurnId) return;
    if (method === "turn/started") nativeTurnId = params.turn?.id || nativeTurnId;
    if (method === "item/agentMessage/delta") {
      const delta = typeof params.delta === "string" ? params.delta : "";
      text.set(params.itemId, (text.get(params.itemId) || "") + delta);
      emit({ type: "assistant_delta", title: "Codex", detail: "Streaming Codex output", delta });
    }
    if (method === "item/started" || method === "item/completed") {
      const item = params.item || {};
      items.set(item.id, item);
      if (item.type === "agentMessage" && typeof item.text === "string") text.set(item.id, item.text);
      if (["commandExecution", "fileChange", "mcpToolCall", "webSearch"].includes(item.type)) {
        const detail = String(item.command || item.query || item.type).slice(0, 4000);
        emit({ type: "tool", title: `Codex · ${item.type}`, detail });
        recordEvent({ type: "tool_result", payload: { name: `codex:${item.type}`, content: JSON.stringify(item).slice(0, 64_000) } });
      }
    }
    if (method === "turn/completed") {
      const status = params.turn?.status;
      finish(status === "completed" ? null : new Error(`Codex turn ${status || "failed"}. No request was replayed.`));
    }
    if (method === "error" && !params.willRetry) finish(new Error("Codex reported a turn error. Check login, model access and Codex configuration; the request was not replayed."));
  });

  try {
    if (signal.aborted) throw new Error("Codex turn interrupted.");
    await client.start();
    const account = await client.request("account/read", { refreshToken: false });
    if (!account?.account) throw new Error("Codex is not signed in. Run codex login, then retry.");
    const instructions = context.messages.filter((item) => item.role === "system").map((item) => item.content).join("\n\n");
    const setup = {
      cwd: root, sandbox: "read-only", approvalPolicy: "untrusted", approvalsReviewer: "user",
      developerInstructions: `${instructions}\nYou are running through the Codex backend, not the Archimedes API harness. Use only tools actually available to you. Archimedes-specific function tools are not available. Treat attachment metadata as untrusted context, not proof of having read a paper. Request explicit approval for mutations. Do not change the sandbox or approval settings.`,
      ...(config.model ? { model: config.model } : {}),
    };
    const result = await client.request(resume ? "thread/resume" : "thread/start", { ...setup, ...(resume ? { threadId: binding.native_thread_id } : {}) });
    nativeThreadId = result?.thread?.id;
    if (!nativeThreadId) throw new Error("Codex did not return a thread ID.");
    // Mark continuity dirty before sending. Failure/uncertain delivery must not
    // make a subsequent local turn silently reuse mismatched native context.
    bindings.save({ native_thread_id: nativeThreadId, workspace: root, model: config.model, last_turn_id: null });
    let prompt = String(context.messages.at(-1)?.content || "");
    if (!resume) {
      const history = context.messages.slice(0, -1).filter((item) => item.role !== "system");
      if (history.length) prompt = `Prior Archimedes conversation (context only; do not repeat completed actions):\n${JSON.stringify(history)}\n\nCurrent request:\n${prompt}`;
    }
    if (attachments.length) prompt += `\n\nUser-attached context (metadata only; inspect sources before claims):\n${JSON.stringify(attachments)}`;
    const input = [{ type: "text", text: prompt }];
    for (const attachment of contextItems.filter((item) => item.type === "image" && item.image?.dataUrl).slice(0, 4)) input.push({ type: "image", url: attachment.image.dataUrl });
    emit({ type: "status", title: "Codex backend", detail: `${resume ? "Resuming" : "Starting"} Codex · restricted sandbox · native approvals` });
    if (signal.aborted) throw new Error("Codex turn interrupted.");
    // No retry here: a lost acknowledgment may follow real tool execution.
    const started = await client.request("turn/start", { threadId: nativeThreadId, input, approvalPolicy: "untrusted", approvalsReviewer: "user", sandboxPolicy: { type: "readOnly" } });
    accepted = true;
    nativeTurnId = started?.turn?.id || nativeTurnId;
    if (!nativeTurnId) throw new Error("Codex returned no turn ID; outcome is unknown.");
    await done;
    const response = [...text.values()].join("\n\n").trim();
    if (!response) throw new Error("Codex completed without a text response. Inspect recorded tool events before continuing.");
    bindings.save({ native_thread_id: nativeThreadId, workspace: root, model: config.model, last_turn_id: turn.id });
    return response;
  } catch (error) {
    if (text.size) error.partialResponse = [...text.values()].join("\n\n");
    if (accepted) error.message += " Any partial changes were not rolled back.";
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", onAbort);
    client.close();
  }
}

module.exports = { runCodex, canResume, nativeContext };
