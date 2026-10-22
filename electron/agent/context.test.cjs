const assert = require("node:assert/strict");
const test = require("node:test");
const { prepareConversation } = require("./context.cjs");

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
