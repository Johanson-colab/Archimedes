const assert = require("node:assert/strict");
const test = require("node:test");

const { parseContract, planReproduction } = require("./reproduction/planner.cjs");

const PAPER = { id: "p1", title: "Evo-Harness", abstract: "A paper about harnesses.", authors: ["A. Author"], url: "https://arxiv.org/abs/2608.15071", year: 2026 };

const CONTRACT = {
  summary: "Reproduce Table 1",
  claims: [{ id: "c1", statement: "Evo-Harness reaches 73.03%", expected: 73.03, unit: "percent", tolerance: 0.02 }],
  steps: [{ id: "clone", title: "Clone", detail: "", command: "git clone x", checkpoint: "", check: { kind: "manual", reason: "look" }, source: "", blocked: "" }],
  environment: { python: "3.11" },
};

test("a fenced or chatty reply still yields the contract", () => {
  assert.deepEqual(parseContract(`Here it is:\n\`\`\`json\n${JSON.stringify(CONTRACT)}\n\`\`\``), CONTRACT);
  assert.deepEqual(parseContract(`Sure. ${JSON.stringify(CONTRACT)} That is all.`), CONTRACT);
});

test("trailing commas are repaired instead of rejected", () => {
  assert.deepEqual(parseContract('{"a":1,}'), { a: 1 });
  assert.deepEqual(parseContract('{"a":[1,2,]}'), { a: [1, 2] });
});

test("only the first balanced object is read", () => {
  const text = `{"a":{"b":2}} then some trailing chatter {"c":3}`;
  assert.deepEqual(parseContract(text), { a: { b: 2 } });
});

test("a cut-off reply is reported as cut off, not as malformed", () => {
  assert.throws(() => parseContract('{"a":1'), /stopped before finishing/);
});

test("a malformed reply quotes its own tail so the failure is debuggable", () => {
  assert.throws(() => parseContract('{"a": oops}'), /malformed JSON: …/);
});

test("a broken first reply is retried once and the retry is used", async () => {
  let calls = 0;
  const runAgent = async ({ prompt }) => {
    calls += 1;
    return calls === 1
      ? { response: "I think the steps are: install, then run." }
      : { response: JSON.stringify(CONTRACT) };
  };
  const warnings = [];
  const contract = await planReproduction({
    paper: PAPER,
    pages: [],
    repoUrl: "",
    repoItem: null,
    workspace: "/tmp",
    runAgent,
    emit: (payload) => { if (payload.type === "warning") warnings.push(payload.detail); },
  });
  assert.equal(calls, 2);
  assert.equal(contract.claims.length, 1);
  assert.equal(warnings.length, 1, "the user is told the plan had to be asked for twice");
});

test("two unusable replies surface the original reason", async () => {
  const runAgent = async () => ({ response: "no json at all" });
  await assert.rejects(
    planReproduction({ paper: PAPER, pages: [], repoUrl: "", repoItem: null, workspace: "/tmp", runAgent }),
    /stopped before finishing/,
  );
});

test("names come from .env.example, not only from the model", () => {
  const { envFromFiles } = require("./reproduction/planner.cjs");
  const names = envFromFiles([
    { path: ".env.example", content: "# keys\nHF_TOKEN=hf_xxx\nexport AWS_ACCESS_KEY_ID=\nAWS_SECRET_ACCESS_KEY=\nlower_case=no\n" },
    { path: "README.md", content: "HF_TOKEN=should-not-be-read\n" },
  ]);
  assert.deepEqual(names, ["HF_TOKEN", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]);
});
