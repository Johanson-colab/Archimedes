const assert = require("node:assert/strict");
const test = require("node:test");
const { prepareConversation } = require("./context.cjs");

test("project instructions and the compacted summary reach the model before new messages", () => {
  const result = prepareConversation({ thread: { context_summary: "Earlier decision: use dataset A", turns: [{ id: "new", user_message: "Continue", assistant_message: "" }] }, currentTurnId: "new", mode: "free-chat", projectInstructions: "Run npm test after editing." });
  assert.match(result.messages[1].content, /Run npm test/);
  assert.match(result.messages[2].content, /Earlier decision/);
  assert.equal(result.messages.at(-1).content, "Continue");
});

test("uses the Free chat instructions without falling back to Idea spark", () => {
  const conversation = prepareConversation({
    thread: {
      context_summary: "",
      turns: [{
        id: "turn-1",
        user_message: "Tell me something interesting.",
        assistant_message: "",
      }],
    },
    currentTurnId: "turn-1",
    mode: "free-chat",
  });

  assert.match(conversation.messages[0].content, /Operate in Free chat mode/);
  assert.match(conversation.messages[0].content, /without forcing the conversation into a research workflow/);
  assert.doesNotMatch(conversation.messages[0].content, /Produce a small set of novel, testable ideas/);
});

test("adds the selected reasoning policy to the system instructions", () => {
  const conversation = prepareConversation({
    thread: {
      context_summary: "",
      turns: [{ id: "turn-1", user_message: "Check this claim.", assistant_message: "" }],
    },
    currentTurnId: "turn-1",
    mode: "free-chat",
    reasoningInstruction: "Use high reasoning effort and verify consequential claims.",
  });

  assert.match(conversation.messages[0].content, /Use high reasoning effort/);
});

test("keeps expanded long-turn context without the previous 40k clipping limit", () => {
  const longReply = "r".repeat(55_000);
  const conversation = prepareConversation({
    thread: {
      context_summary: "",
      turns: [
        { id: "turn-1", user_message: "Read this result.", assistant_message: longReply },
        { id: "turn-2", user_message: "Continue the analysis.", assistant_message: "" },
      ],
    },
    currentTurnId: "turn-2",
    mode: "free-chat",
  });

  assert.equal(conversation.messages[2].content.length, longReply.length);
  assert.doesNotMatch(conversation.messages[2].content, /truncated by the Archimedes context budget/);
});

test("still marks a message that exceeds the expanded per-message safety limit", () => {
  const conversation = prepareConversation({
    thread: {
      context_summary: "",
      turns: [{ id: "turn-1", user_message: "x".repeat(70_000), assistant_message: "" }],
    },
    currentTurnId: "turn-1",
    mode: "free-chat",
  });

  assert.match(conversation.messages.at(-1).content, /truncated by the Archimedes context budget/);
});

test("accepts the selected extra-long context budget when preserving history", () => {
  const historicalTurns = Array.from({ length: 8 }, (_, index) => ({
    id: `turn-${index + 1}`,
    user_message: `Question ${index + 1}`,
    assistant_message: "r".repeat(55_000),
  }));
  const conversation = prepareConversation({
    thread: {
      context_summary: "",
      turns: [
        ...historicalTurns,
        { id: "turn-9", user_message: "Continue the analysis.", assistant_message: "" },
      ],
    },
    currentTurnId: "turn-9",
    mode: "free-chat",
    contextCharacterLimit: 600_000,
  });

  assert.equal(conversation.compacted, false);
  assert.equal(conversation.messages.filter((message) => message.role === "assistant").length, 8);
});

test('restores bounded complete tool groups while excluding worker and orphan results', () => {
  const call = { id: 'call-1', type: 'function', function: { name: 'read_workspace_file', arguments: '{"path":"a.md"}' } };
  const thread = { context_summary: '', turns: [{ id: 'old', user_message: 'Read it', assistant_message: 'Done' }, { id: 'new', user_message: 'Continue', assistant_message: '' }], events: [
    { turn_id: 'old', type: 'assistant_step', payload: { tool_calls: [call], content: '' } },
    { turn_id: 'old', type: 'tool_result', payload: { call_id: 'call-1', content: '{"text":"evidence"}' } },
    { turn_id: 'old', type: 'tool_result', payload: { call_id: 'call-1', worker_id: 'worker', content: 'private worker data' } },
    { turn_id: 'old', type: 'assistant_step', payload: { tool_calls: [{ ...call, id: 'orphan' }] } },
  ] };
  const result = prepareConversation({ thread, currentTurnId: 'new', mode: 'free-chat' });
  assert.deepEqual(result.messages.map(m => m.role), ['system', 'user', 'assistant', 'tool', 'assistant', 'user']);
  assert.equal(result.messages[3].tool_call_id, 'call-1');
  assert.doesNotMatch(JSON.stringify(result.messages), /private worker data|orphan/);
});


test("new chat modes use their own instructions and unknown modes fall back to Standard", () => {
  const thread = { context_summary: "", turns: [{ id: "one", user_message: "hello" }] };
  const instruction = mode => prepareConversation({ thread, currentTurnId: "one", mode }).messages[0].content;
  assert.match(instruction("standard"), /Standard mode/);
  assert.doesNotMatch(instruction("standard"), /Operate in Idea spark mode/);
  assert.match(instruction("research"), /Research mode/);
  assert.match(instruction("create"), /Create mode/);
  assert.match(instruction("unknown"), /Standard mode/);
});
