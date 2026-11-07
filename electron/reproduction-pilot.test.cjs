const assert = require("node:assert/strict");
const test = require("node:test");

const { refusal, runPilot } = require("./reproduction/pilot.cjs");

function step(id, overrides = {}) {
  return {
    id,
    title: id,
    detail: "",
    command: "",
    checkpoint: "",
    check: { kind: "manual", reason: "check manually" },
    source: "",
    blocked: "",
    ...overrides,
  };
}

function backend(script = {}) {
  const calls = [];
  return {
    calls,
    async exec(command, { onData } = {}) {
      calls.push(command);
      const entry = script[command];
      if (!entry) return { exitCode: 0, timedOut: false, error: "" };
      if (entry.output) onData?.(entry.output);
      return {
        exitCode: entry.exitCode ?? 0,
        timedOut: Boolean(entry.timedOut),
        error: entry.error || "",
      };
    },
  };
}

function model(decisions) {
  const prompts = [];
  return {
    prompts,
    async complete({ prompt }) {
      prompts.push(prompt);
      const next = decisions.shift();
      if (!next) throw new Error("the script ran out");
      return { json: next };
    },
  };
}

async function pilot({ steps, decisions, script, findings = [], written = null }) {
  const fake = backend(script);
  if (written) {
    fake.writeFile = async (filePath, content) => {
      written.push({ path: filePath, content });
      return filePath;
    };
  }
  const brain = model(decisions);
  const result = await runPilot({
    title: "A paper",
    claims: [{ statement: "Table 2 reports 50.6", expected: 50.6, unit: "points", dataset: "CL-bench", metric: "score" }],
    steps,
    findings,
    backend: fake,
    complete: brain.complete,
  });
  return { result, fake, brain };
}

test("the agent runs a command and finishes when the evidence is real", async () => {
  const { result, fake } = await pilot({
    steps: [step("install", { command: "python3 -m pip install -e ." })],
    script: { "python3 -m pip install -e .": { output: "Successfully installed boto3-1.34.0\n" } },
    decisions: [
      { action: "run", command: "python3 -m pip install -e .", why: "install it" },
      { action: "advance", step: "install", verdict: "passed", evidence: "Successfully installed boto3-1.34.0", note: "extra installed" },
      { action: "done", summary: "environment ready" },
    ],
  });
  assert.equal(result.status, "verified");
  assert.equal(result.steps[0].status, "passed");
  assert.equal(result.steps[0].evidence, "Successfully installed boto3-1.34.0");
  assert.deepEqual(fake.calls, ["python3 -m pip install -e ."]);
  assert.match(result.log, /\$ python3 -m pip install -e \./);
});

test("a verdict with an invented quote is refused and the step stays open", async () => {
  const { result, brain } = await pilot({
    steps: [step("install")],
    script: { "pip install x": { output: "ERROR: nothing to install\n", exitCode: 1 } },
    decisions: [
      { action: "run", command: "pip install x" },
      { action: "advance", step: "install", verdict: "passed", evidence: "Successfully installed x-1.0" },
      { action: "run", command: "pip install x" },
      { action: "done" },
    ],
  });
  assert.equal(result.status, "failed", "the model ran out of script, but no verdict was recorded");
  assert.equal(result.steps[0].status, "pending");
  assert.match(brain.prompts[2], /does not appear in any output/);
});

test("a failing command cannot prove that a step passed", async () => {
  const { result, brain } = await pilot({
    steps: [step("install")],
    script: { "pip install x": { output: "ERROR: no matching distribution\n", exitCode: 1 } },
    decisions: [
      { action: "run", command: "pip install x" },
      { action: "advance", step: "install", verdict: "passed", evidence: "ERROR: no matching distribution" },
      { action: "advance", step: "install", verdict: "failed", evidence: "ERROR: no matching distribution", note: "package gone" },
      { action: "revise", steps: [{ id: "install", title: "Install the extra", detail: "the package was withdrawn" }], note: "needs a person" },
      { action: "advance", step: "install", verdict: "manual", evidence: "ERROR: no matching distribution", note: "someone must choose a replacement" },
      { action: "done", summary: "needs a replacement package" },
    ],
  });
  assert.equal(result.steps[0].status, "manual");
  assert.equal(result.status, "manual");
  assert.match(brain.prompts[2], /did not exit 0/);
  assert.equal(brain.prompts[2].includes("Refused"), false);
});

test("the agent can revise the runbook, and a kept id keeps its verdict", async () => {
  const { result, brain } = await pilot({
    steps: [step("install"), step("run")],
    script: { "make install": { output: "installed into /workspace/.venv\n" } },
    decisions: [
      { action: "run", command: "make install" },
      { action: "advance", step: "install", verdict: "passed", evidence: "installed into /workspace/.venv" },
      {
        action: "revise",
        note: "the launcher needs the dataset first",
        steps: [
          { id: "install", title: "Set up the environment", command: "make install" },
          { id: "data", title: "Fetch CL-bench", detail: "the launcher reads CL_BENCH_DIR" },
          { id: "run", title: "Run the evaluation" },
        ],
      },
      { action: "run", command: "ls data" },
      { action: "advance", step: "data", verdict: "blocked", note: "CL-bench needs an account we do not have" },
      { action: "advance", step: "run", verdict: "blocked", note: "blocked by the missing dataset" },
      { action: "done", summary: "everything except the dataset" },
    ],
  });
  assert.equal(result.steps.length, 3);
  assert.equal(result.steps[0].status, "passed");
  assert.equal(result.steps[0].evidence, "installed into /workspace/.venv");
  assert.equal(result.status, "blocked");
  assert.match(brain.prompts[3], /Fetch CL-bench/);
});

test("a person is asked rather than guessed at", async () => {
  const { result } = await pilot({
    steps: [step("install")],
    decisions: [
      { action: "ask", question: "CL-bench is behind a login. Which account should I use?" },
    ],
  });
  assert.equal(result.status, "manual");
  assert.match(result.summary, /CL-bench is behind a login/);
});

test("destructive commands never reach the machine", () => {
  assert.match(refusal("rm -rf /"), /root directory/);
  assert.match(refusal("sudo rm -rf ~"), /root directory/);
  assert.match(refusal("mkfs.ext4 /dev/sda1"), /filesystem/);
  assert.equal(refusal("rm -rf build/"), "");
  assert.equal(refusal("pip install -e ."), "");
});

test("a destructive command is refused and the run continues", async () => {
  const { result, fake, brain } = await pilot({
    steps: [step("install")],
    script: { "ls -a": { output: "pyproject.toml\nREADME.md\n" } },
    decisions: [
      { action: "run", command: "rm -rf /" },
      { action: "run", command: "ls -a" },
      { action: "advance", step: "install", verdict: "passed", evidence: "pyproject.toml" },
      { action: "done", summary: "ok" },
    ],
  });
  assert.deepEqual(fake.calls, ["ls -a"]);
  assert.match(brain.prompts[1], /Refused/);
  assert.equal(result.status, "verified");
});

test("the agent is stopped when it keeps running commands without moving the runbook", async () => {
  const decisions = [];
  for (let index = 0; index < 21; index += 1) decisions.push({ action: "run", command: `echo ${index}` });
  const { result } = await pilot({ steps: [step("install")], decisions });
  assert.equal(result.status, "blocked");
  assert.match(result.summary, /without a verdict, a runbook change or a finding/);
});

test("the prompt carries what earlier runs learned and the last output", async () => {
  const { brain } = await pilot({
    steps: [step("install", { checkpoint: "python3 -c \"import boto3\" exits 0" })],
    findings: [{ at: "", text: "this machine has python3 but no python" }],
    script: { "pip3 install -e .": { output: "Could not find a version that satisfies the requirement hatchling\n", exitCode: 1 } },
    decisions: [
      { action: "run", command: "pip3 install -e ." },
      { action: "ask", question: "stop" },
    ],
  });
  assert.match(brain.prompts[1], /this machine has python3 but no python/);
  assert.match(brain.prompts[1], /Could not find a version that satisfies the requirement hatchling/);
  assert.match(brain.prompts[1], /No candidate for `hatchling`/);
  assert.match(brain.prompts[1], /Table 2 reports 50\.6/);
});

test("done is refused while a runbook step has no verdict", async () => {
  const { result, brain } = await pilot({
    steps: [step("install")],
    decisions: [{ action: "done" }],
  });
  assert.equal(result.status, "failed", "the script ran out, but nothing was marked done");
  assert.equal(result.steps[0].status, "pending");
  assert.match(brain.prompts[1], /still has no verdict/);
});

test("a reopened run keeps the verdicts the last one earned", async () => {
  const { result, fake } = await pilot({
    steps: [
      step("install", { status: "passed", evidence: "Successfully installed boto3-1.34.0", exit_code: 0 }),
      step("run"),
    ],
    script: { "bash run.sh": { output: "wrote outputs/summary.json\n" } },
    decisions: [
      { action: "run", command: "bash run.sh" },
      { action: "advance", step: "run", verdict: "passed", evidence: "wrote outputs/summary.json" },
      { action: "done", summary: "already installed; ran the evaluation" },
    ],
  });
  assert.equal(result.status, "verified");
  assert.deepEqual(result.steps.map((entry) => entry.status), ["passed", "passed"]);
  assert.equal(result.steps[0].evidence, "Successfully installed boto3-1.34.0");
  assert.deepEqual(fake.calls, ["bash run.sh"], "the install step is not run twice");
});

test("an error-driven fix is written back to the runbook", async () => {
  const { result, fake, brain } = await pilot({
    steps: [step("install", { command: 'python -m pip install -e ".[cl]"' })],
    script: {
      'python -m pip install -e ".[cl]"': { output: "bash: python: command not found\n", exitCode: 127 },
      'python3 -m pip install -e ".[cl]"': { output: "Successfully installed boto3-1.34.0\n" },
    },
    decisions: [
      { action: "run", command: 'python -m pip install -e ".[cl]"' },
      { action: "run", command: 'python3 -m pip install -e ".[cl]"' },
      {
        action: "advance",
        step: "install",
        verdict: "passed",
        evidence: "Successfully installed boto3-1.34.0",
        note: "this machine has python3 but no python",
        command: 'python3 -m pip install -e ".[cl]"',
      },
      { action: "done", summary: "installed" },
    ],
  });
  assert.equal(result.status, "verified");
  assert.equal(result.runbook[0].command, 'python3 -m pip install -e ".[cl]"', "the fix is what the next run starts from");
  assert.equal(result.steps[0].evidence, "Successfully installed boto3-1.34.0");
  assert.match(brain.prompts[1], /command not found/);
  assert.deepEqual(fake.calls, ['python -m pip install -e ".[cl]"', 'python3 -m pip install -e ".[cl]"']);
});

test("a long output is kept on the machine and its path is offered", async () => {
  const written = [];
  const long = Array.from({ length: 400 }, (_, index) => `line ${index}: dependency conflict detail`).join("\n");
  const { brain } = await pilot({
    steps: [step("install")],
    written,
    script: { "pip install x": { output: long, exitCode: 1 } },
    decisions: [
      { action: "run", command: "pip install x" },
      { action: "ask", question: "stop" },
    ],
  });
  assert.equal(written.length, 1);
  assert.match(written[0].path, /^\/tmp\/archimedes\/[a-z0-9]+\/1\.log$/);
  assert.match(written[0].content, /line 399/);
  assert.match(brain.prompts[1], /full output \(\d+ lines · \d+ KB\)/);
  assert.match(brain.prompts[1], /grep, sed or tail it instead of re-running/);
});

test("a short output is not copied anywhere", async () => {
  const written = [];
  await pilot({
    steps: [step("install")],
    written,
    script: { "ls": { output: "pyproject.toml\n" } },
    decisions: [
      { action: "run", command: "ls" },
      { action: "ask", question: "stop" },
    ],
  });
  assert.deepEqual(written, []);
});

test("a finding counts as progress, so diagnosis does not look like a stall", async () => {
  const decisions = [];
  for (let index = 0; index < 12; index += 1) {
    decisions.push({ action: "run", command: `probe ${index}` });
    decisions.push({ action: "finding", text: `fact number ${index} about this machine` });
  }
  decisions.push({ action: "ask", question: "credentials are missing" });
  const { result } = await pilot({ steps: [step("install")], decisions, script: {} });
  assert.equal(result.status, "manual");
  assert.equal(result.findings.length, 12);
});

test("the stall message says which command it gave up on", async () => {
  const decisions = [];
  for (let index = 0; index < 21; index += 1) decisions.push({ action: "run", command: `probe ${index}` });
  const { result } = await pilot({ steps: [step("install")], decisions, script: {} });
  assert.equal(result.status, "blocked");
  assert.match(result.summary, /without a verdict, a runbook change or a finding/);
  assert.match(result.summary, /probe 19/);
});

test("the agent sees which keys are set, never their values", async () => {
  const fake = backend({});
  const brain = model([
    { action: "ask", question: "HF_TOKEN is missing" },
  ]);
  await runPilot({
    steps: [step("install")],
    env: [
      { name: "HF_TOKEN", required: true, reason: "downloads SWE-bench Lite", hasValue: false },
      { name: "WANDB_API_KEY", required: false, reason: "logging", hasValue: true },
    ],
    backend: fake,
    complete: brain.complete,
  });
  assert.match(brain.prompts[0], /USER-PROVIDED ENVIRONMENT/);
  assert.match(brain.prompts[0], /HF_TOKEN: missing \(required\)/);
  assert.match(brain.prompts[0], /WANDB_API_KEY: set/);
  assert.equal(brain.prompts[0].includes("wandb-secret-value"), false);
});

test("each turn announces itself so the run panel can show progress", async () => {
  const events = [];
  const { runPilot } = require("./reproduction/pilot.cjs");
  await runPilot({
    steps: [step("install")],
    backend: backend({}),
    complete: model([{ action: "ask", question: "stop" }]).complete,
    emit: (event) => events.push(event),
  });
  const turns = events.filter((event) => event.type === "pilot-turn");
  assert.equal(turns.length, 1);
  assert.equal(turns[0].turn, 1);
  assert.equal(turns[0].maxTurns, 60);
});
