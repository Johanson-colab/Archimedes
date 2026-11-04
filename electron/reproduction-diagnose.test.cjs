const assert = require("node:assert/strict");
const test = require("node:test");

const { applyFix, classifyLog, diagnose, pipProxyFix, pipTrustFix, tail, validate } = require("./reproduction/diagnose.cjs");

const CONTRACT = {
  steps: [
    { id: "install", title: "Install", command: "pip install -e .", check: { kind: "manual", reason: "" }, detail: "", checkpoint: "", source: "", blocked: "" },
    { id: "run", title: "Run", command: "python run_cl_bench.py", check: { kind: "command", command: "python run_cl_bench.py", expect: "exit_zero" }, detail: "", checkpoint: "", source: "", blocked: "" },
  ],
  environment: { python: "3.11", install: ["pip install -e ."] },
};

test("a missing module is classified from the log without a model", async () => {
  const log = "$ python run_cl_bench.py\nTraceback (most recent call last):\nModuleNotFoundError: No module named 'sglang'\n";
  const diagnosis = await diagnose({ step: CONTRACT.steps[1], outcome: { exit_code: 1 }, contract: CONTRACT, log, runAgent: null });
  assert.equal(diagnosis.class, "dependency_missing");
  assert.equal(diagnosis.retry, true);
  assert.match(diagnosis.evidence, /No module named 'sglang'/);
  assert.match(diagnosis.cause, /sglang/);
});

test("credentials are never retried automatically", async () => {
  const log = "botocore.exceptions.NoCredentialsError: Unable to locate credentials\n";
  const diagnosis = await diagnose({ step: CONTRACT.steps[1], outcome: { exit_code: 1 }, contract: CONTRACT, log, runAgent: null });
  assert.equal(diagnosis.class, "credentials");
  assert.equal(diagnosis.retry, false);
});

test("out of memory stops the line of work instead of retrying", async () => {
  const log = "torch.cuda.OutOfMemoryError: CUDA out of memory. Tried to allocate 2.00 GiB\n";
  const diagnosis = await diagnose({ step: CONTRACT.steps[1], outcome: { exit_code: 1 }, contract: CONTRACT, log, runAgent: null });
  assert.equal(diagnosis.class, "resources");
  assert.equal(diagnosis.retry, false);
});

test("an unreadable failure stays unknown rather than guessing", async () => {
  const diagnosis = await diagnose({ step: CONTRACT.steps[1], outcome: { exit_code: 1 }, contract: CONTRACT, log: "something happened\n", runAgent: null });
  assert.equal(diagnosis.class, "unknown");
  assert.equal(diagnosis.retry, false);
  assert.equal(diagnosis.fix, null);
});

test("the checkpoint is never part of a proposed change", async () => {
  const steps = CONTRACT.steps;
  const result = validate({
    class: "dependency_missing",
    confidence: "high",
    evidence: "ModuleNotFoundError: No module named 'sglang'",
    cause: "sglang is in a different extra",
    fix: { target: "install", command: "pip install -e '.[all,server]'" },
    check: { kind: "manual", reason: "ignore this attempt" },
  }, { log: "ModuleNotFoundError: No module named 'sglang'", steps });
  assert.deepEqual(Object.keys(result).sort(), ["cause", "class", "confidence", "evidence", "fix", "retry"]);
  assert.equal(result.fix.target, "install");
});

test("evidence that is not in the log is rejected", () => {
  const result = validate({
    class: "dependency_missing",
    confidence: "high",
    evidence: "No module named 'invented'",
    cause: "made up",
    fix: { target: "install", command: "pip install invented" },
  }, { log: "ModuleNotFoundError: No module named 'sglang'", steps: CONTRACT.steps });
  assert.equal(result.evidence, "insufficient");
  assert.equal(result.retry, false);
  assert.equal(result.fix, null, "a fix without evidence is not applied");
});

test("a fix that targets a step which does not exist is dropped", () => {
  const result = validate({
    class: "dependency_missing",
    confidence: "high",
    evidence: "ModuleNotFoundError: No module named 'sglang'",
    cause: "sglang is in a different extra",
    fix: { target: "ghost", command: "pip install sglang" },
  }, { log: "ModuleNotFoundError: No module named 'sglang'", steps: CONTRACT.steps });
  assert.equal(result.fix, null);
});

test("a classified-but-not-retryable failure cannot carry a fix", () => {
  const result = validate({
    class: "credentials",
    confidence: "high",
    evidence: "NoCredentialsError: Unable to locate credentials",
    cause: "no key",
    fix: { target: "run", command: "python run_cl_bench.py" },
  }, { log: "NoCredentialsError: Unable to locate credentials", steps: CONTRACT.steps });
  assert.equal(result.retry, false);
  assert.equal(result.fix, null);
});

test("a model is only consulted when the rules find nothing", async () => {
  let calls = 0;
  const runAgent = async () => {
    calls += 1;
    return { response: JSON.stringify({ class: "unknown", confidence: "low", evidence: "insufficient", cause: "", fix: null }) };
  };
  await diagnose({ step: CONTRACT.steps[1], outcome: { exit_code: 1 }, contract: CONTRACT, log: "ModuleNotFoundError: No module named 'x'", runAgent });
  assert.equal(calls, 0, "a rule hit must not spend a model call");
  await diagnose({ step: CONTRACT.steps[1], outcome: { exit_code: 1 }, contract: CONTRACT, log: "mysterious stop\n", runAgent });
  assert.equal(calls, 1);
});

test("a model answer is kept only when its evidence checks out", async () => {
  const log = "KeyError: 'results' in launcher.py line 88\n";
  const runAgent = async () => ({
    response: JSON.stringify({
      class: "command_error",
      confidence: "high",
      evidence: "KeyError: 'results' in launcher.py line 88",
      cause: "The launcher expects a results key that this repository never writes.",
      fix: { target: "run", command: "python run_cl_bench.py --emit-results" },
    }),
  });
  const diagnosis = await diagnose({ step: CONTRACT.steps[1], outcome: { exit_code: 1 }, contract: CONTRACT, log, runAgent });
  assert.equal(diagnosis.class, "command_error");
  assert.equal(diagnosis.retry, true);
  assert.equal(diagnosis.fix.target, "run");
});

test("applying a fix changes one command and records the deviation", () => {
  const diagnosis = { class: "dependency_missing", cause: "sglang is in the server extra", fix: { target: "install", command: "pip install -e '.[all,server]'" } };
  const next = applyFix(CONTRACT, diagnosis, { at: "2026-11-02T00:00:00.000Z", attempt: 1 });
  assert.equal(next.steps.find((step) => step.id === "install").command, "pip install -e '.[all,server]'");
  assert.equal(next.steps.find((step) => step.id === "run").command, CONTRACT.steps[1].command, "other steps are untouched");
  assert.equal(next.deviations.length, 1);
  assert.equal(next.deviations[0].from, "pip install -e .");
  assert.equal(next.deviations[0].to, "pip install -e '.[all,server]'");
  assert.equal(next.deviations[0].attempt, 1);
  assert.equal(CONTRACT.steps[0].command, "pip install -e .", "the original contract is not mutated");
});

test("applying a fix without a proposal throws instead of inventing one", () => {
  assert.throws(() => applyFix(CONTRACT, { class: "unknown", fix: null }), /does not propose a change/);
});

test("classification looks at the last matching line", () => {
  const log = [
    "ModuleNotFoundError: No module named 'old'",
    "pip install old",
    "ModuleNotFoundError: No module named 'new'",
  ].join("\n");
  const hit = classifyLog(log);
  assert.equal(hit.class, "dependency_missing");
  assert.match(hit.evidence, /'new'/);
});

test("the log handed to a model is bounded", () => {
  const long = "x".repeat(50_000) + "TAIL";
  const clipped = tail(long);
  assert.ok(clipped.length <= 6_000);
  assert.match(clipped, /TAIL$/);
});

test("a missing python is repaired to python3, checkpoint included", async () => {
  const log = "$ python -m pip install -e \".[cl]\"\nbash: line 1: python: command not found\n";
  const stepWithCheck = {
    id: "install",
    title: "Install",
    command: 'python -m pip install -e ".[cl]"',
    check: { kind: "command", command: 'python -c "import boto3"', expect: "exit_zero" },
    detail: "", checkpoint: "", source: "", blocked: "",
  };
  const diagnosis = await diagnose({ step: stepWithCheck, outcome: { exit_code: 127 }, contract: { steps: [stepWithCheck] }, log, runAgent: null });
  assert.equal(diagnosis.class, "command_error");
  assert.equal(diagnosis.fix.target, "install");
  assert.equal(diagnosis.fix.command, 'python3 -m pip install -e ".[cl]"');
  assert.equal(diagnosis.fix.checkCommand, 'python3 -c "import boto3"', "the same check, spelled for this machine");
});

test("a missing binary nobody can rename stays unfixed", async () => {
  const log = "$ nvcc --version\nbash: line 1: nvcc: command not found\n";
  const diagnosis = await diagnose({ step: CONTRACT.steps[1], outcome: { exit_code: 127 }, contract: CONTRACT, log, runAgent: null });
  assert.equal(diagnosis.fix, null, "installing a compiler is a person's decision");
});

test("applying an interpreter fix records both moves", () => {
  const contract = {
    steps: [{
      id: "install", title: "Install", detail: "", checkpoint: "", source: "", blocked: "",
      command: 'python -m pip install -e ".[cl]"',
      check: { kind: "command", command: 'python -c "import boto3"', expect: "exit_zero" },
    }],
  };
  const next = applyFix(contract, {
    class: "command_error",
    cause: "python is not installed",
    fix: { target: "install", command: 'python3 -m pip install -e ".[cl]"', checkCommand: 'python3 -c "import boto3"' },
  }, { attempt: 1 });
  assert.equal(next.steps[0].command, 'python3 -m pip install -e ".[cl]"');
  assert.equal(next.steps[0].check.command, 'python3 -c "import boto3"');
  assert.equal(next.deviations.length, 2);
  assert.match(next.deviations[1].reason, /same binary/);
});

test("pip refusing an http mirror is repaired with the flag it asks for", async () => {
  const log = [
    'Looking in indexes: http://linux.xidian.edu.cn/mirrors/pypi/simple',
    "WARNING: The repository located at linux.xidian.edu.cn is not a trusted or secure host and is being ignored.",
    "ERROR: Could not find a version that satisfies the requirement hatchling (from versions: none)",
  ].join("\n");
  const step = { id: "install", title: "Install", detail: "", checkpoint: "", source: "", blocked: "", command: 'python3 -m pip install -e ".[cl]"', check: { kind: "manual", reason: "" } };
  const diagnosis = await diagnose({ step, outcome: { exit_code: 1 }, contract: { steps: [step] }, log, runAgent: null });
  assert.equal(diagnosis.fix.target, "install");
  assert.match(diagnosis.fix.command, /pip install --trusted-host linux\.xidian\.edu\.cn -e/);
});

test("a pip command that already trusts its host is left alone", () => {
  const log = "WARNING: The repository located at mirror.local is not a trusted or secure host and is being ignored.";
  assert.equal(pipTrustFix({ id: "i", command: "pip install --trusted-host mirror.local x" }, log), null);
});

test("a local proxy that cannot reach the mirror is bypassed", async () => {
  const log = [
    "WARNING: Retrying after connection broken by 'ReadTimeoutError(\"HTTPConnectionPool(host='127.0.0.1', port=7890): Read timed out. (read timeout=15)\")': http://mirror/simple/hatchling/",
    "ERROR: No matching distribution found for hatchling",
  ].join("\n");
  const step = { id: "install", title: "Install", detail: "", checkpoint: "", source: "", blocked: "", command: 'python3 -m pip install --trusted-host mirror -e ".[cl]"', check: { kind: "manual", reason: "" } };
  const diagnosis = await diagnose({ step, outcome: { exit_code: 1 }, contract: { steps: [step] }, log, runAgent: null });
  assert.equal(diagnosis.class, "network");
  assert.match(diagnosis.fix.command, /pip install --proxy "" --trusted-host mirror/);
});

test("a pip command that already bypasses the proxy is left alone", () => {
  assert.equal(pipProxyFix({ id: "i", command: 'pip install --proxy "" x' }, "HTTPConnectionPool(host='127.0.0.1', port=7890)"), null);
});
