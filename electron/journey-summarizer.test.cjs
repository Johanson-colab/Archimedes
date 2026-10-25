const assert = require("node:assert/strict");
const test = require("node:test");

const { buildPrompt, parseSummary, summarizeJourney, validateSummary } = require("./journey-summarizer.cjs");

const input = {
  threadId: "thread-1",
  threadTitle: "Retrieval budget controls",
  brief: "Rule-based brief.",
  coversTo: 42,
  sources: [{ id: "source-1", title: "Retrieval budget paper", url: "https://example.test/paper", eventId: 12 }],
  chapters: [
    {
      id: "chapter-1",
      title: "Frame the task",
      summary: "3 steps",
      status: "done",
      steps: 3,
      episodes: [
        { id: "episode-1", title: "Read paper", outcome: "paper.pdf", status: "done", steps: 2 },
      ],
    },
    {
      id: "chapter-2",
      title: "Draft the brief",
      summary: "4 steps",
      status: "waiting",
      steps: 4,
      episodes: [
        { id: "episode-2", title: "Write file", outcome: "notes.md", status: "waiting", steps: 2 },
      ],
    },
  ],
};

const settings = { summaryLength: "standard", summaryTokenBudget: 500, targetEpisodes: 4 };
const config = { provider: "openai", apiKey: "test-key", model: "test-model", baseUrl: "https://example.test" };

function response(value) {
  return { content: typeof value === "string" ? value : JSON.stringify(value) };
}

test("summarizer parses fenced JSON and validates ids", async () => {
  let capturedOptions = null;
  const snapshot = await summarizeJourney({
    input,
    settings,
    previous: null,
    config,
    complete: async (_config, _messages, options) => {
      capturedOptions = options;
      return response("```json\n" + JSON.stringify({
        brief: "The agent framed the task and drafted a brief.",
        nextMove: "Review the draft.",
        chapters: [
          {
            id: "chapter-1",
            title: "Framed the evidence question",
            summary: "The request was split into three axes.",
            episodes: [{ id: "episode-1", title: "Read the retrieval paper", outcome: "Recall and cost were compared." }],
          },
          {
            id: "unknown",
            title: "Should be ignored",
            summary: "Unknown",
            episodes: [],
          },
        ],
      }) + "\n```");
    },
  });
  assert.equal(snapshot.threadId, "thread-1");
  assert.equal(snapshot.coversTo, 42);
  assert.equal(snapshot.model, "test-model");
  assert.equal(snapshot.brief, "The agent framed the task and drafted a brief.");
  assert.equal(snapshot.nextMove, "Review the draft.");
  assert.equal(snapshot.chapters.length, 2);
  assert.equal(snapshot.chapters[0].title, "Framed the evidence question");
  assert.equal(snapshot.chapters[0].episodes[0].title, "Read the retrieval paper");
  assert.equal(snapshot.chapters[1].title, "Draft the brief");
  assert.equal(snapshot.chapters[1].summary, "4 steps");
  assert.equal(capturedOptions.allowTools, false);
  assert.equal(capturedOptions.maxOutputTokens, 500);
  assert.equal(capturedOptions.reasoningEffort, "low");
});

test("claims are validated against supplied sources", async () => {
  const snapshot = await summarizeJourney({
    input,
    settings,
    previous: null,
    config,
    complete: async () => response({
      brief: "Brief",
      nextMove: "Continue",
      chapters: [],
      claims: [
        { id: "claim-1", text: "Adaptive stopping preserves recall.", status: "supported", sourceIds: ["source-1"] },
        { id: "claim-2", text: "Reranking is cheaper on multi-hop.", status: "contradicted", sourceIds: ["source-404"] },
        { id: "claim-3", text: "Budget-aware reranking helps.", status: "open", sourceIds: [] },
        { id: "claim-4", text: "   ", status: "supported", sourceIds: ["source-1"] },
      ],
    }),
  });
  assert.equal(snapshot.claims.length, 3);
  assert.equal(snapshot.claims[0].status, "supported");
  assert.deepEqual(snapshot.claims[0].sourceIds, ["source-1"]);
  assert.equal(snapshot.claims[1].status, "open");
  assert.deepEqual(snapshot.claims[1].sourceIds, []);
});

test("claims fall back to the previous snapshot when the model omits them", async () => {
  const snapshot = await summarizeJourney({
    input,
    settings,
    previous: {
      brief: "Old brief.",
      claims: [
        { id: "claim-1", text: "Adaptive stopping preserves recall.", status: "supported", sourceIds: ["source-1"] },
        { id: "claim-2", text: "A stale claim.", status: "supported", sourceIds: ["source-404"] },
      ],
    },
    config,
    complete: async () => response({ brief: "Brief", nextMove: "Continue", chapters: [] }),
  });
  assert.equal(snapshot.claims.length, 2);
  assert.equal(snapshot.claims[0].status, "supported");
  assert.deepEqual(snapshot.claims[0].sourceIds, ["source-1"]);
  assert.equal(snapshot.claims[1].status, "open");
  assert.deepEqual(snapshot.claims[1].sourceIds, []);
});

test("chapter plans are contiguous, validated, and capped", () => {
  const planInput = {
    ...input,
    chapters: [
      ...input.chapters,
      { id: "chapter-3", title: "Check evidence", summary: "2 steps", status: "done", steps: 2, episodes: [] },
      { id: "chapter-4", title: "Write the answer", summary: "2 steps", status: "done", steps: 2, episodes: [] },
    ],
  };
  const planSettings = { ...settings, chapterDetection: "ai", maxChapters: 2 };
  const raw = {
    brief: "Brief",
    nextMove: "Continue",
    chapters: [],
    chapterPlan: [
      { id: "plan-1", title: "Frame and draft", summary: "Two phases.", chapterIds: ["chapter-1", "chapter-2"] },
      { id: "plan-2", title: "Overlap", summary: "Invalid.", chapterIds: ["chapter-2", "chapter-3"] },
      { id: "plan-3", title: "Gap", summary: "Not contiguous.", chapterIds: ["chapter-1", "chapter-3"] },
      { id: "plan-4", title: "Later", summary: "Single.", chapterIds: ["chapter-4"] },
    ],
  };
  const snapshot = validateSummary(raw, planInput, null, config, planSettings);
  assert.equal(snapshot.chapterPlan.length, 2);
  assert.deepEqual(snapshot.chapterPlan[0].chapterIds, ["chapter-1", "chapter-2", "chapter-3"]);
  assert.deepEqual(snapshot.chapterPlan[1].chapterIds, ["chapter-4"]);
  assert.equal(snapshot.chapterPlan[0].title, "Frame and draft");
  const turns = validateSummary(raw, planInput, null, config, { ...planSettings, chapterDetection: "turns" });
  assert.deepEqual(turns.chapterPlan, []);
});

test("economy model overrides the active model without mutating config", async () => {
  let captured = null;
  const snapshot = await summarizeJourney({
    input,
    settings: { ...settings, summaryModel: "economy", economyModel: "cheap-model" },
    previous: null,
    config,
    complete: async (runtimeConfig) => {
      captured = runtimeConfig;
      return response({ brief: "Economy brief.", nextMove: "Continue.", chapters: [] });
    },
  });
  assert.equal(captured.model, "cheap-model");
  assert.equal(snapshot.model, "cheap-model");
  assert.equal(config.model, "test-model");
});

test("summarizer retries once when the model returns invalid JSON", async () => {
  let calls = 0;
  const snapshot = await summarizeJourney({
    input,
    settings,
    previous: null,
    config,
    complete: async () => {
      calls += 1;
      return calls === 1 ? response("not json") : response({ brief: "Recovered brief.", nextMove: "Continue.", chapters: [] });
    },
  });
  assert.equal(calls, 2);
  assert.equal(snapshot.brief, "Recovered brief.");
  assert.equal(snapshot.chapters[0].title, "Frame the task");
});

test("empty JSON is retried before accepting the fallback", async () => {
  let calls = 0;
  const snapshot = await summarizeJourney({
    input,
    settings,
    previous: null,
    config,
    complete: async () => {
      calls += 1;
      return calls === 1 ? response({}) : response({ brief: "Second attempt.", nextMove: "", chapters: [] });
    },
  });
  assert.equal(calls, 2);
  assert.equal(snapshot.brief, "Second attempt.");
});

test("summarizer falls back to previous text when output is incomplete", async () => {
  const previous = { brief: "Previous brief.", nextMove: "Previous move.", chapters: [] };
  const snapshot = await summarizeJourney({
    input,
    settings,
    previous,
    config,
    complete: async () => response({ chapters: [{ id: "chapter-1", title: "", summary: "" }] }),
  });
  assert.equal(snapshot.brief, "Previous brief.");
  assert.equal(snapshot.nextMove, "Previous move.");
  assert.equal(snapshot.chapters[0].title, "Frame the task");
  assert.equal(snapshot.chapters[0].episodes[0].title, "Read paper");
});

test("summarizer rejects missing model credentials and invalid JSON", async () => {
  await assert.rejects(
    summarizeJourney({ input, settings, config: { provider: "custom", apiKey: "", model: "x" }, complete: async () => response({}) }),
    /API key/,
  );
  await assert.rejects(
    summarizeJourney({ input, settings, config, complete: async () => response("still not json") }),
    /valid Journey summary/,
  );
});

test("prompt includes ids, length guidance, and token budget", () => {
  const messages = buildPrompt(input, settings, { brief: "Old brief." });
  assert.match(messages[0].content, /JSON/);
  assert.match(messages[0].content, /2-4 sentence/);
  assert.match(messages[0].content, /500 tokens/);
  const payload = JSON.parse(messages[1].content);
  assert.equal(payload.chapters[0].id, "chapter-1");
  assert.equal(payload.sources[0].id, "source-1");
  assert.equal(payload.chapters[0].episodes[0].id, "episode-1");
  assert.equal(payload.previousBrief, "Old brief.");
  const aiMessages = buildPrompt(input, { ...settings, chapterDetection: "ai", maxChapters: 3 }, null);
  assert.match(aiMessages[0].content, /chapterPlan/);
  const aiPayload = JSON.parse(aiMessages[1].content);
  assert.equal(aiPayload.chapterDetection, "ai");
  assert.equal(aiPayload.maxChapters, 3);
});

test("parse and validate tolerate partial output", () => {
  assert.equal(parseSummary("prefix {\"brief\":\"x\"} suffix").brief, "x");
  const snapshot = validateSummary({ brief: "Only a brief." }, input, null, config, settings);
  assert.equal(snapshot.brief, "Only a brief.");
  assert.equal(snapshot.chapters[0].title, "Frame the task");
  assert.equal(snapshot.chapters[1].episodes[0].title, "Write file");
});
