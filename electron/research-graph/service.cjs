const { createHash } = require("node:crypto");
const store = require("../store.cjs");
const {
  EDGE_KINDS,
  NODE_KINDS,
  isEdgeKind,
  isNodeKind,
  isNodeStatus,
  edgeAllowed,
  isStructuralEdge,
  defaultEdgeKind,
} = require("./constants.cjs");

const MAX_CONTENT_BYTES = 1_000_000;
const MAX_TITLE_CHARS = 200;
const MAX_SUMMARY_CHARS = 500;
const MAX_PATCH_NODES = 6;
const MAX_PATCH_EDGES = 8;

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = stableValue(value[key]);
      return result;
    }, {});
  }
  return value;
}

function serializeContent(content) {
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    throw new Error("Research node content must be a JSON object.");
  }
  const json = JSON.stringify(stableValue(content));
  if (Buffer.byteLength(json, "utf8") > MAX_CONTENT_BYTES) {
    throw new Error("Research node content is too large.");
  }
  return json;
}

function contentHash(contentJson) {
  return createHash("sha256").update(contentJson).digest("hex");
}

function normalizeTitle(title) {
  const value = String(title || "").replace(/\s+/g, " ").trim();
  if (!value) throw new Error("A research node title is required.");
  if (value.length > MAX_TITLE_CHARS) throw new Error(`Research node titles are limited to ${MAX_TITLE_CHARS} characters.`);
  return value;
}

function normalizeSummary(summary) {
  return String(summary || "").trim().slice(0, MAX_SUMMARY_CHARS);
}

function normalizeParents(parents, nodeKind, projectId) {
  if (parents == null) return [];
  if (!Array.isArray(parents)) throw new Error("Research node parents must be an array.");
  if (parents.length > 8) throw new Error("A research node accepts at most eight parents.");
  return parents.map((parent) => {
    if (!parent || typeof parent !== "object" || typeof parent.nodeId !== "string" || !parent.nodeId) {
      throw new Error("Each parent requires a node id.");
    }
    const parentNode = store.getResearchNode(parent.nodeId);
    if (!parentNode) throw new Error(`Parent research node not found: ${parent.nodeId}`);
    if (parentNode.archived) throw new Error("An archived node cannot be a parent.");
    if (parentNode.project_id !== projectId) throw new Error("Parents must belong to the same project as the new node.");
    let kind = parent.kind;
    if (kind == null) kind = defaultEdgeKind(parentNode.kind, nodeKind);
    if (!isEdgeKind(kind)) throw new Error(`An explicit parent edge kind is required from ${parentNode.kind} to ${nodeKind}.`);
    if (!edgeAllowed(kind, parentNode.kind, nodeKind)) {
      throw new Error(`A ${kind} edge cannot connect ${parentNode.kind} to ${nodeKind}.`);
    }
    return {
      nodeId: parentNode.id,
      revisionId: parent.revisionId || parentNode.current_revision_id,
      kind,
      metadata: parent.metadata && typeof parent.metadata === "object" ? parent.metadata : {},
      node: parentNode,
    };
  });
}

function assertParentsComplete(kind, parents) {
  if (["experiment", "result"].includes(kind) && parents.length === 0) {
    throw new Error(`A ${kind} node requires at least one parent.`);
  }
  const mergeParents = parents.filter((parent) => parent.kind === "merges");
  if (mergeParents.length) {
    if (mergeParents.length !== parents.length) throw new Error("A merge node cannot mix merge edges with other parent edges.");
    if (parents.length < 2) throw new Error("A merge requires at least two parents.");
  }
}

function structuralAdjacency(edges) {
  const adjacency = new Map();
  for (const edge of edges) {
    if (!isStructuralEdge(edge.kind)) continue;
    if (!adjacency.has(edge.from_node)) adjacency.set(edge.from_node, []);
    adjacency.get(edge.from_node).push(edge.to_node);
  }
  return adjacency;
}

function assertAcyclic(projectId, proposedEdges = []) {
  const edges = store.listResearchEdges({ projectId }).concat(proposedEdges);
  const adjacency = structuralAdjacency(edges);
  const visiting = new Set();
  const visited = new Set();
  const visit = (nodeId) => {
    if (visiting.has(nodeId)) throw new Error("This edge would create a cycle in the research graph.");
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    for (const next of adjacency.get(nodeId) || []) visit(next);
    visiting.delete(nodeId);
    visited.add(nodeId);
  };
  for (const nodeId of adjacency.keys()) visit(nodeId);
}

function createNode({
  projectId,
  kind,
  status = "draft",
  title,
  summary = "",
  content = {},
  parents = [],
  sourceTurnId = null,
  sourceEventId = null,
  author,
} = {}) {
  if (!isNodeKind(kind)) throw new Error(`Unknown research node kind: ${kind}`);
  if (!isNodeStatus(status)) throw new Error(`Unknown research node status: ${status}`);
  const contentJson = serializeContent(content);
  const normalizedParents = normalizeParents(parents, kind, projectId);
  assertParentsComplete(kind, normalizedParents);
  const node = store.createResearchNode({
    projectId,
    kind,
    status,
    title: normalizeTitle(title),
    summary: normalizeSummary(summary),
    contentJson,
    contentHash: contentHash(contentJson),
    parents: normalizedParents.map(({ node, ...parent }) => parent),
    sourceTurnId,
    sourceEventId,
    createdBy: author || undefined,
  });
  return node;
}

function reviseNode({
  nodeId,
  title,
  summary,
  content,
  sourceTurnId = null,
  sourceEventId = null,
  gitCommit = null,
  author,
} = {}) {
  if (!nodeId) throw new Error("A research node id is required.");
  if (content == null) throw new Error("Revision content is required.");
  const node = store.getResearchNode(nodeId);
  if (!node) throw new Error("Research node not found.");
  const contentJson = serializeContent(content);
  const nextHash = contentHash(contentJson);
  const nextTitle = title == null ? null : normalizeTitle(title);
  const nextSummary = summary == null ? null : normalizeSummary(summary);
  if (
    nextHash === node.current_revision?.content_hash
    && (nextTitle == null || nextTitle === node.title)
    && (nextSummary == null || nextSummary === node.summary)
  ) {
    return node;
  }
  return store.reviseResearchNode({
    nodeId,
    title: nextTitle,
    summary: nextSummary,
    contentJson,
    contentHash: nextHash,
    sourceTurnId,
    sourceEventId,
    gitCommit,
    createdBy: author || undefined,
  });
}

function linkNodes({
  fromNodeId,
  toNodeId,
  kind,
  fromRevisionId = null,
  toRevisionId = null,
  metadata = {},
  author,
} = {}) {
  if (!isEdgeKind(kind)) throw new Error(`Unknown research edge kind: ${kind}`);
  if (!fromNodeId || !toNodeId) throw new Error("Both research node ids are required.");
  if (fromNodeId === toNodeId) throw new Error("A research node cannot link to itself.");
  const from = store.getResearchNode(fromNodeId);
  const to = store.getResearchNode(toNodeId);
  if (!from || !to) throw new Error("Both research nodes must exist.");
  if (from.project_id !== to.project_id) throw new Error("Research edges must connect nodes in the same project.");
  if (from.archived || to.archived) throw new Error("Restore archived nodes before linking them.");
  if (!edgeAllowed(kind, from.kind, to.kind)) {
    throw new Error(`A ${kind} edge cannot connect ${from.kind} to ${to.kind}.`);
  }
  if (store.findResearchEdge({ fromNodeId, toNodeId, kind })) {
    throw new Error("This research edge already exists.");
  }
  if (isStructuralEdge(kind)) {
    assertAcyclic(from.project_id, [{ from_node: fromNodeId, to_node: toNodeId, kind }]);
  }
  return store.linkResearchNodes({
    fromNodeId,
    toNodeId,
    kind,
    fromRevisionId: fromRevisionId || from.current_revision_id,
    toRevisionId: toRevisionId || to.current_revision_id,
    metadataJson: JSON.stringify(metadata && typeof metadata === "object" ? metadata : {}),
    createdBy: author || undefined,
  });
}

function normalizePatch(patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("A graph patch must be an object.");
  const inputNodes = patch.nodes == null ? [] : patch.nodes;
  const inputEdges = patch.edges == null ? [] : patch.edges;
  if (!Array.isArray(inputNodes) || !Array.isArray(inputEdges)) throw new Error("Graph patch nodes and edges must be arrays.");
  if (inputNodes.length > MAX_PATCH_NODES) throw new Error(`A graph patch can add at most ${MAX_PATCH_NODES} nodes.`);
  if (inputEdges.length > MAX_PATCH_EDGES) throw new Error(`A graph patch can add at most ${MAX_PATCH_EDGES} edges.`);
  const ids = new Set();
  const nodes = inputNodes.map((node, index) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) throw new Error(`Graph patch node ${index + 1} must be an object.`);
    const tempId = String(node.tempId ?? node.id ?? "").trim();
    if (!tempId || tempId.length > 80) throw new Error("Every new graph node needs a short temporary id.");
    if (ids.has(tempId)) throw new Error(`Duplicate graph patch node id: ${tempId}`);
    ids.add(tempId);
    if (!isNodeKind(node.kind)) throw new Error(`Unknown research node kind: ${node.kind}`);
    const status = node.status || "draft";
    if (!isNodeStatus(status)) throw new Error(`Unknown research node status: ${status}`);
    const content = node.content && typeof node.content === "object" && !Array.isArray(node.content) ? node.content : {};
    serializeContent(content);
    return {
      tempId,
      kind: node.kind,
      status,
      title: normalizeTitle(node.title),
      summary: normalizeSummary(node.summary),
      content,
    };
  });
  const edgeKeys = new Set();
  const edges = inputEdges.map((edge, index) => {
    if (!edge || typeof edge !== "object" || Array.isArray(edge)) throw new Error(`Graph patch edge ${index + 1} must be an object.`);
    const from = String(edge.from ?? edge.source ?? edge.fromNodeId ?? "").trim();
    const to = String(edge.to ?? edge.target ?? edge.toNodeId ?? "").trim();
    if (!from || !to) throw new Error("Every graph patch edge needs from and to.");
    if (from === to) throw new Error("A graph patch edge cannot connect a node to itself.");
    if (!isEdgeKind(edge.kind)) throw new Error(`Unknown research edge kind: ${edge.kind}`);
    const key = `${from}->${to}:${edge.kind}`;
    if (edgeKeys.has(key)) throw new Error("A graph patch cannot contain duplicate edges.");
    edgeKeys.add(key);
    return { from, to, kind: edge.kind, metadata: edge.metadata && typeof edge.metadata === "object" ? edge.metadata : {} };
  });
  return { nodes, edges, reason: String(patch.reason || "").trim().slice(0, 1000) };
}

function titleKey(kind, title) {
  return `${kind}|${String(title || "").normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, " ").trim()}`;
}

function edgeEndpoint(edge, key) {
  return edge[key] ?? edge[key === "from" ? "from_node" : "to_node"];
}

function assertPatchAcyclic(nodeIds, existingEdges, patchEdges) {
  const adjacency = new Map(nodeIds.map((id) => [id, []]));
  const add = (from, to, kind) => {
    if (!isStructuralEdge(kind)) return;
    if (!adjacency.has(from)) adjacency.set(from, []);
    adjacency.get(from).push(to);
  };
  for (const edge of existingEdges) add(edgeEndpoint(edge, "from"), edgeEndpoint(edge, "to"), edge.kind);
  for (const edge of patchEdges) add(edge.from, edge.to, edge.kind);
  const visiting = new Set();
  const visited = new Set();
  const visit = (nodeId) => {
    if (visiting.has(nodeId)) throw new Error("This graph patch would create a cycle in the research graph.");
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    for (const next of adjacency.get(nodeId) || []) visit(next);
    visiting.delete(nodeId);
    visited.add(nodeId);
  };
  for (const nodeId of adjacency.keys()) visit(nodeId);
}

// Apply a bounded extractor patch in one logical operation. The whole patch is
// validated before writing; a failed write archives any nodes it already made.
function applyPatch({ projectId, threadId = null, turnId = null, patch, author } = {}) {
  if (!projectId) throw new Error("A project is required to apply a graph patch.");
  const normalized = normalizePatch(patch);
  const existing = store.listResearchGraph({ projectId });
  const existingEdges = store.listResearchEdges({ projectId });
  const existingEdgeIds = new Set(existingEdges.map((edge) => edge.id));
  const existingById = new Map(existing.nodes.map((node) => [node.id, node]));
  const existingKeys = new Map();
  for (const node of existing.nodes) existingKeys.set(titleKey(node.kind, node.title), node.id);

  const resolved = new Map();
  const newNodes = [];
  const skippedNodes = [];
  for (const node of normalized.nodes) {
    const duplicateId = existingKeys.get(titleKey(node.kind, node.title));
    if (duplicateId) {
      resolved.set(node.tempId, duplicateId);
      skippedNodes.push({ tempId: node.tempId, nodeId: duplicateId, reason: "duplicate" });
      continue;
    }
    resolved.set(node.tempId, null);
    newNodes.push(node);
  }

  const kindById = new Map(existing.nodes.map((node) => [node.id, node.kind]));
  for (const node of normalized.nodes) kindById.set(node.tempId, node.kind);
  const edges = [];
  const skippedEdges = [];
  for (const edge of normalized.edges) {
    const fromKind = kindById.get(edge.from);
    const toKind = kindById.get(edge.to);
    if (!fromKind) throw new Error(`Graph patch edge source not found: ${edge.from}`);
    if (!toKind) throw new Error(`Graph patch edge target not found: ${edge.to}`);
    if (!edgeAllowed(edge.kind, fromKind, toKind)) throw new Error(`A ${edge.kind} edge cannot connect ${fromKind} to ${toKind}.`);
    const fromId = resolved.get(edge.from);
    const toId = resolved.get(edge.to);
    if (fromId && toId && fromId === toId) {
      skippedEdges.push({ ...edge, reason: "duplicate-node" });
      continue;
    }
    if (fromId && toId && store.findResearchEdge({ fromNodeId: fromId, toNodeId: toId, kind: edge.kind })) {
      skippedEdges.push({ ...edge, reason: "duplicate-edge" });
      continue;
    }
    edges.push(edge);
  }

  const newIds = new Set(newNodes.map((node) => node.tempId));
  const inDegree = new Map(newNodes.map((node) => [node.tempId, 0]));
  const outgoing = new Map(newNodes.map((node) => [node.tempId, []]));
  const incoming = new Map(newNodes.map((node) => [node.tempId, []]));
  for (const edge of edges) {
    if (incoming.has(edge.to)) incoming.get(edge.to).push(edge);
    if (newIds.has(edge.from) && newIds.has(edge.to)) {
      outgoing.get(edge.from).push(edge.to);
      inDegree.set(edge.to, inDegree.get(edge.to) + 1);
    }
  }
  const queue = newNodes.filter((node) => inDegree.get(node.tempId) === 0).map((node) => node.tempId);
  const order = [];
  while (queue.length) {
    const tempId = queue.shift();
    order.push(tempId);
    for (const next of outgoing.get(tempId) || []) {
      inDegree.set(next, inDegree.get(next) - 1);
      if (inDegree.get(next) === 0) queue.push(next);
    }
  }
  if (order.length !== newNodes.length) throw new Error("The graph patch contains a structural cycle.");
  for (const node of newNodes) {
    const parents = incoming.get(node.tempId) || [];
    if (parents.length > 8) throw new Error("A research node accepts at most eight parents.");
    if (node.kind === "experiment" && !parents.some((edge) => edge.kind === "tests")) {
      throw new Error("An experiment must test a question or idea.");
    }
    if (node.kind === "result" && !parents.some((edge) => edge.kind === "produces")) {
      throw new Error("A result must be produced by an experiment.");
    }
    if (node.kind === "writing" && node.status !== "draft" && !edges.some((edge) => edge.from === node.tempId && edge.kind === "cites")) {
      throw new Error("A non-draft writing node must cite a result.");
    }
    const merges = parents.filter((edge) => edge.kind === "merges");
    if (merges.length && merges.length !== parents.length) throw new Error("A merge node cannot mix merge edges with other parent edges.");
    if (merges.length && parents.length < 2) throw new Error("A merge requires at least two parents.");
  }
  assertPatchAcyclic(
    [...existing.nodes.map((node) => node.id), ...newNodes.map((node) => node.tempId)],
    existingEdges,
    edges,
  );

  const createdNodes = [];
  const appliedEdges = new Set();
  try {
    for (const tempId of order) {
      const node = newNodes.find((candidate) => candidate.tempId === tempId);
      const parents = (incoming.get(tempId) || []).map((edge) => {
        const fromId = resolved.get(edge.from) || (existingById.has(edge.from) ? edge.from : null);
        if (!fromId) throw new Error(`Parent research node has not been created: ${edge.from}`);
        return { nodeId: fromId, kind: edge.kind, metadata: edge.metadata };
      });
      const created = createNode({
        projectId,
        kind: node.kind,
        status: node.status,
        title: node.title,
        summary: node.summary,
        content: node.content,
        parents,
        sourceTurnId: turnId,
        sourceEventId: null,
        author,
      });
      resolved.set(tempId, created.id);
      createdNodes.push(created);
      for (const edge of incoming.get(tempId) || []) appliedEdges.add(edge);
    }
    for (const edge of edges) {
      if (appliedEdges.has(edge)) continue;
      const fromId = resolved.get(edge.from) || (existingById.has(edge.from) ? edge.from : null);
      const toId = resolved.get(edge.to) || (existingById.has(edge.to) ? edge.to : null);
      if (!fromId || !toId) throw new Error("Graph patch edge references an unknown node.");
      if (fromId === toId) { skippedEdges.push({ ...edge, reason: "duplicate-node" }); continue; }
      if (store.findResearchEdge({ fromNodeId: fromId, toNodeId: toId, kind: edge.kind })) {
        skippedEdges.push({ ...edge, reason: "duplicate-edge" });
        continue;
      }
      linkNodes({
        fromNodeId: fromId,
        toNodeId: toId,
        kind: edge.kind,
        metadata: { ...edge.metadata, sourceTurnId: turnId },
        author,
      });
    }
    const createdEdges = store.listResearchEdges({ projectId }).filter((edge) => !existingEdgeIds.has(edge.id));
    return { projectId, threadId, turnId, createdNodes, createdEdges, skippedNodes, skippedEdges, reason: normalized.reason };
  } catch (error) {
    for (const node of createdNodes) {
      try { store.archiveResearchNode({ nodeId: node.id, reason: "Automatic graph patch rollback", createdBy: author || undefined }); } catch { /* best effort */ }
    }
    throw error;
  }
}

function listGraph({ projectId, includeArchived = false } = {}) {
  return store.listResearchGraph({ projectId, includeArchived });
}

function getNodeHistory(nodeId) {
  return store.getResearchNodeHistory(nodeId);
}

function archiveNode({ nodeId, reason = "", author } = {}) {
  return store.archiveResearchNode({ nodeId, reason, createdBy: author || undefined });
}

function restoreNode({ nodeId, author } = {}) {
  return store.restoreResearchNode({ nodeId, createdBy: author || undefined });
}

function validateGraph({ projectId } = {}) {
  if (!projectId) throw new Error("A project is required to validate the research graph.");
  const graph = store.listResearchGraph({ projectId, includeArchived: true });
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const issues = [];
  const push = (code, message, extra = {}) => issues.push({ code, message, ...extra });
  const incoming = new Map();
  const outgoing = new Map();
  for (const node of graph.nodes) {
    incoming.set(node.id, []);
    outgoing.set(node.id, []);
  }
  for (const edge of graph.edges) {
    incoming.get(edge.to_node)?.push(edge);
    outgoing.get(edge.from_node)?.push(edge);
  }
  for (const node of graph.nodes) {
    if (!node.current_revision_id || !node.current_revision) {
      push("node_without_revision", "Every research node needs a current revision.", { nodeId: node.id });
    } else if (node.current_revision.node_id !== node.id) {
      push("revision_node_mismatch", "The current revision belongs to another node.", { nodeId: node.id });
    }
    const inbound = incoming.get(node.id) || [];
    const outbound = outgoing.get(node.id) || [];
    if (node.kind === "experiment" && !inbound.some((edge) => edge.kind === "tests")) {
      push("experiment_without_idea", "An experiment must test a question or idea.", { nodeId: node.id });
    }
    if (node.kind === "result" && !inbound.some((edge) => edge.kind === "produces")) {
      push("result_without_experiment", "A result must be produced by an experiment.", { nodeId: node.id });
    }
    if (node.kind === "writing" && node.status !== "draft" && !outbound.some((edge) => edge.kind === "cites")) {
      push("writing_without_evidence", "A non-draft writing node must cite a result.", { nodeId: node.id });
    }
    const merges = inbound.filter((edge) => edge.kind === "merges");
    if (merges.length === 1) {
      push("incomplete_merge", "A merge node needs at least two parents.", { nodeId: node.id });
    }
  }
  for (const edge of graph.edges) {
    const from = nodes.get(edge.from_node);
    const to = nodes.get(edge.to_node);
    if (!from || !to) {
      push("edge_missing_node", "Every edge must connect two existing nodes.", { edgeId: edge.id });
      continue;
    }
    if (!edgeAllowed(edge.kind, from.kind, to.kind)) {
      push("edge_kind_mismatch", `A ${edge.kind} edge cannot connect ${from.kind} to ${to.kind}.`, { edgeId: edge.id });
    }
    if (edge.from_revision && edge.from_revision !== from.current_revision_id && !store.getResearchNodeHistory(from.id).some((revision) => revision.id === edge.from_revision)) {
      push("edge_revision_mismatch", "The source revision does not belong to its node.", { edgeId: edge.id });
    }
    if (edge.to_revision && edge.to_revision !== to.current_revision_id && !store.getResearchNodeHistory(to.id).some((revision) => revision.id === edge.to_revision)) {
      push("edge_revision_mismatch", "The target revision does not belong to its node.", { edgeId: edge.id });
    }
  }
  try {
    assertAcyclic(projectId);
  } catch (error) {
    push("graph_cycle", error.message);
  }
  return { projectId, ok: issues.length === 0, issues };
}

module.exports = {
  EDGE_KINDS,
  NODE_KINDS,
  createNode,
  reviseNode,
  linkNodes,
  applyPatch,
  listGraph,
  getNodeHistory,
  archiveNode,
  restoreNode,
  validateGraph,
  serializeContent,
  contentHash,
};
