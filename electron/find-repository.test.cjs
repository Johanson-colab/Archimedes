const assert = require("node:assert/strict");
const test = require("node:test");

const { findRepository, titleTokens } = require("./reproduction/find-repository.cjs");

const PAPER = {
  title: "Evo-Harness: Context-to-Harness Skill Compilation",
  authors: ["A. Researcher"],
  url: "https://arxiv.org/abs/2608.15071",
  abstract: "We describe a method.",
};

function verifier({ reachable = [], readmes = {} } = {}) {
  const calls = [];
  return {
    calls,
    async reachable(url) { calls.push(`reachable:${url}`); return reachable.includes(url); },
    async readme(url) { calls.push(`readme:${url}`); return readmes[url] || ""; },
  };
}

function agentReturning(candidates) {
  let calls = 0;
  return {
    get calls() { return calls; },
    async runAgent() {
      calls += 1;
      return { response: JSON.stringify({ candidates }) };
    },
  };
}

test("the repository whose README names the paper is accepted", async () => {
  const agent = agentReturning([
    { url: "https://github.com/A-EVO-Lab/evo-harness", why: "linked in the abstract", confidence: "high" },
  ]);
  const check = verifier({
    reachable: ["https://github.com/A-EVO-Lab/evo-harness"],
    readmes: { "https://github.com/A-EVO-Lab/evo-harness": "# Evo-Harness\nContext-to-Harness skill compilation (arXiv 2608.15071)." },
  });
  const found = await findRepository({ paper: PAPER, runAgent: agent.runAgent, verifier: check });
  assert.equal(found.url, "https://github.com/A-EVO-Lab/evo-harness");
  assert.equal(found.confidence, "high");
  assert.match(found.evidence, /named after the paper/);
});

test("a reachable repository that never mentions the paper is not accepted", async () => {
  const agent = agentReturning([{ url: "https://github.com/someone/unrelated", why: "search hit", confidence: "low" }]);
  const check = verifier({
    reachable: ["https://github.com/someone/unrelated"],
    readmes: { "https://github.com/someone/unrelated": "# unrelated\nA completely different project." },
  });
  const found = await findRepository({ paper: PAPER, runAgent: agent.runAgent, verifier: check });
  assert.equal(found.url, "", "a plausible URL is not evidence");
  assert.equal(found.confidence, "low");
  assert.match(found.evidence, /does not mention this paper/);
});

test("a repository that does not answer is dropped before any README is read", async () => {
  const agent = agentReturning([{ url: "https://github.com/gone/missing" }]);
  const check = verifier({ reachable: [] });
  const found = await findRepository({ paper: PAPER, runAgent: agent.runAgent, verifier: check });
  assert.equal(found.url, "");
  assert.ok(!check.calls.some((call) => call.startsWith("readme:")), "nothing to read when the remote does not answer");
});

test("non-GitHub candidates are ignored instead of guessed at", async () => {
  const agent = agentReturning([
    { url: "https://gitlab.com/owner/repo" },
    { url: "https://huggingface.co/owner/model" },
  ]);
  const found = await findRepository({ paper: PAPER, runAgent: agent.runAgent, verifier: verifier() });
  assert.equal(found.url, "");
  assert.deepEqual(found.candidates, []);
});

test("the same repository proposed twice is only checked once", async () => {
  const agent = agentReturning([
    { url: "https://github.com/A-EVO-Lab/evo-harness" },
    { url: "https://github.com/A-EVO-Lab/evo-harness.git" },
  ]);
  const check = verifier({
    reachable: ["https://github.com/A-EVO-Lab/evo-harness"],
    readmes: { "https://github.com/A-EVO-Lab/evo-harness": "Evo-Harness context compilation" },
  });
  await findRepository({ paper: PAPER, runAgent: agent.runAgent, verifier: check });
  assert.equal(check.calls.filter((call) => call.startsWith("reachable:")).length, 1);
});

test("provided candidates skip the model entirely", async () => {
  const agent = agentReturning([{ url: "https://github.com/should/not/be/used" }]);
  const found = await findRepository({
    paper: PAPER,
    runAgent: agent.runAgent,
    verifier: verifier(),
    candidates: [{ url: "https://github.com/A-EVO-Lab/evo-harness" }],
  });
  assert.equal(agent.calls, 0);
  assert.equal(found.url, "");
});

test("no candidates means no search and no answer", async () => {
  const agent = agentReturning([]);
  const found = await findRepository({ paper: PAPER, runAgent: agent.runAgent, verifier: verifier() });
  assert.deepEqual(found, { url: "", confidence: "", evidence: "", candidates: [] });
});

test("title tokens ignore filler words and short words", () => {
  const tokens = titleTokens("Evo-Harness: Context-to-Harness Skill Compilation with Large Language Models");
  assert.ok(tokens.includes("harness"));
  assert.ok(tokens.includes("compilation"));
  assert.ok(!tokens.includes("with"));
  assert.ok(!tokens.includes("large"));
  assert.ok(!tokens.includes("models"));
});

test("a keyless search runs before the model", async () => {
  let searched = 0;
  let modelled = 0;
  const found = await findRepository({
    paper: PAPER,
    searcher: async () => { searched += 1; return [{ url: "https://github.com/A-EVO-Lab/evo-harness" }]; },
    runAgent: async () => { modelled += 1; return { response: "{}" }; },
    verifier: verifier({
      reachable: ["https://github.com/A-EVO-Lab/evo-harness"],
      readmes: { "https://github.com/A-EVO-Lab/evo-harness": "Evo-Harness: context-to-harness skill compilation." },
    }),
  });
  assert.equal(found.url, "https://github.com/A-EVO-Lab/evo-harness");
  assert.equal(searched, 1);
  assert.equal(modelled, 0, "the model is not paid for when a search already answered");
});

test("the model is used when the search found nothing usable", async () => {
  let modelled = 0;
  const found = await findRepository({
    paper: PAPER,
    searcher: async () => [],
    runAgent: async () => { modelled += 1; return { response: JSON.stringify({ candidates: [{ url: "https://github.com/A-EVO-Lab/evo-harness" }] }) }; },
    verifier: verifier({
      reachable: ["https://github.com/A-EVO-Lab/evo-harness"],
      readmes: { "https://github.com/A-EVO-Lab/evo-harness": "Evo-Harness: context-to-harness skill compilation." },
    }),
  });
  assert.equal(found.url, "https://github.com/A-EVO-Lab/evo-harness");
  assert.equal(modelled, 1);
});

test("a popular list repository that mentions everything is not accepted", async () => {
  // A survey repo can name the paper without being the paper's code.
  const agent = agentReturning([{ url: "https://github.com/RUCAIBox/LLMSurvey" }]);
  const found = await findRepository({
    paper: PAPER,
    runAgent: agent.runAgent,
    verifier: verifier({
      reachable: ["https://github.com/RUCAIBox/LLMSurvey"],
      readmes: { "https://github.com/RUCAIBox/LLMSurvey": "Evo-Harness context-to-harness skill compilation, see also dozens of other papers." },
    }),
  });
  assert.equal(found.url, "", "title words alone are not ownership");
  assert.equal(found.candidates[0].matched, false, "the name has to look like the paper, not like a list");
  assert.equal(found.candidates[0].hits >= 3, true, "it did match the words, which is why the name check matters");
});
