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
