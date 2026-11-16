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
  const factory = new Function(`${code.replace(/^export /gm, "")}\nreturn { layoutGraph, layoutTree, layoutLineage, LINEAGE_ROW_HEIGHT, LINEAGE_LANE_WIDTH, LINEAGE_PAD, GRAPH_PAD, GRAPH_NODE_WIDTH, GRAPH_NODE_HEIGHT, GRAPH_LANE_WIDTH, GRAPH_ROW_HEIGHT, GRAPH_TREE_INDENT, GRAPH_TREE_ROW_HEIGHT };`);
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

test("tree layout nests ideas and experiments as a compact vertical step list", async () => {
  const { layoutTree, GRAPH_PAD, GRAPH_NODE_WIDTH, GRAPH_TREE_INDENT, GRAPH_TREE_ROW_HEIGHT } = await loadLayout();
  const nodes = [
    node("q", "question", "2026-01-01T00:00:00.000Z"),
    node("i", "idea", "2026-01-01T00:01:00.000Z"),
    node("e", "experiment", "2026-01-01T00:02:00.000Z"),
  ];
  const layout = layoutTree({
    nodes,
    edges: [
      edge("e1", "q", "i", "generates"),
      edge("e2", "i", "e", "tests"),
    ],
  });
  assert.deepEqual(layout.nodes.map((item) => item.node.id), ["q", "i", "e"]);
  assert.deepEqual(layout.nodes.map((item) => item.row), [0, 1, 2]);
  assert.deepEqual(layout.nodes.map((item) => item.x), [GRAPH_PAD, GRAPH_PAD + GRAPH_TREE_INDENT, GRAPH_PAD + 2 * GRAPH_TREE_INDENT]);
  assert.equal(layout.width, GRAPH_PAD * 2 + 2 * GRAPH_TREE_INDENT + GRAPH_NODE_WIDTH);
  assert.equal(layout.height, GRAPH_PAD * 2 + 3 * GRAPH_TREE_ROW_HEIGHT);
  assert.match(layout.edges.find((item) => item.edge.id === "e1").path, /^M /);
});

test("tree siblings stack vertically and secondary tests edges stay faint", async () => {
  const { layoutTree, GRAPH_PAD, GRAPH_TREE_INDENT } = await loadLayout();
  const nodes = [
    node("q", "question", "2026-01-01T00:00:00.000Z"),
    node("i1", "idea", "2026-01-01T00:01:00.000Z"),
    node("i2", "idea", "2026-01-01T00:02:00.000Z"),
    node("e", "experiment", "2026-01-01T00:03:00.000Z"),
  ];
  const layout = layoutTree({
    nodes,
    edges: [
      edge("e1", "q", "i1", "generates"),
      edge("e2", "q", "i2", "generates"),
      edge("e3", "i1", "e", "tests"),
      edge("e4", "i2", "e", "tests"),
    ],
  });
  assert.deepEqual(layout.nodes.map((item) => item.node.id), ["q", "i1", "e", "i2"]);
  assert.equal(layout.nodes.find((item) => item.node.id === "i1").x, GRAPH_PAD + GRAPH_TREE_INDENT);
  assert.equal(layout.nodes.find((item) => item.node.id === "i2").x, GRAPH_PAD + GRAPH_TREE_INDENT);
  assert.equal(layout.nodes.find((item) => item.node.id === "e").x, GRAPH_PAD + 2 * GRAPH_TREE_INDENT);
  assert.equal(layout.edges.find((item) => item.edge.id === "e3").secondary, undefined);
  assert.equal(layout.edges.find((item) => item.edge.id === "e4").secondary, true);
});

test("an experiment round nests under its parent experiment, not the idea", async () => {
  const { layoutTree, GRAPH_PAD, GRAPH_TREE_INDENT } = await loadLayout();
  const nodes = [
    node("q", "question", "2026-01-01T00:00:00.000Z"),
    node("i", "idea", "2026-01-01T00:01:00.000Z"),
    node("e1", "experiment", "2026-01-01T00:02:00.000Z"),
    node("e2", "experiment", "2026-01-01T00:03:00.000Z"),
  ];
  const layout = layoutTree({
    nodes,
    edges: [
      edge("e1", "q", "i", "generates"),
      edge("e2", "i", "e1", "tests"),
      edge("e3", "e1", "e2", "extends"),
      edge("e4", "i", "e2", "tests"),
    ],
  });
  assert.deepEqual(layout.nodes.map((item) => item.node.id), ["q", "i", "e1", "e2"]);
  assert.equal(layout.nodes.find((item) => item.node.id === "e2").x, GRAPH_PAD + 3 * GRAPH_TREE_INDENT);
  assert.equal(layout.edges.find((item) => item.edge.id === "e3").secondary, undefined);
  assert.equal(layout.edges.find((item) => item.edge.id === "e4").secondary, true);
});

test("lineage places merge nodes after all parents and retains both connections", async () => {
  const { layoutLineage } = await loadLayout();
  const nodes = [node("q", "question", "0"), node("a", "idea", "1"), node("b", "idea", "2"), node("m", "idea", "1.5")];
  const edges = [edge("qa", "q", "a", "generates"), edge("qb", "q", "b", "generates"), edge("am", "a", "m", "merges"), edge("bm", "b", "m", "merges")];
  const layout = layoutLineage({ nodes, edges });
  const byId = new Map(layout.nodes.map(n => [n.node.id, n]));
  assert.ok(byId.get("m").row > byId.get("a").row);
  assert.ok(byId.get("m").row > byId.get("b").row);
  assert.notEqual(byId.get("a").lane, byId.get("b").lane);
  assert.equal(layout.nodes.filter(n => n.node.id === "m").length, 1);
  assert.equal(layout.edges.filter(e => e.toId === "m").length, 2);
  assert.deepEqual(layoutLineage({ nodes: nodes.slice().reverse(), edges: edges.slice().reverse() }).nodes, layout.nodes);
});

test("lineage continues experiment rounds and draws citations from evidence to writing", async () => {
  const { layoutLineage } = await loadLayout();
  const nodes = [node("i", "idea", "0"), node("e1", "experiment", "1"), node("e2", "experiment", "2"), node("r", "result", "3"), node("w", "writing", "0.5")];
  const edges = [edge("ie", "i", "e1", "tests"), edge("ie2", "i", "e2", "tests"), edge("ee", "e1", "e2", "extends"), edge("er", "e2", "r", "produces"), edge("wr", "w", "r", "cites")];
  const layout = layoutLineage({ nodes, edges });
  assert.deepEqual(layout.nodes.map(n => n.node.id), ["i", "e1", "e2", "r", "w"]);
  assert.equal(layout.laneCount, 1);
  const citation = layout.edges.find(e => e.edge.id === "wr");
  assert.equal(citation.fromId, "r"); assert.equal(citation.toId, "w");
  assert.equal(citation.edge.from_node, "w", "the stored semantic direction is preserved");
});

test("lineage feedback does not reorder history and stays inside the rail", async () => {
  const { layoutLineage } = await loadLayout();
  const nodes = [node("i", "idea", "0"), node("e", "experiment", "1"), node("r", "result", "2")];
  const edges = [edge("ie", "i", "e", "tests"), edge("er", "e", "r", "produces")];
  const base = layoutLineage({ nodes, edges });
  const feedback = layoutLineage({ nodes, edges: [...edges, edge("ri", "r", "i", "contradicts")] });
  assert.deepEqual(feedback.nodes, base.nodes);
  assert.equal(feedback.edges.at(-1).feedback, true);
  assert.notEqual(feedback.edges.at(-1).path, base.edges[0].path);
  assert.ok(feedback.nodes.every(n => n.x < feedback.railWidth));
});

test("lineage tolerates broken legacy cycles and missing endpoints without losing nodes", async () => {
  const { layoutLineage } = await loadLayout();
  const nodes = [node("a", "idea", "0"), node("b", "idea", "1")];
  const layout = layoutLineage({ nodes, edges: [edge("ab", "a", "b", "refines"), edge("ba", "b", "a", "refines"), edge("missing", "gone", "a", "refines")] });
  assert.equal(layout.nodes.length, 2); assert.equal(layout.edges.length, 2);
  assert.equal(new Set(layout.nodes.map(n => n.row)).size, 2);
});
