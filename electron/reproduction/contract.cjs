/**
 * Reproduction contract.
 *
 * The contract is the only thing the rest of the feature trusts: it records
 * what will be reproduced, where that claim lives in the paper, how the
 * environment is built, and how large the budget is. It is produced by the
 * planner, reviewed by a human, and then frozen.
 */

const CONTRACT_VERSION = 2;
const MAX_CLAIMS = 12;
const MAX_STEPS = 10;

const STATUSES = Object.freeze([
  "draft", "planned", "queued", "provisioning", "running",
  "diagnosing", "verified", "diverged", "blocked", "cancelled",
]);

function text(value, limit = 2_000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function boundedNumber(value, fallback, min, max) {
  const parsed = typeof value === "string" ? Number(value.replace(/[^0-9.eE+-]/g, "")) : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeTolerance(value) {
  // Relative tolerance, e.g. 0.02 means "within 2% of the reported number".
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0.02;
  return Math.min(0.5, parsed);
}

function normalizeClaim(input, index) {
  const claim = input && typeof input === "object" ? input : {};
  const statement = text(claim.statement || claim.claim, 600);
  if (!statement) return null;
  const evidence = claim.evidence && typeof claim.evidence === "object" ? claim.evidence : {};
  const page = Math.trunc(boundedNumber(evidence.page, 0, 0, 10_000));
  const expectedRaw = claim.expected;
  const expected = expectedRaw === null || expectedRaw === undefined || expectedRaw === ""
    ? null
    : boundedNumber(expectedRaw, NaN, -1e12, 1e12);
  return {
    id: text(claim.id, 80) || `claim-${index + 1}`,
    statement,
    dataset: text(claim.dataset, 160),
    metric: text(claim.metric, 160),
    expected: Number.isFinite(expected) ? expected : null,
    unit: text(claim.unit, 40),
    tolerance: normalizeTolerance(claim.tolerance),
    step: text(claim.step, 80),
    evidence: {
      page: page || null,
      table: text(evidence.table, 80),
      row: text(evidence.row, 160),
      column: text(evidence.column || evidence.col, 160),
      quote: text(evidence.quote, 400),
    },
  };
}

function normalizeEntrypoint(input) {
  const entry = input && typeof input === "object" ? input : {};
  return {
    command: text(entry.command, 2_000),
    cwd: text(entry.cwd, 400) || ".",
    outputs: Array.isArray(entry.outputs)
      ? entry.outputs.filter((item) => typeof item === "string").map((item) => text(item, 400)).filter(Boolean).slice(0, 10)
      : [],
    // Paths the planner claims exist; filled from the checkout, not the model.
    evidence: Array.isArray(entry.evidence)
      ? entry.evidence
        .filter((item) => item && typeof item.path === "string")
        .map((item) => ({ path: text(item.path, 400), line_count: Math.max(0, Number(item.line_count) || 0) }))
        .slice(0, 12)
      : [],
    unverified: Array.isArray(entry.unverified)
      ? entry.unverified.filter((item) => typeof item === "string").map((item) => text(item, 400)).filter(Boolean).slice(0, 12)
      : [],
  };
}

function normalizeEnvironment(input) {
  const env = input && typeof input === "object" ? input : {};
  const list = (value, limit) => (Array.isArray(value)
    ? value.map((item) => text(item, 400)).filter(Boolean).slice(0, limit)
    : []);
  return {
    python: text(env.python, 40),
    cuda: text(env.cuda, 40),
    install: list(env.install, 20),
    system: list(env.system, 20),
    source: text(env.source, 400),
  };
}

function normalizeStep(input, index) {
  const step = input && typeof input === "object" ? input : {};
  const title = text(step.title, 200);
  if (!title) return null;
  return {
    id: text(step.id, 80) || `step-${index + 1}`,
    title,
    detail: text(step.detail, 600),
    command: text(step.command, 2_000),
    checkpoint: text(step.checkpoint, 400),
    source: text(step.source, 400),
    blocked: text(step.blocked, 600),
  };
}

/**
 * Older contracts only knew an entrypoint. Rebuild a minimal runbook so the
 * view keeps a single shape.
 */
function synthesizeSteps({ entrypoint, environment }) {
  const steps = [];
  steps.push({
    id: "fetch", title: "Get the code", detail: "", command: "", checkpoint: "", source: environment.source, blocked: "",
  });
  if (environment.install.length || environment.python || environment.cuda) {
    steps.push({
      id: "environment",
      title: "Set up the environment",
      detail: [environment.python && `Python ${environment.python}`, environment.cuda && `CUDA ${environment.cuda}`].filter(Boolean).join(" · "),
      command: environment.install.join(" && "),
      checkpoint: "",
      source: environment.source,
      blocked: "",
    });
  }
  steps.push({
    id: "run",
    title: "Produce the numbers",
    detail: "",
    command: entrypoint.command,
    checkpoint: "",
    source: "",
    blocked: entrypoint.command ? "" : "No command in the paper or the repository produces these numbers.",
  });
  return steps;
}

/**
 * Rejects anything the runner could not act on. A contract with no claims is
 * a planning failure, not an empty success.
 */
function normalizeContract(input, { paperTitle = "" } = {}) {
  const value = input && typeof input === "object" ? input : {};
  const claims = (Array.isArray(value.claims) ? value.claims : [])
    .map(normalizeClaim)
    .filter(Boolean)
    .slice(0, MAX_CLAIMS);
  if (!claims.length) throw new Error("The reproduction plan has no verifiable claim.");
  const entrypoint = normalizeEntrypoint(value.entrypoint);
  const parsedSteps = (Array.isArray(value.steps) ? value.steps : [])
    .map(normalizeStep)
    .filter(Boolean)
    .slice(0, MAX_STEPS);
  const environment = normalizeEnvironment(value.environment);
  const steps = parsedSteps.length ? parsedSteps : synthesizeSteps({ entrypoint, environment });
  const summary = text(value.summary, 1_200) || `${paperTitle || "This paper"}: ${claims[0].statement}`;
  return {
    version: CONTRACT_VERSION,
    summary,
    claims,
    steps,
    entrypoint,
    environment,
    repo: {
      url: text(value.repo?.url, 2_000),
      commit: text(value.repo?.commit, 80),
    },
    notes: Array.isArray(value.notes) ? value.notes.map((item) => text(item, 400)).filter(Boolean).slice(0, 10) : [],
    frozen_at: null,
  };
}

function describeClaim(claim) {
  const expected = claim.expected === null ? "no reported value" : `${claim.expected}${claim.unit ? ` ${claim.unit}` : ""}`;
  const where = claim.evidence.table || (claim.evidence.page ? `page ${claim.evidence.page}` : "unlocated");
  return `${claim.statement} — expected ${expected} (${where})`;
}

module.exports = {
  CONTRACT_VERSION,
  MAX_CLAIMS,
  STATUSES,
  describeClaim,
  normalizeClaim,
  normalizeContract,
  normalizeStep,
  normalizeTolerance,
};
