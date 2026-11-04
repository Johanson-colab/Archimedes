const assert = require("node:assert/strict");
const { test } = require("node:test");
test("native IPC resolves the local thread and rejects paper or inactive turns before dispatch", async () => {
  const { registerNativeAgentCommands } = require("./native-agent-commands.cjs");
  const handlers = new Map();
  let current = { id: "t", status: "running", kind: "research" };
  const calls = [];
  registerNativeAgentCommands({ ipcMain: { handle: (key, fn) => handlers.set(key, fn) },
    store: { openWorkspace: () => {}, getResearchThread: () => current },
    dataWorkspace: () => "/workspace", native: { steerNative: (...args) => calls.push(args), answerNativeQuestion: (...args) => calls.push(args) } });
  await handlers.get("agent:native-steer")({}, { threadId: "t", text: "Focus on tests" });
  assert.deepEqual(calls, [["t", "Focus on tests"]]);
  current = { ...current, kind: "paper" };
  assert.throws(() => handlers.get("agent:native-steer")({}, { threadId: "t", text: "test" }), /main Work/);
  current = { ...current, kind: "research", status: "idle" };
  assert.throws(() => handlers.get("agent:native-answer")({}, { threadId: "t", questionId: "q", answers: { a: ["A"] } }), /running/);
  assert.equal(calls.length, 1);
});
