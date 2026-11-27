const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { prepareConversation } = require("./context.cjs");
const store = require("../store.cjs");

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
    contextCharacterLimit: 1_000_000,
  });

  assert.equal(conversation.compacted, false);
  assert.equal(conversation.messages.filter((message) => message.role === "assistant").length, 8);
});

test('reads stored tool groups in their original order across a checkpoint', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'model-context-checkpoint-'));
  t.after(() => { store.closeAllWorkspaces(); fs.rmSync(root, { recursive: true, force: true }); });
  store.openWorkspace(root);
  const threadId = store.createResearchThread({ prompt: 'Fixture', mode: 'free-chat' }).id;
  const start = prompt => store.startResearchTurn({ threadId, prompt, mode: 'free-chat' });
  const checkpoint = start('Earlier decision');
  store.finishResearchTurn(checkpoint.id, { response: 'Settled' });
  store.compactResearchThread(threadId, 'Earlier decision: preserve the evidence', checkpoint.id);
  const old = start('Read it');
  const call = { id: 'call-1', type: 'function', function: { name: 'read_workspace_file', arguments: '{"path":"a.md"}' } };
  const append = event => store.appendResearchEvent({ threadId, turnId: old.id, ...event });
  append({ type: 'assistant_step', payload: { tool_calls: [{ ...call, id: 'out-of-scope' }] } });
  append({ type: 'tool_result', payload: { call_id: 'out-of-scope', content: 'outside the 200-event cap' } });
  for (let number = 0; number < 200; number++) append({ type: 'status', payload: { number } });
  [
    { type: 'assistant_step', payload: { tool_calls: [call], content: '' } },
    { type: 'tool_result', payload: { call_id: 'call-1', content: '{"text":"evidence"}' } },
    { type: 'tool_result', payload: { call_id: 'call-1', worker_id: 'worker', content: 'private worker data' } },
    { type: 'assistant_step', payload: { tool_calls: [{ ...call, id: 'orphan' }] } },
  ].forEach(append);
  store.finishResearchTurn(old.id, { response: 'Done' });
  const next = start('Continue');
  const thread = store.getResearchThreadContext(threadId);
  const full = store.getResearchThread(threadId);
  assert.deepEqual(thread.events, full.events.filter(event => event.turn_id !== checkpoint.id));
  assert.deepEqual(thread.turns, full.turns.slice(1));
  const result = prepareConversation({ thread, currentTurnId: next.id, mode: 'free-chat' });
  assert.deepEqual(result.messages.map(m => m.role), ['system', 'system', 'user', 'assistant', 'tool', 'assistant', 'user']);
  assert.equal(result.messages[4].tool_call_id, 'call-1');
  assert.doesNotMatch(JSON.stringify(result.messages), /private worker data|orphan|out-of-scope/);
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
