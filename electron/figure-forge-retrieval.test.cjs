const test = require("node:test");
const assert = require("node:assert/strict");

test("Top-Conf retrieval rejects misaligned metadata and ranks lexical matches", async () => {
  const { buildIndex, prepareQuery, rank } = await import("../src/figureforge/vendor/retrieval.mjs");
  const figs = [{ id: "a", title: "Robot manipulation" }, { id: "b", title: "Speech recognition" }];
  const ids = ["a", "b"];
  const bm = { docs: [["robot", "manipulation"], ["speech", "recognition"]] };
  const index = buildIndex({ figs, ids, bm });
  const scores = new Float32Array(2);
  const result = rank(index, prepareQuery("robot manipulation", index.idf), [0, 1], scores, scores);
  assert.equal(result[0].i, 0);
  assert.ok(result[0].score > result[1].score);
  assert.throws(() => buildIndex({ figs, ids: ["b", "a"], bm }), /对齐/);
});

test("index loader verifies metadata and embedding sizes before semantic search", async () => {
  const { loadRetrievalIndex, searchRetrievalIndex } = await import("../src/figureforge/retrieval.mjs");
  const sources = {
    "manifest.json": { dataVersion: "test" },
    "figures.json": [{ id: "a", title: "Robot" }, { id: "b", title: "Speech" }],
    "ids.json": ["a", "b"],
    "bm25.json": { docs: [["robot"], ["speech"]] },
  };
  const fetchImpl = async (url) => {
    const name = new URL(url).pathname.split("/").pop();
    return { ok: true, json: async () => sources[name], arrayBuffer: async () => new ArrayBuffer(4) };
  };
  const loaded = await loadRetrievalIndex({ fetchImpl });
  assert.equal(searchRetrievalIndex(loaded, "robot")[0].figure.id, "a");
  await assert.rejects(loaded.loadEmbeddings(), /dimensions/);
  assert.throws(() => searchRetrievalIndex(loaded, "robot", null, [1]), /Semantic search/);
});
