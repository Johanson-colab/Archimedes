const assert = require("node:assert/strict");
const test = require("node:test");

const { eventHasError, isUnresolvedError, latestAnswerSequence } = require("../src/journeyEventState.ts");

function event(sequence, type, payload = {}) {
  return { id: `event-${sequence}`, turn_id: "turn-1", sequence, type, payload, created_at: "2026-10-25T00:00:00.000Z" };
}

test("detects error events and nested tool result errors", () => {
  assert.equal(eventHasError(event(1, "tool_error", {})), true);
  assert.equal(eventHasError(event(2, "tool_result", { content: JSON.stringify({ error: "ENOENT" }) })), true);
  assert.equal(eventHasError(event(3, "tool_result", { content: "ok" })), false);
  assert.equal(eventHasError(event(4, "assistant_message", { error: "model failed" })), true);
  assert.equal(eventHasError(event(5, "assistant_message", { text: "done" })), false);
});

test("uses the latest assistant response as the resolution boundary", () => {
  const events = [
    event(1, "user_message", { text: "read the paper" }),
    event(2, "tool_call", { call_id: "call-1", name: "read_file" }),
    event(3, "tool_result", { call_id: "call-1", content: JSON.stringify({ error: "ENOENT" }) }),
    event(4, "tool_call", { call_id: "call-2", name: "read_file" }),
    event(5, "tool_result", { call_id: "call-2", content: "paper text" }),
    event(6, "assistant_message", { text: "The paper was read after retrying." }),
  ];
  const latest = latestAnswerSequence(events);
  assert.equal(latest, 6);
  assert.equal(isUnresolvedError(events[2], latest), false);
  assert.equal(events.filter((item) => isUnresolvedError(item, latest)).length, 0);
});

test("keeps errors after the latest answer or in failed turns unresolved", () => {
  const afterAnswer = [
    event(1, "assistant_message", { text: "previous turn" }),
    event(2, "tool_call", { call_id: "call-1", name: "run_command" }),
    event(3, "tool_result", { call_id: "call-1", content: JSON.stringify({ error: "exit 1" }) }),
  ];
  const latest = latestAnswerSequence(afterAnswer);
  assert.equal(latest, 1);
  assert.equal(isUnresolvedError(afterAnswer[2], latest), true);

  const failedTurn = [
    event(1, "user_message", { text: "run it" }),
    event(2, "tool_call", { call_id: "call-1", name: "run_command" }),
    event(3, "tool_result", { call_id: "call-1", content: JSON.stringify({ error: "exit 1" }) }),
  ];
  const failedLatest = latestAnswerSequence(failedTurn);
  assert.equal(failedLatest, 0);
  assert.equal(isUnresolvedError(failedTurn[2], failedLatest), true);
});

test("failed or interrupted answers do not resolve earlier errors", () => {
  const events = [
    event(1, "assistant_message", { text: "previous turn", status: "completed" }),
    event(2, "tool_result", { content: JSON.stringify({ error: "exit 1" }) }),
    event(3, "assistant_message", { text: "turn failed", status: "failed" }),
  ];
  const latest = latestAnswerSequence(events);
  assert.equal(latest, 1);
  assert.equal(isUnresolvedError(events[1], latest), true);
});

test("an error on the final assistant response stays unresolved", () => {
  const events = [
    event(1, "assistant_message", { text: "earlier answer" }),
    event(2, "assistant_message", { error: "final response failed" }),
  ];
  const latest = latestAnswerSequence(events);
  assert.equal(latest, 2);
  assert.equal(isUnresolvedError(events[1], latest), true);
});
