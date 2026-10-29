const assert = require("node:assert/strict");
const test = require("node:test");

const { buildObservationMessages, buildReplyMessages, normalizeObservation, parseJson, runProactiveObservation, runProactiveReply } = require("./proactive-agent.cjs");

const context = {
  section: "chat",
  activity: { level: "active", score: 0.52, pointerRate: 420, keyRate: 90, lastInputAt: Date.now() },
  messages: [{ id: "m1", role: "assistant", text: "We improved throughput by 3x." }],
  suggestions: [],
  evidence: [
    { id: "e1", label: "Recent answer", evidence: { kind: "generic", label: "Recent answer", detail: "We improved throughput by 3x." } },
    { id: "e2", label: "Activity", evidence: { kind: "generic", label: "Activity", detail: "Active" } },
  ],
};

test("parses fenced JSON and rejects prose-only answers", () => {
  assert.deepEqual(parseJson('```json\n{"shouldSuggest":true}\n```'), { shouldSuggest: true });
  assert.equal(parseJson("I think you should read page 4."), null);
});

test("observation must cite supplied evidence ids and a safe action", () => {
  const parsed = normalizeObservation({
    shouldSuggest: true,
    source: "chat",
    title: "Add a citation for the 3x claim.",
    whyNow: "The latest answer states a 3x result while you are actively editing.",
    evidenceIds: ["e1", "invented"],
    confidence: 0.8,
    action: { kind: "insert", label: "Draft citation", text: "Find a source for the 3x claim." },
  }, context);
  assert.deepEqual(parsed.evidenceIds, ["e1"]);
  assert.equal(parsed.action.kind, "insert");
  assert.equal(normalizeObservation({ shouldSuggest: true, title: "Reword", whyNow: "x", evidenceIds: ["invented"] }, context), null);
  assert.equal(normalizeObservation({ shouldSuggest: false }, context), null);
});

test("unsafe or missing actions degrade to a draft", () => {
  const parsed = normalizeObservation({
    shouldSuggest: true,
    source: "chat",
    title: "Summarize the last two papers.",
    whyNow: "Two papers were opened in the last minute.",
    evidenceIds: ["e1"],
    action: { kind: "run", label: "", text: "" },
  }, context);
  assert.equal(parsed.action.kind, "insert");
  assert.match(parsed.action.text, /Summarize/);
});

test("prompts keep tools off and require evidence", () => {
  const observation = buildObservationMessages(context);
  assert.match(observation[0].content, /evidenceIds must contain at least one id/);
  assert.match(observation[1].content, /"e1"/);
  const reply = buildReplyMessages({ prompt: "Why did you suggest that?", context });
  assert.match(reply[0].content, /cannot open, edit, run, or save/);
});

test("runs both model roles through the injected completer", async () => {
  const calls = [];
  const complete = async (config, messages, options) => {
    calls.push({ config, messages, options });
    return { content: '{"shouldSuggest":true,"source":"chat","title":"Cite the 3x claim","whyNow":"The answer states a result without a source.","evidenceIds":["e1"],"confidence":0.7,"action":{"kind":"insert","label":"Draft citation","text":"Find a source."}}' };
  };
  const config = { provider: "deepseek", model: "deepseek-chat", apiKey: "test-key", baseUrl: "https://api.deepseek.com" };
  const result = await runProactiveObservation({ context }, { complete, config });
  assert.equal(result.title, "Cite the 3x claim");
  assert.equal(calls[0].options.allowTools, false);
  assert.equal(calls[0].config.model, "deepseek-chat");

  const replyComplete = async () => ({ content: "Because the claim has no source." });
  const reply = await runProactiveReply({ prompt: "Why?", context }, { complete: replyComplete, config });
  assert.equal(reply.text, "Because the claim has no source.");
  assert.equal(reply.model, "deepseek-chat");
});
