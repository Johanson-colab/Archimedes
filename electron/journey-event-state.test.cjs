const assert = require("node:assert/strict");
const test = require("node:test");

const { chapterChunkStatus, eventFailedAnswer, eventHasError, isUnresolvedError, latestAnswerOrdinal } = require("../src/journeyEventState.ts");

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
  const latest = latestAnswerOrdinal(events);
  assert.equal(latest, 6);
  assert.equal(isUnresolvedError(events[2], latest), false);
  assert.equal(events.filter((item, index) => isUnresolvedError(item, latest, index)).length, 0);
});

test("keeps errors after the latest answer or in failed turns unresolved", () => {
  const afterAnswer = [
    event(1, "assistant_message", { text: "previous turn" }),
    event(2, "tool_call", { call_id: "call-1", name: "run_command" }),
    event(3, "tool_result", { call_id: "call-1", content: JSON.stringify({ error: "exit 1" }) }),
  ];
  const latest = latestAnswerOrdinal(afterAnswer);
  assert.equal(latest, 1);
  assert.equal(isUnresolvedError(afterAnswer[2], latest, 2), true);

  const failedTurn = [
    event(1, "user_message", { text: "run it" }),
    event(2, "tool_call", { call_id: "call-1", name: "run_command" }),
    event(3, "tool_result", { call_id: "call-1", content: JSON.stringify({ error: "exit 1" }) }),
  ];
  const failedLatest = latestAnswerOrdinal(failedTurn);
  assert.equal(failedLatest, 0);
  assert.equal(isUnresolvedError(failedTurn[2], failedLatest, 2), true);
});

test("failed or interrupted answers do not resolve earlier errors", () => {
  const events = [
    event(1, "assistant_message", { text: "previous turn", status: "completed" }),
    event(2, "tool_result", { content: JSON.stringify({ error: "exit 1" }) }),
    event(3, "assistant_message", { text: "turn failed", status: "failed" }),
  ];
  const latest = latestAnswerOrdinal(events);
  assert.equal(latest, 1);
  assert.equal(isUnresolvedError(events[1], latest, 1), true);
  assert.equal(isUnresolvedError(events[2], latest, 2), true);
});

test("treats a failed assistant message as an error even without an error field", () => {
  const failed = event(1, "assistant_message", { text: "Run aborted (BadRequestError)", status: "failed" });
  const completed = event(2, "assistant_message", { text: "done", status: "completed" });
  assert.equal(eventFailedAnswer(failed), true);
  assert.equal(eventHasError(failed), true);
  assert.equal(eventFailedAnswer(completed), false);
  assert.equal(eventHasError(completed), false);
  assert.equal(eventFailedAnswer(event(3, "tool_error", {})), false);
  assert.equal(eventHasError(event(4, "assistant_message", { text: "done", status: "error" })), true);
});

test("only the final chunk of a turn waits for an answer", () => {
  assert.equal(chapterChunkStatus({ hasAnswer: false, hasFailure: false, lastInTurn: false, turnFailed: false }), "done");
  assert.equal(chapterChunkStatus({ hasAnswer: false, hasFailure: false, lastInTurn: true, turnFailed: false }), "open");
  assert.equal(chapterChunkStatus({ hasAnswer: true, hasFailure: false, lastInTurn: true, turnFailed: false }), "done");
  assert.equal(chapterChunkStatus({ hasAnswer: true, hasFailure: true, lastInTurn: true, turnFailed: true }), "error");
  assert.equal(chapterChunkStatus({ hasAnswer: false, hasFailure: false, lastInTurn: true, turnFailed: true }), "error");
  assert.equal(chapterChunkStatus({ hasAnswer: false, hasFailure: false, lastInTurn: false, turnFailed: true }), "done");
});

test("an error on the final assistant response stays unresolved", () => {  const events = [
    event(1, "assistant_message", { text: "earlier answer" }),
    event(2, "assistant_message", { error: "final response failed" }),
  ];
  const latest = latestAnswerOrdinal(events);
  assert.equal(latest, 2);
  assert.equal(isUnresolvedError(events[1], latest, 1), true);
});


test("uses thread-wide ordinals when turns restart their sequences", () => {
  const events = [
    { id: "a1", turn_id: "turn-a", sequence: 1, ordinal: 1, type: "assistant_message", payload: { text: "first turn" }, created_at: "2026-10-25T00:00:00.000Z" },
    { id: "b1", turn_id: "turn-b", sequence: 1, ordinal: 2, type: "tool_result", payload: { content: JSON.stringify({ error: "ENOENT" }) }, created_at: "2026-10-25T00:01:00.000Z" },
    { id: "b2", turn_id: "turn-b", sequence: 2, ordinal: 3, type: "assistant_message", payload: { text: "second turn" }, created_at: "2026-10-25T00:02:00.000Z" },
  ];
  assert.equal(latestAnswerOrdinal(events), 3);
  assert.equal(isUnresolvedError(events[1], 3, 1), false);
  assert.equal(isUnresolvedError(events[1], latestAnswerOrdinal(events.slice(0, 2)), 1), true);
});
