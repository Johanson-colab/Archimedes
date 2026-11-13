const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

let layoutModule;

async function loadLayout() {
  if (layoutModule) return layoutModule;
  const { transformWithOxc } = await import("vite");
  const source = fs.readFileSync(path.join(__dirname, "../src/research-graph/graphLayout.ts"), "utf8");
  const { code } = await transformWithOxc(source, "graphLayout.ts", {});
  const factory = new Function(`${code.replace(/^export /gm, "")}\nreturn { layoutGraph, GRAPH_PAD, GRAPH_NODE_WIDTH, GRAPH_NODE_HEIGHT, GRAPH_LANE_WIDTH, GRAPH_ROW_HEIGHT };`);
  layoutModule = factory();
  return layoutModule;
}

function node(id, kind, createdAt, title = id) {
  return {
    id,
    project_id: "p1",
    kind,
    status: "active",
    title,
    summary: "",
    current_revision_id: `rev-${id}`,
    current_revision: null,
    created_by: "local-user",
    created_at: createdAt,
    updated_at: createdAt,
    archived_at: null,
    archived_by: null,
    archive_reason: "",
    archived: false,
  };
}

function edge(id, from, to, kind) {
  return {
    id,
    project_id: "p1",
    from_node: from,
    from_revision: `rev-${from}`,
    to_node: to,
    to_revision: `rev-${to}`,
    kind,
    metadata: {},
    created_by: "local-user",
    created_at: "2026-01-01T00:00:00.000Z",
  };
}

test("a chain stays in one lane and advances one row per node", async () => {
  const { layoutGraph, GRAPH_PAD, GRAPH_LANE_WIDTH, GRAPH_ROW_HEIGHT } = await loadLayout();
  const nodes = [
    node("q", "question", "2026-01-01T00:00:00.000Z"),
    node("i", "idea", "2026-01-01T00:01:00.000Z"),
    node("e", "experiment", "2026-01-01T00:02:00.000Z"),
    node("r", "result", "2026-01-01T00:03:00.000Z"),
    node("w", "writing", "2026-01-01T00:04:00.000Z"),
  ];
  const edges = [
    edge("e1", "q", "i", "generates"),
    edge("e2", "i", "e", "tests"),
    edge("e3", "e", "r", "produces"),
    edge("e4", "w", "r", "cites"),
  ];
  const layout = layoutGraph({ nodes, edges });
  assert.equal(layout.nodes.length, 5);
  assert.equal(layout.laneCount, 1);
  assert.equal(layout.width, GRAPH_PAD * 2 + GRAPH_LANE_WIDTH);
  assert.equal(layout.height, GRAPH_PAD * 2 + 5 * GRAPH_ROW_HEIGHT);
  assert.deepEqual(layout.nodes.map((item) => item.row), [0, 1, 2, 3, 4]);
  assert.ok(layout.nodes.every((item) => item.x === GRAPH_PAD));
});

test("a fork puts the side branch in a new lane", async () => {
  const { layoutGraph } = await loadLayout();
  const nodes = [
    node("q", "question", "2026-01-01T00:00:00.000Z"),
    node("i1", "idea", "2026-01-01T00:01:00.000Z"),
    node("i2", "idea", "2026-01-01T00:02:00.000Z"),
  ];
  const layout = layoutGraph({
    nodes,
    edges: [edge("e1", "q", "i1", "generates"), edge("e2", "q", "i2", "generates")],
  });
  assert.equal(layout.laneCount, 2);
  assert.equal(new Set(layout.nodes.map((item) => item.lane)).size, 2);
});

test("a merge keeps one node position and draws both incoming edges", async () => {
  const { layoutGraph } = await loadLayout();
  const nodes = [
    node("q", "question", "2026-01-01T00:00:00.000Z"),
    node("i1", "idea", "2026-01-01T00:01:00.000Z"),
    node("i2", "idea", "2026-01-01T00:02:00.000Z"),
    node("m", "idea", "2026-01-01T00:03:00.000Z"),
  ];
  const edges = [
    edge("e1", "q", "i1", "generates"),
    edge("e2", "q", "i2", "generates"),
    edge("e3", "i1", "m", "merges"),
    edge("e4", "i2", "m", "merges"),
  ];
  const layout = layoutGraph({ nodes, edges });
  assert.equal(layout.nodes.filter((item) => item.node.id === "m").length, 1);
  assert.equal(layout.edges.filter((item) => item.edge.to_node === "m").length, 2);
});

test("feedback edges are marked without changing the structural layout", async () => {
  const { layoutGraph } = await loadLayout();
  const nodes = [
    node("q", "question", "2026-01-01T00:00:00.000Z"),
    node("i", "idea", "2026-01-01T00:01:00.000Z"),
    node("e", "experiment", "2026-01-01T00:02:00.000Z"),
    node("r", "result", "2026-01-01T00:03:00.000Z"),
  ];
  const structural = [
    edge("e1", "q", "i", "generates"),
    edge("e2", "i", "e", "tests"),
    edge("e3", "e", "r", "produces"),
  ];
  const feedback = edge("f1", "r", "i", "supports");
  const withFeedback = layoutGraph({ nodes, edges: [...structural, feedback] });
  const withoutFeedback = layoutGraph({ nodes, edges: structural });
  assert.deepEqual(withFeedback.nodes.map((item) => [item.node.id, item.x, item.y]), withoutFeedback.nodes.map((item) => [item.node.id, item.x, item.y]));
  assert.equal(withFeedback.edges.find((item) => item.edge.id === "f1").feedback, true);
});

test("orphans and cycles still produce a deterministic layout", async () => {
  const { layoutGraph } = await loadLayout();
  const nodes = [
    node("a", "idea", "2026-01-01T00:00:00.000Z"),
    node("b", "idea", "2026-01-01T00:01:00.000Z"),
    node("c", "idea", "2026-01-01T00:02:00.000Z"),
  ];
  const layout = layoutGraph({
    nodes,
    edges: [edge("e1", "a", "b", "refines"), edge("e2", "b", "a", "refines"), edge("e3", "c", "c", "refines")],
  });
  assert.equal(layout.nodes.length, 3);
  const second = layoutGraph({
    nodes,
    edges: [edge("e1", "a", "b", "refines"), edge("e2", "b", "a", "refines"), edge("e3", "c", "c", "refines")],
  });
  assert.deepEqual(layout.nodes.map((item) => [item.node.id, item.x, item.y]), second.nodes.map((item) => [item.node.id, item.x, item.y]));
});
