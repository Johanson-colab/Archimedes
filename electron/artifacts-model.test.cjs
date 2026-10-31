const assert = require("node:assert/strict");
const test = require("node:test");

async function model() {
  return import("../src/artifacts-model.ts");
}

function record(overrides = {}) {
  return {
    id: "artifact-1",
    thread_id: "thread-1",
    turn_id: "turn-1",
    path: "figures/figure-3.png",
    title: "figure-3.png",
    kind: "image",
    size_bytes: 1200,
    modified_at: "2026-10-31T10:00:00.000Z",
    version: 3,
    source: "agent",
    created_at: "2026-10-31T09:00:00.000Z",
    updated_at: "2026-10-31T10:00:00.000Z",
    seen: 0,
    ...overrides,
  };
}

test("classifies artifact paths and display types", async () => {
  const { artifactKind, isArtifactPath, artifactTypeLabelForPath } = await model();
  assert.equal(artifactKind("figures/figure.png"), "image");
  assert.equal(artifactKind("data/results.csv"), "csv");
  assert.equal(artifactKind("notes/brief.md"), "markdown");
  assert.equal(artifactKind("web/demo.html"), "html");
  assert.equal(artifactKind("paper/main.tex"), "other");
  assert.equal(isArtifactPath("paper/main.tex"), false);
  assert.equal(artifactTypeLabelForPath("figure.svg"), "SVG");
});

test("merges explicit artifacts and change sets with explicit paths winning", async () => {
  const { mergeArtifacts } = await model();
  const merged = mergeArtifacts([record()], [{
    id: "change-1",
    threadId: "thread-1",
    turnId: "turn-2",
    createdAt: "2026-10-31T11:00:00.000Z",
    changes: [
      { path: "figures/figure-3.png", status: "modified" },
      { path: "notes/research-brief.md", status: "created" },
      { path: "paper/main.tex", status: "modified" },
    ],
  }], "turn-2");
  assert.equal(merged.length, 2);
  const figure = merged.find((item) => item.path === "figures/figure-3.png");
  assert.equal(figure.source, "agent");
  assert.equal(figure.version, 3);
  const brief = merged.find((item) => item.path === "notes/research-brief.md");
  assert.equal(brief.source, "change-set");
  assert.equal(brief.kind, "markdown");
  assert.equal(brief.title, "research-brief.md");
  assert.equal(brief.status, "created");
});

test("groups this turn separately and filters by artifact family", async () => {
  const { filterArtifacts, groupArtifacts, mergeArtifacts } = await model();
  const items = mergeArtifacts([
    record(),
    record({ id: "artifact-2", path: "data/results.csv", title: "results.csv", kind: "csv", turn_id: "turn-2", updated_at: "2026-10-31T11:00:00.000Z" }),
    record({ id: "artifact-3", path: "notes/brief.md", title: "brief.md", kind: "markdown", turn_id: "earlier", updated_at: "2026-10-30T11:00:00.000Z" }),
  ], [], "turn-2");
  const groups = groupArtifacts(items, "turn-2");
  assert.deepEqual(groups.thisTurn.map((item) => item.title).sort(), ["results.csv"]);
  assert.equal(groups.earlier.length, 2);
  assert.deepEqual(filterArtifacts(items, "images").map((item) => item.title), ["figure-3.png"]);
  assert.deepEqual(filterArtifacts(items, "data").map((item) => item.title), ["results.csv"]);
  assert.deepEqual(filterArtifacts(items, "docs").map((item) => item.title), ["brief.md"]);
});

test("formats sizes and preview navigation deterministically", async () => {
  const { formatArtifactSize, nextArtifactIndex, unseenArtifactCount } = await model();
  assert.equal(formatArtifactSize(512), "512 B");
  assert.equal(formatArtifactSize(1536), "1.5 KB");
  assert.equal(formatArtifactSize(2_400_000), "2.3 MB");
  assert.equal(formatArtifactSize(null), "");
  assert.equal(nextArtifactIndex(4, 0, -1), 3);
  assert.equal(nextArtifactIndex(4, 3, 1), 0);
  assert.equal(nextArtifactIndex(0, 0, 1), 0);
  assert.equal(unseenArtifactCount([{ seen: false }, { seen: true }]), 1);
});
