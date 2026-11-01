const assert = require("node:assert/strict");
const test = require("node:test");

const { clipLog, runRunbook, sameCommand } = require("./reproduction/runner.cjs");

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

function backend({ files = {}, exec = {}, http = {} } = {}) {
  const calls = [];
  return {
    calls,
    async readFile(filePath) {
      calls.push(`read:${filePath}`);
      return filePath in files ? files[filePath] : null;
    },
    async exec(command) {
      calls.push(`exec:${command}`);
      const handler = exec[command];
      return handler ? handler() : { exitCode: 0, timedOut: false };
    },
    async httpStatus(url) {
      calls.push(`http:${url}`);
      const value = http[url];
      if (Array.isArray(value)) return value.shift();
      return value === undefined ? null : value;
    },
  };
}

test("steps run in order and the run is verified when every checkpoint passes", async () => {
  const fake = backend({ files: { "a.txt": "hello" } });
  const result = await runRunbook({
    steps: [
      step("one", { command: "echo one", check: { kind: "command", command: "echo one", expect: "exit_zero" } }),
      step("two", { command: "echo two", check: { kind: "file_exists", path: "a.txt" } }),
    ],
    backend: fake,
  });
  assert.equal(result.status, "verified");
  assert.deepEqual(result.steps.map((entry) => entry.status), ["passed", "passed"]);
  assert.deepEqual(fake.calls, ["exec:echo one", "exec:echo two", "read:a.txt"]);
});

test("a failed checkpoint stops the run before the next step", async () => {
  const fake = backend({ files: {} });
  const result = await runRunbook({
    steps: [
      step("one", { command: "echo one", check: { kind: "file_exists", path: "missing.txt" } }),
      step("two", { command: "echo two", check: { kind: "file_exists", path: "missing.txt" } }),
    ],
    backend: fake,
  });
  assert.equal(result.status, "failed");
  assert.equal(result.steps.length, 1);
  assert.match(result.steps[0].detail, /missing\.txt does not exist/);
  assert.deepEqual(fake.calls, ["exec:echo one", "read:missing.txt"], "the second step never ran");
});

test("a command that exits non-zero but satisfies its checkpoint keeps going", async () => {
  const fake = backend({
    files: { "installed.egg-info": "ok" },
    exec: { "pip install -e .": () => ({ exitCode: 1, timedOut: false }) },
  });
  const result = await runRunbook({
    steps: [
      step("install", { command: "pip install -e .", check: { kind: "file_exists", path: "installed.egg-info" } }),
      step("run", { command: "python eval.py", check: { kind: "command", command: "python eval.py", expect: "exit_zero" } }),
    ],
    backend: fake,
  });
  assert.equal(result.status, "verified");
  assert.equal(result.steps[0].exit_code, 1, "the exit code is recorded even though the check passed");
});

test("a manual checkpoint runs the command then stops for a person", async () => {
  const fake = backend();
  const result = await runRunbook({
    steps: [
      step("read", { command: "cat results.csv", check: { kind: "manual", reason: "A person must compare the table." } }),
      step("next", { command: "echo next" }),
    ],
    backend: fake,
  });
  assert.equal(result.status, "manual");
  assert.equal(result.steps[0].status, "manual");
  assert.match(result.steps[0].detail, /compare the table/);
  assert.deepEqual(fake.calls, ["exec:cat results.csv"], "the command ran, the next step did not");
});

test("a blocked step is not executed at all", async () => {
  const fake = backend();
  const result = await runRunbook({
    steps: [step("eval", { command: "python eval.py", blocked: "No evaluation code in the repository." })],
    backend: fake,
  });
  assert.equal(result.status, "blocked");
  assert.equal(result.steps[0].status, "blocked");
  assert.deepEqual(fake.calls, [], "nothing was run for a step the plan cannot do");
});

test("a command checkpoint that repeats the step command is not run twice", async () => {
  const fake = backend();
  await runRunbook({
    steps: [step("import", { command: "python -c 'import x'", check: { kind: "command", command: "python -c 'import x'", expect: "exit_zero" } })],
    backend: fake,
  });
  assert.deepEqual(fake.calls, ["exec:python -c 'import x'"]);
});

test("a command checkpoint that differs from the step command is executed on its own", async () => {
  const fake = backend();
  const result = await runRunbook({
    steps: [step("serve", { command: "python -m server", check: { kind: "command", command: "python -c 'import x'", expect: "exit_zero" } })],
    backend: fake,
  });
  assert.equal(result.status, "verified");
  assert.deepEqual(fake.calls, ["exec:python -m server", "exec:python -c 'import x'"]);
});

test("a slow service is retried before the http checkpoint fails", async () => {
  const fake = backend({ http: { "http://127.0.0.1:30000/health": [0, 503, 200] } });
  const result = await runRunbook({
    steps: [step("serve", { command: "python -m server", check: { kind: "http", url: "http://127.0.0.1:30000/health", status: 200 } })],
    backend: fake,
    httpAttempts: 5,
    httpIntervalMs: 0,
  });
  assert.equal(result.status, "verified");
  assert.equal(fake.calls.filter((call) => call.startsWith("http:")).length, 3);
});

test("a service that never answers fails the step with the last observation", async () => {
  const fake = backend({ http: { "http://127.0.0.1:30000/health": null } });
  const result = await runRunbook({
    steps: [step("serve", { check: { kind: "http", url: "http://127.0.0.1:30000/health", status: 200 } })],
    backend: fake,
    httpAttempts: 2,
    httpIntervalMs: 0,
  });
  assert.equal(result.status, "failed");
  assert.match(result.steps[0].detail, /did not return 200/);
});

test("a command that exceeds its timeout stops the run", async () => {
  const fake = backend({ exec: { "python train.py": () => ({ exitCode: null, timedOut: true }) } });
  const result = await runRunbook({
    steps: [
      step("train", { command: "python train.py", check: { kind: "command", command: "python train.py", expect: "exit_zero" } }),
      step("compare", { command: "echo compare" }),
    ],
    backend: fake,
  });
  assert.equal(result.status, "timeout");
  assert.deepEqual(fake.calls, ["exec:python train.py"]);
});

test("stopping a run marks it stopped and does not start the next step", async () => {
  const controller = new AbortController();
  controller.abort();
  const fake = backend();
  const result = await runRunbook({
    steps: [step("one", { command: "echo one" }), step("two", { command: "echo two" })],
    backend: fake,
    signal: controller.signal,
  });
  assert.equal(result.status, "stopped");
  assert.deepEqual(fake.calls, []);
});

test("an exhausted time budget stops before the next step starts", async () => {
  let clock = 0;
  const calls = [];
  const fake = {
    async readFile() { return null; },
    async httpStatus() { return null; },
    async exec(command) {
      calls.push(command);
      clock += 5_000; // the first step eats the whole budget
      return { exitCode: 0, timedOut: false };
    },
  };
  const result = await runRunbook({
    steps: [
      step("slow", { command: "python train.py", check: { kind: "command", command: "python train.py", expect: "exit_zero" } }),
      step("next", { command: "echo next", check: { kind: "file_exists", path: "x" } }),
    ],
    backend: fake,
    budgetMs: 1_000,
    now: () => clock,
  });
  assert.equal(result.status, "timeout");
  assert.deepEqual(calls, ["python train.py"], "the second step never started");
  assert.match(result.steps[1].detail, /time budget/);
});

test("the log keeps the tail when output is long", () => {
  const long = `${"a".repeat(300_000)}TAIL`;
  const clipped = clipLog(long);
  assert.match(clipped, /TAIL$/);
  assert.ok(clipped.length < long.length);
  assert.match(clipped, /earlier characters trimmed/);
});

test("commands are compared with collapsed whitespace", () => {
  assert.equal(sameCommand("python   -c  x", "python -c x"), true);
  assert.equal(sameCommand("  ", ""), false);
});
