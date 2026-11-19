const { randomUUID } = require("node:crypto");
const store = require("../store.cjs");
const graph = require("./service.cjs");
const { EDGE_RULES } = require("./constants.cjs");

const MAX_PROMPT_GRAPH_NODES = 80;
const MAX_PROMPT_GRAPH_EDGES = 120;
const MAX_RESPONSE_CHARS = 24_000;
const EXTRACTION_TIMEOUT_MS = 120_000;
const inFlight = new Set();

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

function buildExtractionPrompt({ userPrompt, assistantResponse, graph: listedGraph, stage = "research" }) {
  const experimentStage = stage === "experiment-setup";
  const allowedKinds = [
    "- question: the research question this session is trying to answer.",
    "- idea: a testable hypothesis.",
    "- experiment: a concrete experiment explicitly undertaken or planned for an existing idea.",
    "- result: an outcome actually reported in the conversation; never imply a managed run exists.",
  ];
  const allowedEdgeKinds = ["generates", "refines", "tests", "extends", "replicates", "produces"];
  const edgeRules = allowedEdgeKinds
    .map((kind) => `${kind}: ${EDGE_RULES[kind].map(([from, to]) => `${from}->${to}`).join(", ")}`)
    .join("\n");
  const stageRules = [
    experimentStage ? "This is the Experiment setup stage." : "This is a Research conversation, which may contain idea discussion or actual experimentation.",
    "Create an experiment node only when the user has explicitly requested validation of an idea and the answer describes a concrete plan or execution, or the answer clearly reports an experiment actually undertaken. A hypothetical suggestion alone is not an experiment.",
    "Every experiment must have at least one tests edge from an idea. Never link an experiment directly to a question; if the tested idea is ambiguous, do not guess or create the experiment.",
    "One idea may have multiple experiments. Attach each experiment only to the ideas it actually tests.",
    "Create result nodes only when the answer reports an actual outcome, measurement or observation. A plan or promise to run is not a result. Put the reported evidence in content.evidence and its interpretation in content.interpretation.",
    "Conversation extraction records a reported result, not a managed Run; never assert that a run, code snapshot, log, or exit status exists without explicit evidence.",
    "Keep preparation, reproduction, environment setup, baselines, command retries and troubleshooting inside the experiment's details. Do not create separate experiment nodes merely for those steps.",
    "Do not create writing nodes in this stage.",
    "Allowed edges are only generates, refines, tests, extends, replicates, and produces. Do not create feedback, merges, or cites edges.",
    "When the plan builds on an existing experiment, link it with an extends edge as well as the idea tests edge.",
  ];
  const shape = {
      nodes: [
        { id: "n1", kind: "question", title: "...", summary: "...", content: { question: "..." } },
        { id: "n2", kind: "idea", title: "...", summary: "...", content: { hypothesis: "...", prediction: "..." } },
        { id: "n3", kind: "experiment", title: "...", summary: "...", content: { hypothesis: "...", baseline: "...", method: "...", metrics: ["..."], stopCriteria: "..." } },
        { id: "n4", kind: "result", title: "...", summary: "...", content: { evidence: { metrics: {}, note: "..." }, interpretation: { verdict: "supports", reasoning: "..." } } },
      ],
      edges: [
        { from: "n1", to: "n2", kind: "generates" },
        { from: "n2", to: "n3", kind: "tests" },
        { from: "n3", to: "n4", kind: "produces" },
      ],
      supersede: [{ nodeId: "existing-idea-id", reason: "Superseded by the new idea round" }],
      reason: "short explanation",
    };
  return [
    "You extract research objects from one Research conversation turn into a graph patch.",
    "Return ONLY one JSON object. Do not use tools, run commands, invoke any skill (including idea-spark), or wrap the JSON in Markdown.",
    "",
    "Existing session graph (use these node ids for links; do not duplicate existing nodes):",
    JSON.stringify(compactGraph(listedGraph)),
    "",
    "User request:",
    clip(userPrompt, 12_000),
    "",
    "Assistant answer:",
    clip(assistantResponse, MAX_RESPONSE_CHARS),
    "",
    "Allowed node kinds:",
    ...allowedKinds,
    "",
    "Allowed edges:",
    edgeRules,
    "",
    "Rules:",
    "- Add at most 6 nodes and 8 edges. Prefer 0-4 nodes for a short answer.",
    ...stageRules,
    "- Only create a node when the answer clearly supports it. Do not invent papers, numbers, runs, or claims.",
    "- New nodes must use temp ids n1, n2, ... . Existing nodes must use their real id.",
    "- Link new nodes to existing nodes when the answer clearly continues an existing thread.",
    "- If the request is a follow-up to an existing question, link new objects to that existing question instead of creating another question node.",
    "- Do not duplicate an existing node with the same kind and title.",
    "- A new idea round supersedes the previous one. When this turn presents a new set of idea alternatives for the same question, list the previous idea nodes under that question in `supersede`. The app also retires previous direct idea children automatically when the patch adds at least two new ideas, so use `supersede` mainly to provide a specific reason or to retire an additional idea.",
    "- Only idea nodes can be superseded. Never supersede question or experiment nodes.",
    "- Use the user's language for titles and summaries. Titles <= 120 characters; summaries <= 240 characters.",
    "- content must be a compact JSON object. Suggested fields:",
    "  question: { question }",
    "  idea: { hypothesis, prediction }",
    "  experiment: { hypothesis, baseline, method, metrics, stopCriteria }",
    "  result: { evidence, interpretation: { verdict, reasoning } }",
    "- If the answer contains no new research object, return {\"nodes\":[],\"edges\":[],\"reason\":\"no_new_objects\"}.",
    "",
    "Required JSON shape:",
    JSON.stringify(shape),
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
    maxOutputTokens: 6_000,
    reasoningEffort: "low",
    requireComplete: true,
    responseFormat: { type: "json_object" },
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
    ephemeral: config.backend === "codex",
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
  if (transient || origin !== "research" || !["research", "experiment-setup"].includes(mode) || !projectId || !threadId || !turnId) return null;
  if (!assistantResponse || String(assistantResponse).trim().length < 20) return null;
  const trimmedPrompt = String(userPrompt || "").trim();
  if (trimmedPrompt.length <= 12 && /^(你好|您好|hi|hello|hey|嗨|在吗|早上好|晚上好|谢谢|thanks|thank you)[!！。.\s]*$/i.test(trimmedPrompt)) return null;
  if (alreadyApplied(threadId, turnId)) return null;
  const key = `${threadId}:${turnId}`;
  if (inFlight.has(key)) throw new Error("Graph extraction is already in progress for this turn.");

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), EXTRACTION_TIMEOUT_MS);
  inFlight.add(key);
  try {
    emit({ type: "graph_update_pending", title: "Research graph", detail: "Extracting research objects from this turn" });
    const listedGraph = graph.listGraph({ projectId, threadId });
    const prompt = buildExtractionPrompt({ userPrompt, assistantResponse, graph: listedGraph, stage: mode });
    const runExtraction = async (nextPrompt) => {
      const text = backend === "api"
        ? await extractWithApi({ complete, config, prompt: nextPrompt, signal: controller.signal })
        : await extractWithNative({ runNative, config, workspace, prompt: nextPrompt, signal: controller.signal });
      if (controller.signal.aborted) throw new Error("Graph extraction timed out.");
      return graph.applyPatch({ projectId, threadId, turnId, patch: parseGraphPatch(text), allowResults: true });
    };
    let applied;
    try {
      applied = await runExtraction(prompt);
    } catch (firstError) {
      if (backend !== "api" || controller.signal.aborted || /No API model|unavailable/i.test(firstError?.message || "")) throw firstError;
      const retryPrompt = `${prompt}\n\nYour previous graph patch could not be applied: ${firstError?.message || String(firstError)}\nReturn ONLY a valid JSON object with at most 3 new nodes and 4 new edges. Do not include Markdown or commentary. Do not create result nodes unless the answer reports an actual outcome. Create experiment nodes only when the answer reports a concrete experiment plan.`;
      applied = await runExtraction(retryPrompt);
    }
    const createdNodeIds = applied.createdNodes.map((node) => node.id);
    const createdEdgeIds = applied.createdEdges.map((edge) => edge.id);
    const superseded = (applied.supersededNodes || []).map((node) => ({
      nodeId: node.nodeId,
      previousStatus: node.previousStatus,
      reason: node.reason,
    }));
    const supersededNodeIds = superseded.map((node) => node.nodeId);
    const nodeCount = createdNodeIds.length;
    const edgeCount = createdEdgeIds.length;
    const details = [];
    if (nodeCount) details.push(`${nodeCount} node${nodeCount === 1 ? "" : "s"}`);
    if (edgeCount) details.push(`${edgeCount} edge${edgeCount === 1 ? "" : "s"}`);
    if (superseded.length) details.push(`${superseded.length} previous idea${superseded.length === 1 ? "" : "s"} moved to history`);
    const detail = details.length ? `Added ${details.join(" · ")}` : (applied.reason || "No new research objects detected");
    if (nodeCount || edgeCount || superseded.length) {
      recordEvent({
        type: "graph_applied",
        payload: {
          projectId,
          createdNodeIds,
          createdEdgeIds,
          supersededNodeIds,
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
        superseded,
        nodeCount,
        edgeCount,
        skippedNodeCount: applied.skippedNodes.length,
        reason: applied.reason,
      },
    });
    return { ...applied, createdNodeIds, createdEdgeIds, supersededNodeIds, superseded };
  } catch (error) {
    console.warn("[research-graph] auto-build skipped:", error?.message || String(error));
    try {
      recordEvent({ type: "graph_failed", payload: { projectId, reason: String(error?.message || error).slice(0, 1000) } });
    } catch { /* keep the completed turn */ }
    emit({
      type: "graph_update",
      title: "Research graph",
      detail: "Graph extraction failed. Retry from Research graph.",
      graph: {
        projectId,
        threadId,
        turnId,
        createdNodeIds: [],
        createdEdgeIds: [],
        nodeCount: 0,
        edgeCount: 0,
        skippedNodeCount: 0,
        reason: "extraction_failed",
      },
    });
    return null;
  } finally {
    inFlight.delete(key);
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
