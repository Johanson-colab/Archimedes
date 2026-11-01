const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { executeTool } = require("./agent.cjs");

// A turn's capabilities are declared by the surface that starts it. They are
// never inferred from the prompt, because the prompt is text the model reads:
// asking it to "write Markdown" must not grant it permission to write files.
function toolCall(name, args) {
  return { id: `call-${name}`, type: "function", function: { name, arguments: JSON.stringify(args) } };
}

function deps(root, capabilities) {
  return {
    root,
    taskId: "task-capabilities",
    threadId: "thread-capabilities",
    turnId: "turn-capabilities",
    emit: () => {},
    contextItems: [],
    foundPapers: new Map(),
    pdfCache: new Map(),
    signal: new AbortController().signal,
    capabilities,
  };
}

test("workspace writes are refused unless the caller asks for them", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-capabilities-"));
  try {
    await assert.rejects(
      executeTool({
        ...deps(root, undefined),
        call: toolCall("write_artifact", { path: "notes/brief.md", content: "# Brief" }),
      }),
      /Workspace writes are disabled/,
    );
    await assert.rejects(
      executeTool({
        ...deps(root, { write: "deny", command: "ask" }),
        call: toolCall("write_artifact", { path: "notes/brief.md", content: "# Brief" }),
      }),
      /Workspace writes are disabled/,
    );
    assert.equal(fs.existsSync(path.join(root, "notes", "brief.md")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("command proposals are refused unless the caller asks for them", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-capabilities-"));
  try {
    await assert.rejects(
      executeTool({
        ...deps(root, { write: "ask", command: "deny" }),
        call: toolCall("propose_command", { command: "npm test" }),
      }),
      /Command execution is disabled/,
    );
    await assert.rejects(
      executeTool({ ...deps(root, undefined), call: toolCall("propose_command", { command: "npm test" }) }),
      /Command execution is disabled/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("read-only tools keep working without any capability grant", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-capabilities-"));
  try {
    fs.writeFileSync(path.join(root, "notes.txt"), "hello");
    const result = await executeTool({
      ...deps(root, undefined),
      call: toolCall("read_workspace_file", { path: "notes.txt" }),
    });
    assert.match(result.content, /hello/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
