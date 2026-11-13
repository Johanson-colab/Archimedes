import type { ResearchEdge, ResearchGraph, ResearchNode } from "./types";

/**
 * Deterministic lane layout for the research graph.
 *
 * Time runs downwards. A branch keeps its parent's lane and side branches take
 * the next lane, mirroring the Git-graph layout used by experiment history.
 * Feedback edges are drawn but never affect the structural layout.
 */

export const GRAPH_PAD = 24;
export const GRAPH_NODE_WIDTH = 176;
export const GRAPH_NODE_HEIGHT = 52;
export const GRAPH_LANE_WIDTH = 212;
export const GRAPH_ROW_HEIGHT = 88;

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
};

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
  if (Math.abs(x2 - x1) < 2) return `M ${x1} ${y1} L ${x2} ${y2 - 6}`;
  const direction = y2 >= y1 ? 1 : -1;
  const bend = Math.max(24, Math.abs(y2 - y1) * 0.35);
  return `M ${x1} ${y1} C ${x1} ${y1 + direction * bend}, ${x2} ${y2 - direction * bend}, ${x2} ${y2 - 6}`;
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
