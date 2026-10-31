const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { executeTool } = require("./agent.cjs");
const store = require("./store.cjs");

function context(root, threadId, args) {
  return {
    root,
    taskId: "task-artifact",
    threadId,
    turnId: "turn-artifact",
    call: { id: "call-artifact", type: "function", function: { name: "add_artifact", arguments: JSON.stringify(args) } },
    emit: () => {},
    contextItems: [],
    foundPapers: new Map(),
    pdfCache: new Map(),
    signal: new AbortController().signal,
    allowWorkspaceActions: false,
  };
}

test("add_artifact registers an existing output and increments its version", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-add-artifact-"));
  try {
    store.openWorkspace(root);
    const thread = store.createResearchThread({ prompt: "artifact tool", mode: "free-chat" });
    fs.mkdirSync(path.join(root, "figures"), { recursive: true });
    fs.writeFileSync(path.join(root, "figures", "plot.png"), "not-a-real-png");
    const first = await executeTool(context(root, thread.id, { path: "figures/plot.png", title: "Plot" }));
    const parsed = JSON.parse(first.content);
    assert.equal(parsed.path, "figures/plot.png");
    assert.equal(parsed.kind, "image");
    assert.equal(parsed.version, 1);
    const second = await executeTool(context(root, thread.id, { path: "figures/plot.png" }));
    assert.equal(JSON.parse(second.content).version, 2);
    const artifacts = store.listArtifacts(thread.id);
    assert.equal(artifacts.length, 1);
    assert.equal(artifacts[0].title, "Plot");
    assert.equal(artifacts[0].size_bytes, fs.statSync(path.join(root, "figures", "plot.png")).size);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("add_artifact rejects missing, non-artifact, and escaping paths", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-add-artifact-invalid-"));
  try {
    store.openWorkspace(root);
    const thread = store.createResearchThread({ prompt: "artifact tool invalid", mode: "free-chat" });
    fs.writeFileSync(path.join(root, "notes.tex"), "\\section{Not an artifact}");
    await assert.rejects(executeTool(context(root, thread.id, { path: "notes/missing.md" })), /does not exist/);
    await assert.rejects(executeTool(context(root, thread.id, { path: "notes.tex" })), /Only images/);
    await assert.rejects(executeTool(context(root, thread.id, { path: "../escape.md" })), /escaped|outside|workspace|Artifact path/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
