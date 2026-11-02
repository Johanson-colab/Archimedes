/**
 * Failure diagnosis.
 *
 * A run that stops tells you where, not why. This module turns the last few
 * thousand characters of output into one of a small set of causes, so the next
 * decision (retry with a different command, or hand it to a person) can be made
 * without a model guessing.
 *
 * Rules run first and answer the clear cases on their own. A model is only
 * consulted when the rules are inconclusive, and everything it says has to be
 * backed by a line that actually appears in the log.
 */

const MAX_LOG_CHARS = 6_000;
// Commands that mean the same thing under a different name on a modern Linux
// box. Renaming one of these changes no semantics - only the binary.
const INTERPRETER_ALIASES = Object.freeze({ python: "python3", pip: "pip3", python2: "python3" });
const MAX_EVIDENCE_CHARS = 300;

const CLASSES = Object.freeze({
  dependency_missing: { retry: true, title: "A package is missing" },
  version_mismatch: { retry: true, title: "A version does not match" },
  environment: { retry: true, title: "The environment differs from what the paper used" },
  network: { retry: true, title: "Something could not be downloaded" },
  data_missing: { retry: true, title: "An input file or dataset is missing" },
  command_error: { retry: true, title: "The command itself is wrong" },
  credentials: { retry: false, title: "Credentials or account access are missing" },
  resources: { retry: false, title: "The machine ran out of a resource" },
  repo_missing_code: { retry: false, title: "The repository does not contain this code" },
  paper_ambiguous: { retry: false, title: "The paper or README does not say enough" },
  unknown: { retry: false, title: "Cause not identified from the output" },
});

// Order matters: the first rule that matches wins, so the causes that must not
// be retried come before the ones that usually can be.
const RULES = [
  { class: "credentials", pattern: /NoCredentialsError|AccessDenied|InvalidClientTokenId|UnauthorizedOperation|ExpiredToken|403 Forbidden/i },
  { class: "resources", pattern: /CUDA out of memory|OutOfMemoryError|OOMKilled|Killed\b.*\b137\b|No space left on device/i },
  { class: "repo_missing_code", pattern: /No such file or directory: '([^']*(?:eval|bench|script)[^']*\.py)'/i },
  { class: "network", pattern: /ConnectionError|Temporary failure in name resolution|Max retries exceeded|ProxyError|SSLError|Could not connect|Connection refused/i },
  { class: "dependency_missing", pattern: /ModuleNotFoundError: No module named '([^']+)'/ },
  { class: "dependency_missing", pattern: /ImportError: cannot import name '([^']+)'/ },
  { class: "data_missing", pattern: /FileNotFoundError: \[Errno 2\] No such file or directory: '([^']+)'/ },
  { class: "version_mismatch", pattern: /requires (?:Python|CUDA|torch) ?[>=<~!]* ?([\d.]+)/i },
  { class: "version_mismatch", pattern: /incompatible with|has requirement .* but you have/i },
  { class: "command_error", pattern: /command not found|not recognized as an internal or external command|usage: .* error:/i },
  { class: "environment", pattern: /command '([a-z]+)' not found|Unable to find (?:conda|python|nvcc|docker)/i },
];

function tail(value, limit = MAX_LOG_CHARS) {
  const text = String(value || "");
  return text.length <= limit ? text : text.slice(-limit);
}

function lineContaining(log, match) {
  if (!match) return "";
  const index = typeof match.index === "number" ? match.index : log.indexOf(match[0]);
  if (index < 0) return "";
  const start = log.lastIndexOf("\n", index) + 1;
  const end = log.indexOf("\n", index);
  return log.slice(start, end === -1 ? undefined : end).trim().slice(0, MAX_EVIDENCE_CHARS);
}

/** The clear cases: pattern in, class and quoted evidence out. */
function classifyLog(log) {
  const text = String(log || "");
  const reversed = [...text.split("\n")].reverse().join("\n");
  for (const rule of RULES) {
    // Search from the end: the last matching line is the one that stopped the run.
    const match = reversed.match(rule.pattern);
    if (!match) continue;
    const evidence = lineContaining(reversed, match);
    const detail = match[1] ? String(match[1]).slice(0, 200) : "";
    return {
      class: rule.class,
      confidence: "high",
      evidence,
      detail,
      source: "rule",
    };
  }
  return null;
}

/** A rename the environment makes obvious, e.g. "python: command not found". */
function interpreterFix(step, log) {
  const missing = String(log || "").match(/^(?:\S+: )?(?:line \d+: )?([a-z0-9_]+): command not found$/m);
  if (!missing) return null;
  const wrong = missing[1];
  const right = INTERPRETER_ALIASES[wrong];
  if (!right) return null;
  const command = String(step?.command || "");
  if (!command) return null;
  const rename = (value) => String(value || "").replace(new RegExp(`(^|[\\s;&|(])${wrong}(?=\\s|$)`, "g"), `$1${right}`);
  const next = rename(command);
  if (next === command) return null;
  const fix = { target: step.id, command: next };
  // The checkpoint may test the same binary; it is the same check, spelled for
  // the interpreter this machine actually has.
  if (step.check?.kind === "command" && step.check.command) {
    const checkCommand = rename(step.check.command);
    if (checkCommand !== step.check.command) fix.checkCommand = checkCommand;
  }
  return fix;
}

function causeFor(entry, { step, detail }) {
  if (entry === "dependency_missing") {
    return detail
      ? `The environment does not have "${detail}". Either it is a separate extra, or the install step did not include it.`
      : "A package the step imports is not installed.";
  }
  if (entry === "data_missing") return detail ? `"${detail}" is not on disk. A previous step was supposed to download or generate it.` : "An input file is missing.";
  if (entry === "credentials") return "The command reached a provider that rejected the credentials, or they were never configured.";
  if (entry === "resources") return "The machine ran out of memory or disk before the step finished.";
  if (entry === "network") return "A download could not complete from this machine.";
  if (entry === "repo_missing_code") return "The command points at a file the checkout does not contain.";
  if (entry === "version_mismatch") return detail ? `The installed version does not satisfy a declared requirement (${detail}).` : "A dependency requires a different version than the one installed.";
  if (entry === "environment") return "The tool the command calls is not available in this environment.";
  if (entry === "command_error") return "The command is not valid in this environment.";
  return `Step "${step?.title || step?.id || "unknown"}" stopped without a recognisable cause.`;
}

function promptFor({ step, contract, outcome, log }) {
  return [
    "A reproduction step failed. Explain why, using only the output below.",
    "",
    `STEP: ${step?.title || step?.id || ""}`,
    `COMMAND: ${step?.command || "(none)"}`,
    `EXIT CODE: ${outcome?.exit_code ?? "unknown"}`,
    `CHECK: ${JSON.stringify(step?.check || {})}`,
    "",
    "ENVIRONMENT DECLARED BY THE PLAN:",
    JSON.stringify(contract?.environment || {}, null, 2),
    "",
    "OUTPUT (tail):",
    "```",
    log,
    "```",
    "",
    "Reply with JSON only, no prose:",
    '{"class":"dependency_missing|version_mismatch|environment|network|data_missing|command_error|credentials|resources|repo_missing_code|paper_ambiguous|unknown",',
    ' "confidence":"high|low",',
    ' "evidence":"one line copied verbatim from the output above",',
    ' "cause":"one or two sentences",',
    ' "fix":{"target":"step id","command":"the command that step should run instead"} or null}',
    "",
    "Rules: the evidence must appear verbatim in the output; if the output does not",
    "show a cause, use class \"unknown\" and evidence \"insufficient\". Only propose a",
    "fix you are confident about, and only change the command of an existing step.",
    "Never suggest changing a checkpoint or claiming the step passed.",
  ].join("\n");
}

function extractJson(text) {
  const raw = String(text || "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
}

/**
 * A diagnosis is only usable if its evidence was really in the log and its fix
 * points at a step that exists. Anything else degrades to "unknown", which the
 * runner treats as "stop and ask a person".
 */
function validate(raw, { log, steps }) {
  const fallback = {
    class: "unknown",
    confidence: "low",
    evidence: "insufficient",
    cause: "The output does not show a cause this check can confirm.",
    retry: false,
    fix: null,
  };
  if (!raw || typeof raw !== "object") return fallback;

  const code = Object.prototype.hasOwnProperty.call(CLASSES, raw.class) ? raw.class : "unknown";
  const meta = CLASSES[code];
  const evidence = String(raw.evidence || "").replace(/\s+/g, " ").trim().slice(0, MAX_EVIDENCE_CHARS);
  const normalizedLog = String(log || "").replace(/\s+/g, " ");
  const backed = evidence && evidence !== "insufficient" && normalizedLog.includes(evidence);

  let fix = null;
  const proposed = raw.fix && typeof raw.fix === "object" ? raw.fix : null;
  if (proposed && backed && meta.retry) {
    const target = String(proposed.target || "").trim();
    const command = String(proposed.command || "").replace(/\s+/g, " ").trim().slice(0, 2_000);
    const checkCommand = String(proposed.checkCommand || "").replace(/\s+/g, " ").trim().slice(0, 2_000);
    if (steps.some((step) => step.id === target) && command) {
      fix = { target, command };
      if (checkCommand) fix.checkCommand = checkCommand;
    }
  }

  return {
    class: code,
    confidence: backed && raw.confidence === "high" ? "high" : backed ? "low" : "low",
    evidence: backed ? evidence : "insufficient",
    cause: String(raw.cause || "").replace(/\s+/g, " ").trim().slice(0, 600) || fallback.cause,
    retry: Boolean(meta.retry && backed),
    fix,
  };
}

/**
 * @param {object} input
 * @param {object} input.step the step that stopped
 * @param {object} input.outcome { exit_code, status, detail }
 * @param {object} input.contract the frozen contract
 * @param {string} input.log the run log
 * @param {Function} [input.runAgent] consulted only when the rules are inconclusive
 */
async function diagnose({ step, outcome, contract, log, runAgent, workspace, emit = () => {} }) {
  const text = tail(log);
  const steps = Array.isArray(contract?.steps) ? contract.steps : [];
  const rule = classifyLog(text);

  if (rule) {
    const detail = rule.detail;
    return validate({
      class: rule.class,
      confidence: "high",
      evidence: rule.evidence,
      cause: causeFor(rule.class, { step, detail }),
      fix: interpreterFix(step, text),
    }, { log: text, steps });
  }

  if (!runAgent) {
    return validate(null, { log: text, steps });
  }

  emit({ type: "diagnosing", detail: "Reading the output…" });
  try {
    const result = await runAgent({
      prompt: promptFor({ step, contract, outcome, log: text }),
      workspace,
      transient: true,
      mode: "experiment-setup",
    });
    const parsed = extractJson(result?.response);
    const diagnosis = validate(parsed, { log: text, steps });
    if (!diagnosis.cause || diagnosis.class === "unknown") {
      diagnosis.cause = diagnosis.cause || causeFor("unknown", { step });
    }
    return diagnosis;
  } catch (error) {
    emit({ type: "warning", detail: `The diagnosis model was unavailable: ${error instanceof Error ? error.message : "unknown error"}` });
    return validate(null, { log: text, steps });
  }
}

/**
 * Applying a fix changes one command and records what it replaced. It cannot
 * touch a checkpoint: that would let a failed run turn itself green.
 */
function applyFix(contract, diagnosis, { at = new Date().toISOString(), attempt = 1 } = {}) {
  if (!diagnosis?.fix) throw new Error("This diagnosis does not propose a change.");
  const steps = (contract.steps || []).map((step) => {
    if (step.id !== diagnosis.fix.target) return step;
    const next = { ...step, command: diagnosis.fix.command };
    if (diagnosis.fix.checkCommand && step.check?.kind === "command") {
      next.check = { ...step.check, command: diagnosis.fix.checkCommand };
    }
    return next;
  });
  const target = contract.steps.find((step) => step.id === diagnosis.fix.target);
  if (!target) throw new Error("The step this fix targets no longer exists.");
  const deviations = [
    ...(Array.isArray(contract.deviations) ? contract.deviations : []),
    {
      at,
      attempt,
      step_id: target.id,
      from: target.command,
      to: diagnosis.fix.command,
      reason: diagnosis.cause || diagnosis.class,
      class: diagnosis.class,
    },
  ];
  if (diagnosis.fix.checkCommand) {
    deviations.push({
      at,
      attempt,
      step_id: target.id,
      from: target.check?.command || "",
      to: diagnosis.fix.checkCommand,
      reason: "The checkpoint tested the same binary, renamed for this machine.",
      class: diagnosis.class,
    });
  }
  const trimmed = deviations.slice(-20);
  return { ...contract, steps, deviations: trimmed };
}

module.exports = {
  CLASSES,
  MAX_LOG_CHARS,
  RULES,
  applyFix,
  causeFor,
  classifyLog,
  interpreterFix,
  diagnose,
  promptFor,
  tail,
  validate,
};
