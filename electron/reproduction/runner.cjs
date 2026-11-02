/**
 * Sequential runbook executor.
 *
 * The runner never decides whether a step worked by reading its output. It runs
 * the step's command, then evaluates the step's check as an independent
 * predicate. That separation matters because a command can exit 0 and leave the
 * environment broken, and a command can exit 1 while still having done its job.
 *
 * A step that cannot be evaluated stops the run. Nothing is assumed, so a
 * failure never hides behind three more steps that also fail for the same
 * reason.
 */

const { candidatePaths } = require("./paths.cjs");

const DEFAULT_STEP_TIMEOUT_MS = 30 * 60 * 1_000;
const DEFAULT_HTTP_ATTEMPTS = 8;
const DEFAULT_HTTP_INTERVAL_MS = 2_000;
const MAX_LOG_CHARS = 200_000;
const MAX_REASON_CHARS = 600;

const RUN_STATUSES = Object.freeze(["verified", "failed", "blocked", "manual", "stopped", "timeout"]);

function clipLog(value) {
  const text = String(value || "");
  if (text.length <= MAX_LOG_CHARS) return text;
  // Keep the tail: the end of a log says why something stopped.
  return `…${text.length - MAX_LOG_CHARS} earlier characters trimmed…\n${text.slice(-MAX_LOG_CHARS)}`;
}

function reason(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, MAX_REASON_CHARS);
}

function sameCommand(left, right) {
  const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
  return normalize(left) !== "" && normalize(left) === normalize(right);
}

function safeRegex(pattern) {
  try { return new RegExp(String(pattern), "m"); } catch { return null; }
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function evaluateFileCheck(check, backend, repoName) {
  // READMEs write "repo/file" because they clone into a parent directory; the
  // checkout root is the repository, so try the written path first and then the
  // same path without the repository's own name in front.
  const candidates = candidatePaths(check.path, repoName);
  const failures = [];
  for (const candidate of candidates) {
    let content;
    try {
      content = await backend.readFile(candidate);
    } catch (error) {
      failures.push(reason(error?.message || `${candidate} could not be read`));
      continue;
    }
    if (content === null || content === undefined) {
      failures.push(`${candidate} does not exist`);
      continue;
    }
    if (check.kind === "file_exists") return { status: "passed", detail: "", resolved: candidate };
    const pattern = safeRegex(check.pattern);
    if (!pattern) return { status: "failed", detail: `Invalid pattern: ${check.pattern}`, resolved: candidate };
    return pattern.test(content)
      ? { status: "passed", detail: "", resolved: candidate }
      : { status: "failed", detail: `"${check.pattern}" not found in ${candidate}`, resolved: candidate };
  }
  return { status: "failed", detail: failures[0] || `${check.path} does not exist` };
}

async function evaluateHttpCheck(check, { backend, options }) {
  const attempts = Math.max(1, Math.trunc(options.httpAttempts));
  const interval = Math.max(0, Math.trunc(options.httpIntervalMs));
  let last = "";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (options.signal?.aborted) return { status: "stopped", detail: "Stopped before the check finished." };
    if (options.now() > options.deadline) return { status: "timeout", detail: "Ran out of time before the check answered." };
    try {
      const status = await backend.httpStatus(check.url);
      last = status === null || status === undefined ? "no response" : `status ${status}`;
      if (Number(status) === check.status) return { status: "passed", detail: "" };
    } catch (error) {
      last = reason(error?.message || "request failed");
    }
    // The service usually needs a moment to bind its port; retry until the
    // attempts run out rather than declaring failure on the first refusal.
    if (attempt < attempts) await options.sleep(interval);
  }
  return { status: "failed", detail: `${check.url} did not return ${check.status} (${last})` };
}

async function evaluateCheck({ check, step, backend, executed, options }) {
  if (!check || check.kind === "manual") {
    return { status: "manual", detail: reason(check?.reason || "This step can only be confirmed by a person.") };
  }
  if (check.kind === "file_exists" || check.kind === "file_contains") {
    return evaluateFileCheck(check, backend, options.repoName);
  }
  if (check.kind === "http") return evaluateHttpCheck(check, { backend, options });
  if (check.kind === "command") {
    if (executed && sameCommand(check.command, step.command)) {
      return executed.exitCode === 0
        ? { status: "passed", detail: "" }
        : { status: "failed", detail: `exited with status ${executed.exitCode}` };
    }
    const result = await options.runCommand(check.command, step);
    return result.exitCode === 0
      ? { status: "passed", detail: "" }
      : { status: "failed", detail: result.timedOut ? "the check timed out" : `exited with status ${result.exitCode}` };
  }
  return { status: "manual", detail: `Unknown check kind: ${check.kind}` };
}

/**
 * @param {object} input
 * @param {Array} input.steps executed in order
 * @param {{readFile: Function, httpStatus: Function, exec: Function}} input.backend
 * @param {(event: object) => void} [input.emit] progress events for the UI
 * @param {AbortSignal} [input.signal]
 */
async function runRunbook({
  steps,
  backend,
  emit = () => {},
  signal,
  stepTimeoutMs = DEFAULT_STEP_TIMEOUT_MS,
  budgetMs = Number.POSITIVE_INFINITY,
  startAt = 0,
  httpAttempts = DEFAULT_HTTP_ATTEMPTS,
  httpIntervalMs = DEFAULT_HTTP_INTERVAL_MS,
  repoName = "",
  now = () => Date.now(),
  sleep = defaultSleep,
}) {
  if (!backend) throw new Error("A runbook needs an execution backend.");
  const startedAt = now();
  const deadline = Number.isFinite(budgetMs) ? startedAt + budgetMs : Number.POSITIVE_INFINITY;
  const results = [];
  const offset = Math.max(0, Math.min(steps.length, Math.trunc(startAt) || 0));
  let log = "";
  let status = "verified";

  const appendLog = (chunk) => {
    const text = String(chunk || "");
    if (!text) return;
    log = clipLog(log + text);
  };

  const options = { signal, now, deadline, httpAttempts, httpIntervalMs, sleep, repoName };
  options.runCommand = async (command, step) => {
    emit({ type: "output", stepId: step.id, chunk: `\n$ ${command}\n` });
    appendLog(`\n$ ${command}\n`);
    const budgetLeft = Number.isFinite(deadline) ? Math.max(1, deadline - now()) : stepTimeoutMs;
    return backend.exec(command, {
      timeoutMs: Math.min(stepTimeoutMs, budgetLeft),
      signal,
      onData: (chunk) => {
        appendLog(chunk);
        emit({ type: "output", stepId: step.id, chunk });
      },
    });
  };

  for (const step of steps.slice(offset)) {
    const record = {
      id: step.id,
      title: step.title,
      status: "pending",
      detail: "",
      exit_code: null,
      duration_ms: 0,
      resolved_path: "",
    };
    const stepStarted = now();

    if (step.blocked) {
      record.status = "blocked";
      record.detail = reason(step.blocked);
      record.duration_ms = now() - stepStarted;
      results.push(record);
      status = "blocked";
      emit({ type: "step", step: record });
      break;
    }

    if (signal?.aborted) {
      record.status = "stopped";
      record.detail = "Stopped by the user.";
      results.push(record);
      status = "stopped";
      emit({ type: "step", step: record });
      break;
    }

    if (now() > deadline) {
      record.status = "failed";
      record.detail = "Ran out of the time budget before this step started.";
      results.push(record);
      status = "timeout";
      emit({ type: "step", step: record });
      break;
    }

    emit({ type: "step-start", step: { id: step.id, title: step.title } });
    let executed = null;
    if (step.command) {
      try {
        executed = await options.runCommand(step.command, step);
        record.exit_code = executed.exitCode;
      } catch (error) {
        executed = { exitCode: null, timedOut: false, error: reason(error?.message || "command failed") };
        record.exit_code = null;
      }
      if (executed.timedOut) {
        record.status = "failed";
        record.detail = `The command did not finish within ${Math.round(Math.min(stepTimeoutMs, Math.max(1, deadline - stepStarted)) / 1_000)}s.`;
        record.duration_ms = now() - stepStarted;
        results.push(record);
        status = "timeout";
        emit({ type: "step", step: record });
        break;
      }
      if (executed.error) {
        record.status = "failed";
        record.detail = executed.error;
        record.duration_ms = now() - stepStarted;
        results.push(record);
        status = "failed";
        emit({ type: "step", step: record });
        break;
      }
    }

    let verdict;
    try {
      verdict = await evaluateCheck({ check: step.check, step, backend, executed, options });
    } catch (error) {
      verdict = { status: "failed", detail: reason(error?.message || "The checkpoint could not be evaluated.") };
    }

    record.status = verdict.status === "passed" ? "passed" : verdict.status;
    record.detail = verdict.detail;
    record.resolved_path = String(verdict.resolved || "");
    record.duration_ms = now() - stepStarted;
    results.push(record);
    emit({ type: "step", step: record });

    if (verdict.status !== "passed") {
      status = verdict.status === "manual" ? "manual" : verdict.status === "timeout" ? "timeout" : verdict.status === "stopped" ? "stopped" : "failed";
      break;
    }
  }

  const finishedAt = now();
  emit({ type: "run-end", status, steps: results.length });
  return {
    status,
    steps: results,
    log: clipLog(log),
    started_at: new Date(startedAt).toISOString(),
    finished_at: new Date(finishedAt).toISOString(),
    duration_ms: finishedAt - startedAt,
  };
}

module.exports = {
  MAX_LOG_CHARS,
  RUN_STATUSES,
  clipLog,
  runRunbook,
  sameCommand,
};
