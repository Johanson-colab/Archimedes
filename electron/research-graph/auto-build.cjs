const { randomUUID } = require("node:crypto");
const store = require("../store.cjs");
const graph = require("./service.cjs");
const { EDGE_RULES } = require("./constants.cjs");

const MAX_PROMPT_GRAPH_NODES = 80;
const MAX_PROMPT_GRAPH_EDGES = 120;
const MAX_RESPONSE_CHARS = 24_000;
const EXTRACTION_TIMEOUT_MS = 120_000;

const EDGE_RULES_TEXT = Object.entries(EDGE_RULES)
  .map(([kind, rules]) => `${kind}: ${rules.map(([from, to]) => `${from}->${to}`).join(", ")}`)
  .join("\n");

function clip(value, max) {
  const text = String(value || "");
  if (text.length <= max) return text;
  return `${text.slice(0, Math.floor(max / 2))}\n\n...[truncated]...\n\n${text.slice(-Math.floor(max / 2))}`;
}

function compactGraph(listed) {
  return {
    nodes: (listed.nodes || []).slice(0, MAX_PROMPT_GRAPH_NODES).map((node) => ({
      id: node.id,
      kind: node.kind,
      title: node.title,
      summary: String(node.summary || "").slice(0, 240),
    })),
    edges: (listed.edges || []).slice(0, MAX_PROMPT_GRAPH_EDGES).map((edge) => ({
      from: edge.from_node,
      to: edge.to_node,
      kind: edge.kind,
    })),
  };
}

function buildExtractionPrompt({ userPrompt, assistantResponse, graph: listedGraph }) {
  return [
    "You extract research objects from one Research conversation turn into a graph patch.",
    "Return ONLY one JSON object. Do not use tools, run commands, invoke any skill (including idea-spark), or wrap the JSON in Markdown.",
    "",
    "Existing project graph (use these node ids for links; do not duplicate existing nodes):",
    JSON.stringify(compactGraph(listedGraph)),
    "",
    "User request:",
    clip(userPrompt, 12_000),
    "",
    "Assistant answer:",
    clip(assistantResponse, MAX_RESPONSE_CHARS),
    "",
    "Node kinds:",
    "- question: the research question the project is trying to answer.",
    "- idea: a testable hypothesis. Use status draft unless the answer clearly establishes it.",
    "- experiment: a concrete plan that tests a question or idea.",
    "- result: a measured outcome plus interpretation.",
    "- writing: a paper section or claim-bearing draft.",
    "",
    "Allowed edges:",
    EDGE_RULES_TEXT,
    "",
    "Rules:",
    "- Add at most 6 nodes and 8 edges. Prefer 0-4 nodes for a short answer.",
    "- Only create a node when the answer clearly supports it. Do not invent papers, numbers, runs, or claims.",
    "- New nodes must use temp ids n1, n2, ... . Existing nodes must use their real id.",
    "- Link new nodes to existing nodes when the answer clearly continues an existing thread.",
    "- If the request is a follow-up to an existing question, link new objects to that existing question instead of creating another question node.",
    "- Do not duplicate an existing node with the same kind and title.",
    "- Every experiment or result must have at least one incoming edge (tests or produces).",
    "- A merge needs at least two incoming merges edges.",
    "- Use the user's language for titles and summaries. Titles <= 120 characters; summaries <= 240 characters.",
    "- content must be a compact JSON object. Suggested fields:",
    "  question: { question }",
    "  idea: { hypothesis, prediction }",
    "  experiment: { plan }",
    "  result: { evidence, interpretation: { verdict, reasoning } }",
    "  writing: { section, claims }",
    "- If the answer contains no new research object, return {\"nodes\":[],\"edges\":[],\"reason\":\"no_new_objects\"}.",
    "",
    "Required JSON shape:",
    JSON.stringify({
      nodes: [
        { id: "n1", kind: "question", title: "...", summary: "...", content: { question: "..." } },
        { id: "n2", kind: "idea", title: "...", summary: "...", content: { hypothesis: "...", prediction: "..." } },
      ],
      edges: [{ from: "n1", to: "n2", kind: "generates" }],
      reason: "short explanation",
    }),
  ].join("\n");
}

function extractJsonObject(text) {
  const source = String(text || "").trim();
  if (!source) throw new Error("The graph extractor returned an empty response.");
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : source;
  const start = candidate.indexOf("{");
  if (start < 0) throw new Error("The graph extractor did not return a JSON object.");
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < candidate.length; index += 1) {
    const char = candidate[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') { inString = true; continue; }
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        const raw = candidate.slice(start, index + 1);
        try { return JSON.parse(raw); } catch (error) { throw new Error(`The graph extractor returned invalid JSON: ${error.message}`); }
      }
    }
  }
  throw new Error("The graph extractor returned an incomplete JSON object.");
}

function parseGraphPatch(text) {
  const parsed = extractJsonObject(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("The graph patch must be a JSON object.");
  return parsed;
}

async function extractWithApi({ complete, config, prompt, signal }) {
  if (!complete) throw new Error("API graph extraction is unavailable.");
  if (!config?.apiKey) throw new Error("No API model is configured for graph extraction.");
  const message = await complete(config, [
    {
      role: "system",
      content: "You are a strict research graph extractor. Return only a JSON object. Do not use tools or invoke any skill.",
    },
    { role: "user", content: prompt },
  ], {
    signal,
    allowTools: false,
    maxOutputTokens: 2_400,
    reasoningEffort: "low",
    requireComplete: true,
  });
  return message?.content || "";
}

function nativeExtractionConfig(config = {}) {
  return {
    ...config,
    permissionMode: config.backend === "codex" ? "read-only" : config.backend === "claude" ? "plan" : "ask",
  };
}

async function extractWithNative({ runNative, config, workspace, prompt, signal }) {
  if (!runNative) throw new Error("Native graph extraction is unavailable.");
  if (!config?.backend || config.backend === "api") throw new Error("Native graph extraction requires a native harness.");
  const thread = {
    id: randomUUID(),
    project_id: null,
    title: "Research graph extraction",
    mode: "research",
    context_summary: "",
    turns: [],
    events: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    archived_at: null,
    turn_count: 0,
    last_turn_at: null,
  };
  const turn = {
    id: randomUUID(),
    thread_id: thread.id,
    task_id: "research-graph-extraction",
    mode: "research",
    user_message: prompt,
    assistant_message: "",
    status: "running",
    created_at: new Date().toISOString(),
    completed_at: null,
  };
  return runNative({
    config: nativeExtractionConfig(config),
    workspace,
    thread,
    turn,
    contextItems: [],
    researchSkill: undefined,
    signal,
    emit: () => {},
    recordEvent: () => {},
    bindings: { get: () => null, save: () => {} },
    approve: async () => false,
    timeoutMs: EXTRACTION_TIMEOUT_MS,
  });
}

function alreadyApplied(threadId, turnId) {
  if (!threadId || !turnId) return false;
  try {
    const thread = store.getResearchThread(threadId);
    return Boolean(thread?.events?.some((event) =>
      (event.type === "graph_applied" || event.type === "graph_checked") && event.turn_id === turnId));
  } catch {
    return false;
  }
}

async function maybeAutoBuild({
  projectId,
  threadId,
  turnId,
  mode,
  origin,
  transient = false,
  backend = "api",
  config,
  workspace,
  userPrompt,
  assistantResponse,
  emit = () => {},
  recordEvent = () => {},
  complete,
  runNative,
  signal,
} = {}) {
  if (transient || origin !== "research" || mode !== "research" || !projectId || !threadId || !turnId) return null;
  if (!assistantResponse || String(assistantResponse).trim().length < 20) return null;
  const trimmedPrompt = String(userPrompt || "").trim();
  if (trimmedPrompt.length <= 12 && /^(你好|您好|hi|hello|hey|嗨|在吗|早上好|晚上好|谢谢|thanks|thank you)[!！。.\s]*$/i.test(trimmedPrompt)) return null;
  if (alreadyApplied(threadId, turnId)) return null;

  const listedGraph = graph.listGraph({ projectId });
  const prompt = buildExtractionPrompt({ userPrompt, assistantResponse, graph: listedGraph });
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), EXTRACTION_TIMEOUT_MS);
  emit({ type: "graph_update_pending", title: "Research graph", detail: "Extracting research objects from this turn" });
  try {
    const text = backend === "api"
      ? await extractWithApi({ complete, config, prompt, signal: controller.signal })
      : await extractWithNative({ runNative, config, workspace, prompt, signal: controller.signal });
    if (controller.signal.aborted) throw new Error("Graph extraction timed out.");
    const patch = parseGraphPatch(text);
    const applied = graph.applyPatch({ projectId, threadId, turnId, patch });
    const createdNodeIds = applied.createdNodes.map((node) => node.id);
    const createdEdgeIds = applied.createdEdges.map((edge) => edge.id);
    const nodeCount = createdNodeIds.length;
    const edgeCount = createdEdgeIds.length;
    const detail = nodeCount || edgeCount
      ? `Added ${nodeCount} node${nodeCount === 1 ? "" : "s"} and ${edgeCount} edge${edgeCount === 1 ? "" : "s"}`
      : (applied.reason || "No new research objects detected");
    if (nodeCount || edgeCount) {
      recordEvent({
        type: "graph_applied",
        payload: {
          projectId,
          createdNodeIds,
          createdEdgeIds,
          skippedNodeCount: applied.skippedNodes.length,
          reason: applied.reason,
        },
      });
    } else {
      recordEvent({
        type: "graph_checked",
        payload: {
          projectId,
          reason: applied.reason || "no_new_objects",
        },
      });
    }
    emit({
      type: "graph_update",
      title: "Research graph",
      detail,
      graph: {
        projectId,
        threadId,
        turnId,
        createdNodeIds,
        createdEdgeIds,
        nodeCount,
        edgeCount,
        skippedNodeCount: applied.skippedNodes.length,
        reason: applied.reason,
      },
    });
    return { ...applied, createdNodeIds, createdEdgeIds };
  } catch (error) {
    console.warn("[research-graph] auto-build skipped:", error?.message || String(error));
    emit({
      type: "graph_update",
      title: "Research graph",
      detail: "No graph changes were detected",
      graph: {
        projectId,
        threadId,
        turnId,
        createdNodeIds: [],
        createdEdgeIds: [],
        nodeCount: 0,
        edgeCount: 0,
        skippedNodeCount: 0,
        reason: "no_new_objects",
      },
    });
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

module.exports = {
  buildExtractionPrompt,
  extractJsonObject,
  parseGraphPatch,
  extractWithApi,
  extractWithNative,
  nativeExtractionConfig,
  maybeAutoBuild,
};
