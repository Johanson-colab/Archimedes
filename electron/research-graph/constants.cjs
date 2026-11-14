// Research graph vocabulary shared by the Electron service and tests.
//
// Keep this list in sync with src/research-graph/types.ts. The graph stores
// only meaningful research objects; runs and files are evidence attached to a
// node, not graph nodes themselves.

const NODE_KINDS = Object.freeze([
  "question",
  "idea",
  "experiment",
  "result",
  "writing",
]);

const NODE_STATUSES = Object.freeze(["draft", "active", "retracted"]);

const EDGE_KINDS = Object.freeze([
  "generates",
  "tests",
  "produces",
  "supports",
  "contradicts",
  "inconclusive",
  "informs",
  "decides",
  "refines",
  "merges",
  "extends",
  "replicates",
  "cites",
]);

// Allowed (from kind, to kind) pairs for every edge kind.
const EDGE_RULES = Object.freeze({
  generates: Object.freeze([["question", "idea"]]),
  tests: Object.freeze([
    ["question", "experiment"],
    ["idea", "experiment"],
  ]),
  produces: Object.freeze([["experiment", "result"]]),
  supports: Object.freeze([["result", "idea"]]),
  contradicts: Object.freeze([["result", "idea"]]),
  inconclusive: Object.freeze([["result", "idea"]]),
  informs: Object.freeze([["result", "idea"]]),
  decides: Object.freeze([
    ["result", "idea"],
    ["result", "experiment"],
  ]),
  refines: Object.freeze([
    ["question", "question"],
    ["idea", "idea"],
  ]),
  merges: Object.freeze([
    ["idea", "idea"],
    ["experiment", "experiment"],
    ["result", "result"],
  ]),
  extends: Object.freeze([["experiment", "experiment"]]),
  replicates: Object.freeze([["experiment", "experiment"]]),
  cites: Object.freeze([["writing", "result"]]),
});

// Edges that describe lineage. Feedback edges (supports/contradicts/informs/
// decides) may point backwards through the graph without creating a cycle.
const STRUCTURAL_EDGE_KINDS = Object.freeze([
  "generates",
  "tests",
  "produces",
  "refines",
  "merges",
  "extends",
  "replicates",
  "cites",
]);

const DEFAULT_EDGE_BY_PAIR = Object.freeze({
  "question->idea": "generates",
  "question->experiment": "tests",
  "idea->experiment": "tests",
  "experiment->result": "produces",
  "result->idea": "informs",
  "result->experiment": "decides",
  "question->question": "refines",
  "idea->idea": "refines",
  "experiment->experiment": "extends",
  "result->result": "merges",
  "writing->result": "cites",
});

function isNodeKind(value) {
  return NODE_KINDS.includes(value);
}

function isNodeStatus(value) {
  return NODE_STATUSES.includes(value);
}

function isEdgeKind(value) {
  return EDGE_KINDS.includes(value);
}

function edgeAllowed(kind, fromKind, toKind) {
  const rules = EDGE_RULES[kind];
  return Boolean(rules && rules.some(([from, to]) => from === fromKind && to === toKind));
}

function isStructuralEdge(kind) {
  return STRUCTURAL_EDGE_KINDS.includes(kind);
}

function defaultEdgeKind(fromKind, toKind) {
  return DEFAULT_EDGE_BY_PAIR[`${fromKind}->${toKind}`] || null;
}

module.exports = {
  NODE_KINDS,
  NODE_STATUSES,
  EDGE_KINDS,
  EDGE_RULES,
  STRUCTURAL_EDGE_KINDS,
  DEFAULT_EDGE_BY_PAIR,
  isNodeKind,
  isNodeStatus,
  isEdgeKind,
  edgeAllowed,
  isStructuralEdge,
  defaultEdgeKind,
};
