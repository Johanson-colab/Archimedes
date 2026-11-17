import type { ResearchEdge, ResearchGraph, ResearchNode } from "./types";

/**
 * Deterministic lane layout for the research graph.
 *
 * Time runs downwards. A branch keeps its parent's lane and side branches take
 * the next lane, mirroring the Git-graph layout used by experiment history.
 * Feedback edges are drawn but never affect the structural layout.
 */

export const GRAPH_PAD = 14;
export const GRAPH_NODE_WIDTH = 150;
export const GRAPH_NODE_HEIGHT = 42;
export const GRAPH_LANE_WIDTH = 170;
export const GRAPH_ROW_HEIGHT = 60;
export const GRAPH_TREE_INDENT = 22;
export const GRAPH_TREE_ROW_HEIGHT = 56;

const STRUCTURAL_EDGE_KINDS = new Set([
  "generates",
  "tests",
  "produces",
  "refines",
  "merges",
  "extends",
  "replicates",
  "cites",
]);

const FEEDBACK_EDGE_KINDS = new Set([
  "supports",
  "contradicts",
  "inconclusive",
  "informs",
  "decides",
]);

export type GraphLayoutNode = {
  node: ResearchNode;
  x: number;
  y: number;
  lane: number;
  row: number;
};

export type GraphLayoutEdge = {
  edge: ResearchEdge;
  path: string;
  feedback: boolean;
  secondary?: boolean;
  fromId?: string;
  toId?: string;
  lane?: number;
};

export const LINEAGE_ROW_HEIGHT = 64;
export const LINEAGE_EVENT_HEIGHT = 30;
export const LINEAGE_LANE_WIDTH = 20;
export const LINEAGE_PAD = 18;
export const LINEAGE_MARKER_Y = 25;
export type LineageLayout = GraphLayout & { railWidth: number };

/** A Git-style rail, ordered so every structural parent precedes its children.
 * Citations are stored writing -> evidence; visually evidence precedes writing.
 * Feedback keeps its true direction and never changes the structural order. */
export function layoutLineage(graph: LayoutInput, activityRows: ReadonlyMap<string, number> = new Map()): LineageLayout {
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  const relations = graph.edges.filter(edge => byId.has(edge.from_node) && byId.has(edge.to_node)).map(edge => ({
    edge,
    from: edge.kind === "cites" ? edge.to_node : edge.from_node,
    to: edge.kind === "cites" ? edge.from_node : edge.to_node,
    feedback: FEEDBACK_EDGE_KINDS.has(edge.kind),
  }));
  const structural = relations.filter(item => STRUCTURAL_EDGE_KINDS.has(item.edge.kind));
  const incoming = new Map(graph.nodes.map(node => [node.id, structural.filter(item => item.to === node.id)]));
  const outgoing = new Map(graph.nodes.map(node => [node.id, structural.filter(item => item.from === node.id)]));
  const order = (a: string, b: string) => createdOrder(byId.get(a)!, byId.get(b)!);
  const firstChild = new Map([...outgoing].map(([id, items]) => [id, [...new Set(items.map(item => item.to))].sort(order)[0]]));
  const remaining = new Set(byId.keys());
  const placed: GraphLayoutNode[] = [];
  const positions = new Map<string, GraphLayoutNode>();
  let nextLane = 0;
  let offset = 0;
  while (remaining.size) {
    const ready = [...remaining].filter(id => incoming.get(id)!.every(item => !remaining.has(item.from))).sort(order);
    // Malformed legacy cycles are still inspectable; the service validates new graphs.
    const id = ready[0] ?? [...remaining].sort(order)[0];
    const parents = incoming.get(id)!.filter(item => positions.has(item.from));
    const continuation = parents.filter(item => firstChild.get(item.from) === id)
      .sort((a, b) => positions.get(a.from)!.lane - positions.get(b.from)!.lane)[0];
    const lane = continuation ? positions.get(continuation.from)!.lane : nextLane++;
    const position = { node: byId.get(id)!, lane, row: placed.length, x: LINEAGE_PAD + lane * LINEAGE_LANE_WIDTH, y: LINEAGE_PAD + placed.length * LINEAGE_ROW_HEIGHT + offset };
    remaining.delete(id);
    positions.set(id, position);
    placed.push(position);
    offset += Math.max(0, activityRows.get(id) || 0) * LINEAGE_EVENT_HEIGHT;
  }
  const laneCount = Math.max(1, nextLane);
  const railWidth = LINEAGE_PAD * 2 + laneCount * LINEAGE_LANE_WIDTH;
  const edges = relations.map(({ edge, from, to, feedback }) => {
    const a = positions.get(from)!;
    const b = positions.get(to)!;
    const direction = b.y >= a.y ? 1 : -1;
    const y1 = a.y + LINEAGE_MARKER_Y + direction * 6;
    const y2 = b.y + LINEAGE_MARKER_Y - direction * 6;
    const bend = Math.min(16, Math.abs(y2 - y1) / 2);
    const returnX = railWidth - 8;
    const path = feedback
      ? `M ${a.x + 6} ${a.y + LINEAGE_MARKER_Y} L ${returnX - 6} ${a.y + LINEAGE_MARKER_Y} Q ${returnX} ${a.y + LINEAGE_MARKER_Y} ${returnX} ${a.y + LINEAGE_MARKER_Y - 6} L ${returnX} ${b.y + LINEAGE_MARKER_Y + 6} Q ${returnX} ${b.y + LINEAGE_MARKER_Y} ${returnX - 6} ${b.y + LINEAGE_MARKER_Y} L ${b.x + 6} ${b.y + LINEAGE_MARKER_Y}`
      : a.x === b.x
      ? `M ${a.x} ${y1} L ${b.x} ${y2}`
      : `M ${a.x} ${y1} L ${a.x} ${y2 - direction * bend} Q ${a.x} ${y2} ${(a.x + b.x) / 2} ${y2} L ${b.x} ${y2}`;
    return { edge, fromId: from, toId: to, path, feedback, lane: b.lane };
  });
  return { nodes: placed, edges, railWidth, width: railWidth + 240, height: LINEAGE_PAD * 2 + Math.max(1, placed.length) * LINEAGE_ROW_HEIGHT + offset, laneCount, rowCount: placed.length };
}

export type GraphLayout = {
  nodes: GraphLayoutNode[];
  edges: GraphLayoutEdge[];
  width: number;
  height: number;
  laneCount: number;
  rowCount: number;
};

type LayoutInput = Pick<ResearchGraph, "nodes" | "edges">;

function createdOrder(left: ResearchNode, right: ResearchNode) {
  return left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id);
}

function edgePath(from: GraphLayoutNode, to: GraphLayoutNode): string {
  const x1 = from.x + GRAPH_NODE_WIDTH / 2;
  const y1 = from.y + GRAPH_NODE_HEIGHT;
  const x2 = to.x + GRAPH_NODE_WIDTH / 2;
  const y2 = to.y;
  if (Math.abs(x2 - x1) < 2) return `M ${x1} ${y1} L ${x2} ${y2 - 4}`;
  const direction = y2 >= y1 ? 1 : -1;
  const bend = Math.max(16, Math.abs(y2 - y1) * 0.28);
  return `M ${x1} ${y1} C ${x1} ${y1 + direction * bend}, ${x2} ${y2 - direction * bend}, ${x2} ${y2 - 4}`;
}

export function layoutGraph(graph: LayoutInput): GraphLayout {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const structuralEdges = graph.edges.filter(
    (edge) => STRUCTURAL_EDGE_KINDS.has(edge.kind) && nodeById.has(edge.from_node) && nodeById.has(edge.to_node),
  );
  const outgoing = new Map<string, ResearchEdge[]>();
  const incoming = new Map<string, ResearchEdge[]>();
  for (const node of graph.nodes) {
    outgoing.set(node.id, []);
    incoming.set(node.id, []);
  }
  for (const edge of structuralEdges) {
    outgoing.get(edge.from_node)?.push(edge);
    incoming.get(edge.to_node)?.push(edge);
  }

  const subtreeSizes = new Map<string, number>();
  const sizeOf = (nodeId: string, visiting: Set<string>): number => {
    const cached = subtreeSizes.get(nodeId);
    if (cached !== undefined) return cached;
    if (visiting.has(nodeId)) return 1;
    visiting.add(nodeId);
    const children = new Set((outgoing.get(nodeId) || []).map((edge) => edge.to_node));
    const size = 1 + [...children].reduce((total, child) => total + sizeOf(child, visiting), 0);
    visiting.delete(nodeId);
    subtreeSizes.set(nodeId, size);
    return size;
  };

  const childrenOf = (nodeId: string) => {
    const unique = new Map<string, ResearchEdge>();
    for (const edge of outgoing.get(nodeId) || []) unique.set(edge.to_node, edge);
    return [...unique.values()].sort((left, right) => {
      const leftNode = nodeById.get(left.to_node);
      const rightNode = nodeById.get(right.to_node);
      if (!leftNode || !rightNode) return 0;
      return createdOrder(leftNode, rightNode);
    });
  };

  const pickContinuing = (children: ResearchEdge[]) => {
    if (children.length <= 1) return children[0] || null;
    return [...children].sort((left, right) => {
      const leftSize = sizeOf(left.to_node, new Set());
      const rightSize = sizeOf(right.to_node, new Set());
      if (leftSize !== rightSize) return rightSize - leftSize;
      const leftNode = nodeById.get(left.to_node);
      const rightNode = nodeById.get(right.to_node);
      if (!leftNode || !rightNode) return 0;
      return createdOrder(rightNode, leftNode);
    })[0];
  };

  const laidOut: GraphLayoutNode[] = [];
  const positions = new Map<string, GraphLayoutNode>();
  const visited = new Set<string>();
  let row = 0;

  const visit = (nodeId: string, lane: number) => {
    if (visited.has(nodeId)) return;
    const node = nodeById.get(nodeId);
    if (!node) return;
    visited.add(nodeId);
    const placed = {
      node,
      x: GRAPH_PAD + lane * GRAPH_LANE_WIDTH,
      y: GRAPH_PAD + row * GRAPH_ROW_HEIGHT,
      lane,
      row,
    };
    row += 1;
    laidOut.push(placed);
    positions.set(nodeId, placed);
    const children = childrenOf(nodeId);
    const continuing = pickContinuing(children);
    for (const child of children) {
      if (child === continuing) continue;
      visit(child.to_node, lane + 1);
    }
    if (continuing) visit(continuing.to_node, lane);
  };

  const roots = graph.nodes
    .filter((node) => (incoming.get(node.id) || []).length === 0)
    .sort(createdOrder);
  for (const root of roots) visit(root.id, 0);
  for (const node of [...graph.nodes].sort(createdOrder)) visit(node.id, 0);

  const edges = graph.edges
    .filter((edge) => positions.has(edge.from_node) && positions.has(edge.to_node))
    .map((edge) => {
      const from = positions.get(edge.from_node)!;
      const to = positions.get(edge.to_node)!;
      return {
        edge,
        path: edgePath(from, to),
        feedback: FEEDBACK_EDGE_KINDS.has(edge.kind),
      };
    });

  const laneCount = Math.max(1, ...laidOut.map((item) => item.lane + 1));
  const rowCount = Math.max(1, laidOut.length);
  return {
    nodes: laidOut,
    edges,
    width: GRAPH_PAD * 2 + laneCount * GRAPH_LANE_WIDTH,
    height: GRAPH_PAD * 2 + rowCount * GRAPH_ROW_HEIGHT,
    laneCount,
    rowCount,
  };
}

/**
 * Compact vertical tree used by the Research graph.
 *
 * A question is the spine, ideas are indented rows under it, and experiments
 * sit under the idea they primarily test. Additional idea->experiment tests
 * edges remain visible as faint secondary connections. This is intentionally
 * narrower than the lane layout so several ideas read as a step list rather
 * than a large canvas.
 */
export function layoutTree(graph: LayoutInput): GraphLayout {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const incoming = new Map<string, ResearchEdge[]>();
  for (const node of graph.nodes) incoming.set(node.id, []);
  for (const edge of graph.edges) {
    if (!STRUCTURAL_EDGE_KINDS.has(edge.kind) || !nodeById.has(edge.from_node) || !nodeById.has(edge.to_node)) continue;
    incoming.get(edge.to_node)?.push(edge);
  }
  const priority = (edge: ResearchEdge, child: ResearchNode) => {
    const parent = nodeById.get(edge.from_node);
    if (edge.kind === "refines" && child.kind === "idea" && parent?.kind === "idea") return 0;
    if (child.kind === "experiment" && parent?.kind === "experiment" && (edge.kind === "extends" || edge.kind === "replicates")) return 0;
    if (edge.kind === "tests" && child.kind === "experiment" && parent?.kind === "idea") return 1;
    if (edge.kind === "produces" && child.kind === "result" && parent?.kind === "experiment") return 2;
    if (edge.kind === "merges") return 3;
    if (edge.kind === "generates" && child.kind === "idea" && parent?.kind === "question") return 4;
    if (["extends", "replicates"].includes(edge.kind)) return 5;
    if (edge.kind === "cites") return 6;
    return 7;
  };
  const primaryParent = new Map<string, ResearchEdge>();
  const primaryChildren = new Map<string, ResearchEdge[]>();
  for (const node of graph.nodes) primaryChildren.set(node.id, []);
  for (const node of graph.nodes) {
    const candidates = [...(incoming.get(node.id) || [])].sort((left, right) => {
      const byPriority = priority(left, node) - priority(right, node);
      if (byPriority) return byPriority;
      const leftParent = nodeById.get(left.from_node);
      const rightParent = nodeById.get(right.from_node);
      if (leftParent && rightParent) return createdOrder(leftParent, rightParent);
      return left.id.localeCompare(right.id);
    });
    if (!candidates.length) continue;
    primaryParent.set(node.id, candidates[0]);
    primaryChildren.get(candidates[0].from_node)?.push(candidates[0]);
  }
  for (const children of primaryChildren.values()) {
    children.sort((left, right) => {
      const leftNode = nodeById.get(left.to_node);
      const rightNode = nodeById.get(right.to_node);
      return leftNode && rightNode ? createdOrder(leftNode, rightNode) : left.id.localeCompare(right.id);
    });
  }

  const rank = (node: ResearchNode) => node.kind === "question" ? 0 : node.kind === "idea" ? 1 : node.kind === "experiment" ? 2 : 3;
  const roots = graph.nodes
    .filter((node) => !primaryParent.has(node.id))
    .sort((left, right) => rank(left) - rank(right) || createdOrder(left, right));
  const laidOut: GraphLayoutNode[] = [];
  const positions = new Map<string, GraphLayoutNode>();
  const visited = new Set<string>();
  let row = 0;
  let maxDepth = 0;
  const visit = (nodeId: string, depth: number) => {
    if (visited.has(nodeId)) return;
    const node = nodeById.get(nodeId);
    if (!node) return;
    visited.add(nodeId);
    maxDepth = Math.max(maxDepth, depth);
    const placed = {
      node,
      x: GRAPH_PAD + depth * GRAPH_TREE_INDENT,
      y: GRAPH_PAD + row * GRAPH_TREE_ROW_HEIGHT,
      lane: depth,
      row,
    };
    row += 1;
    laidOut.push(placed);
    positions.set(nodeId, placed);
    for (const edge of primaryChildren.get(nodeId) || []) visit(edge.to_node, depth + 1);
  };
  for (const root of roots) visit(root.id, 0);
  for (const node of [...graph.nodes].sort(createdOrder)) visit(node.id, 0);

  const treeSpinePath = (parent: GraphLayoutNode, child: GraphLayoutNode) => {
    const x = parent.x + 8;
    const startY = parent.y + GRAPH_NODE_HEIGHT;
    const endY = child.y + GRAPH_NODE_HEIGHT / 2;
    return `M ${x} ${startY} L ${x} ${endY} L ${child.x} ${endY}`;
  };
  const treeElbowPath = (parent: GraphLayoutNode, child: GraphLayoutNode) => {
    const x = parent.x + 10;
    const startY = parent.y + GRAPH_NODE_HEIGHT;
    const endY = child.y + GRAPH_NODE_HEIGHT / 2;
    if (Math.abs(child.x - x) < 2) return `M ${x} ${startY} L ${x} ${endY - 3}`;
    return `M ${x} ${startY} L ${x} ${endY} L ${child.x} ${endY}`;
  };
  const treeSecondaryPath = (parent: GraphLayoutNode, child: GraphLayoutNode) => {
    const x1 = parent.x + GRAPH_NODE_WIDTH - 10;
    const y1 = parent.y + GRAPH_NODE_HEIGHT;
    const x2 = child.x + 8;
    const y2 = child.y;
    const direction = y2 >= y1 ? 1 : -1;
    const bend = Math.max(12, Math.abs(y2 - y1) * 0.22);
    return `M ${x1} ${y1} C ${x1} ${y1 + direction * bend}, ${x2} ${y2 - direction * bend}, ${x2} ${y2 - 3}`;
  };

  const edges: GraphLayoutEdge[] = [];
  for (const edge of graph.edges) {
    const from = positions.get(edge.from_node);
    const to = positions.get(edge.to_node);
    if (!from || !to) continue;
    if (primaryParent.get(edge.to_node)?.id === edge.id) {
      edges.push({
        edge,
        path: from.node.kind === "question" ? treeSpinePath(from, to) : treeElbowPath(from, to),
        feedback: FEEDBACK_EDGE_KINDS.has(edge.kind),
      });
      continue;
    }
    // A question->idea generates edge is already represented by the idea's
    // position inside the question's tree when it also has a refines parent.
    if (edge.kind === "generates" && from.node.kind === "question" && to.node.kind === "idea" && primaryParent.has(edge.to_node)) continue;
    edges.push({
      edge,
      path: treeSecondaryPath(from, to),
      feedback: FEEDBACK_EDGE_KINDS.has(edge.kind),
      secondary: true,
    });
  }

  const rowCount = Math.max(1, laidOut.length);
  return {
    nodes: laidOut,
    edges,
    width: GRAPH_PAD * 2 + maxDepth * GRAPH_TREE_INDENT + GRAPH_NODE_WIDTH,
    height: GRAPH_PAD * 2 + rowCount * GRAPH_TREE_ROW_HEIGHT,
    laneCount: maxDepth + 1,
    rowCount,
  };
}
