const test = require("node:test");
const assert = require("node:assert/strict");
const { prepareFigurePlan } = require("./figure-forge.cjs");

const paperText = "[Page 1] A research method and evidence. ".repeat(8);
const config = { apiKey: "test", model: "test-model", provider: "test" };

test("paper planning calls the configured model without tools and returns its draft", async () => {
  let request;
  const result = await prepareFigurePlan({ paperText, figureType: "pipeline", requirements: "left to right", language: "zh" }, {
    config,
    complete: async (_config, messages, options) => { request = { messages, options }; return { content: "  Draft plan  " }; },
  });
  assert.equal(result.plan, "Draft plan");
  assert.equal(request.options.allowTools, false);
  assert.match(request.messages[1].content, /Language: Chinese/);
  assert.match(request.messages[1].content, /Figure type: pipeline/);
  assert.match(request.messages[1].content, /\[Page 1\]/);
});

test("paper planning rejects missing credentials, short text and empty model output", async () => {
  await assert.rejects(prepareFigurePlan({ paperText: "short" }, { config, complete: async () => ({}) }), /100/);
  await assert.rejects(prepareFigurePlan({ paperText }, { config: {}, complete: async () => ({}) }), /Configure/);
  await assert.rejects(prepareFigurePlan({ paperText }, { config, complete: async () => ({ content: "" }) }), /empty/);
});

test("paper planning limits input before sending to the model", async () => {
  let called = false;
  await assert.rejects(prepareFigurePlan({ paperText: "x".repeat(60_001) }, { config, complete: async () => { called = true; } }), /60,000/);
  assert.equal(called, false);
});
