const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test, before } = require("node:test");
let state;
before(async () => {
  const { transformWithOxc } = await import("vite");
  const source = fs.readFileSync(path.join(__dirname, "../src/native-agent-state.ts"), "utf8");
  const { code } = await transformWithOxc(source.replace(/export /g, ""), "native-agent-state.ts");
  state = new Function(`${code}\nreturn {mergeNativeEvent,nativeUsage,nativeTurnEvents,updateNativeQuestions};`)();
});
const event = (type, payload, turn = "t1", sequence = 1) => ({ id: `${type}-${sequence}`, type, turn_id: turn, sequence, payload });
test("native usage stays unknown until the server reports a window, never uses lifetime totals", () => {
  assert.equal(state.nativeUsage([]), null);
  assert.deepEqual(state.nativeUsage([event("native_usage", { usage: { inputTokens: 120, cachedInputTokens: 80, outputTokens: 30, totalTokens: 150, modelContextWindow: 1000, lifetimeTotalTokens: 999999 } })]), { inputTokens: 120, cachedInputTokens: 80, outputTokens: 30, totalTokens: 150, modelContextWindow: 1000, lifetimeTotalTokens: 999999 });
});
test("live snapshots replace only matching native item IDs and remain bounded", () => {
  let events = [];
  for (let index = 0; index < 300; index++) events = state.mergeNativeEvent(events, { type: "native_activity", turnId: "t", activity: { id: `cmd${index}`, title: "Command", detail: "pwd", status: "running", kind: "commandExecution" } });
  assert.ok(events.length <= 256);
  events = state.mergeNativeEvent(events, { type: "native_activity", turnId: "t", activity: { id: "cmd299", title: "Command", detail: "pwd", status: "completed", kind: "commandExecution" } });
  assert.equal(events.filter((item) => item.payload.activity.id === "cmd299").length, 1);
  assert.equal(events.at(-1).payload.activity.status, "completed");
  assert.equal(events.at(-2).payload.activity.status, "running");
});
test("latest native turn hides previous turn snapshots while history remains replayable", () => {
  const events = [event("native_activity", { activity: { id: "old" } }), event("user_message", {}, "t2", 2)];
  assert.equal(state.nativeTurnEvents(events).length, 0);
  assert.equal(events.length, 2);
});

test("questions arriving in a background chat are kept until their resolution event", () => {
  const question = { id: "q", questions: [{ id: "x", question: "Which experiment?" }] };
  const pending = state.updateNativeQuestions([], { type: "native_question", threadId: "background", question });
  assert.equal(pending[0].threadId, "background");
  assert.equal(pending[0].question.id, "q");
  assert.deepEqual(state.updateNativeQuestions(pending, { type: "native_question_resolved", threadId: "background", questionId: "q" }), []);
});
