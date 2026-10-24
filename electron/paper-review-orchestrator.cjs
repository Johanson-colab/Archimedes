const { runAgent } = require("./agent.cjs");

const SPECIALISTS = [
  {
    id: "related",
    title: "Related work",
    instruction: "Map the cited research landscape. Identify the closest cited lines of work, the exact distinction claimed by the authors, and whether the paper supplies a fair comparison. Separate direct paper evidence from reasonable inference and untested novelty claims.",
  },
  {
    id: "method",
    title: "Method",
    instruction: "Reconstruct the mechanism precisely enough to implement or falsify it: inputs, outputs, pipeline, objective or algorithm, assumptions, dependencies, and critical choices. Separate what is explicit from what is inferred.",
  },
  {
    id: "experiments",
    title: "Experiments",
    instruction: "Audit whether the empirical record carries the claims. Cover tasks, datasets, baselines, metrics, ablations, quantitative results, and the most consequential missing controls or uncertainty.",
  },
  {
    id: "limitations",
    title: "Limitations",
    instruction: "Act as a constructive skeptical reviewer. Find boundaries in formulation, method, evaluation, reproducibility, and scope. Distinguish author-stated limitations from evidence-grounded concerns, and name the observation or experiment that could resolve each concern.",
  },
];

function specialistPrompt(specialist, paper, pageCount) {
  return `You are the ${specialist.title} specialist in an evidence-first paper review of “${paper.title}”.\n\n${specialist.instruction}\n\nThe attached PDF contains ${pageCount || "indexed"} pages. Read the relevant original PDF sections before writing. Do not invent details. Cite a PDF page for every material factual claim, result, or author claim. Write for an evidence supervisor, not as a generic summary.\n\nUse exactly these sections:\n## Findings\n## Page-cited evidence\n## Uncertainty and missing evidence\n## Questions that could change the assessment`;
}

function supervisorPrompt(paper, reports) {
  const dossier = reports.map(({ id, title, response }) => `### ${title} (${id})\n${String(response || "").slice(0, 8_000)}`).join("\n\n");
  return `You are the Evidence Supervisor for a multi-agent review of “${paper.title}”. Audit the four specialist reports below before a final summary is permitted.\n\nCheck: (1) material factual claims have PDF page citations, (2) specialists do not overstate novelty or experimental evidence, (3) disagreements and gaps remain visible. You may request one targeted revision pass for no more than two specialists.\n\nReturn ONLY valid JSON in this schema:\n{"verdict":"ready"|"repair","repair_targets":["related"|"method"|"experiments"|"limitations"],"reason":"short evidence-specific explanation","requirements":{"related":"...","method":"...","experiments":"...","limitations":"..."}}\n\nUse an empty repair_targets array when ready. Requirements must only describe necessary repairs.\n\nSpecialist reports:\n${dossier}`;
}

function repairPrompt(specialist, paper, priorResponse, requirement, pageCount) {
  return `You are revising the ${specialist.title} report for “${paper.title}” after an evidence audit. The PDF has ${pageCount || "indexed"} pages.\n\nAudit requirement: ${requirement || "Strengthen page-cited evidence and preserve uncertainty."}\n\nPrevious report:\n${String(priorResponse || "").slice(0, 9_000)}\n\nRe-read the relevant PDF pages. Replace the report with a corrected version using exactly:\n## Findings\n## Page-cited evidence\n## Uncertainty and missing evidence\n## Questions that could change the assessment\n\nDo not claim a fact, result, or comparison without a page citation.`;
}

function summaryPrompt(paper, reports, supervisor) {
  const dossier = reports.map(({ title, response }) => `### ${title}\n${String(response || "").slice(0, 8_000)}`).join("\n\n");
  return `You are the Summary agent for an evidence-audited review of “${paper.title}”. Produce a durable research memorandum from the specialist reports.\n\nSupervisor verdict:\n${supervisor?.reason || "No additional supervisor note."}\n\nOnly page-cited statements count as verified paper evidence. Preserve uncertainty and disagreement; do not invent citations.\n\nUse exactly this structure:\n# Review memorandum\n## Central contribution\n## Method in brief\n## Experimental record\n## Position in related work\n## Limitations and open questions\n## Reproducibility checklist\n## Suggested next verification\n\nSpecialist reports:\n${dossier}`;
}

function parseSupervisor(response) {
  const fallback = { verdict: "ready", repair_targets: [], reason: "The evidence supervisor completed without a machine-readable repair request.", requirements: {} };
  const match = String(response || "").match(/\{[\s\S]*\}/);
  if (!match) return fallback;
  try {
    const parsed = JSON.parse(match[0]);
    const targets = Array.isArray(parsed.repair_targets)
      ? parsed.repair_targets.filter((id) => SPECIALISTS.some((specialist) => specialist.id === id)).slice(0, 2)
      : [];
    return {
      verdict: targets.length ? "repair" : "ready",
      repair_targets: targets,
      reason: String(parsed.reason || fallback.reason),
      requirements: parsed.requirements && typeof parsed.requirements === "object" ? parsed.requirements : {},
    };
  } catch {
    return fallback;
  }
}

function emitStage(emit, payload) {
  emit({ type: "stage", ...payload });
}

async function runPaperReview({ paper, pageCount, workspace, projectId, contextItems, reasoningEffort, contextLength, browser, emit = () => {} }) {
  // Review specialists are internal workers. Their reports are returned to the
  // review workbench, never persisted as user-visible project conversations.
  const common = { workspace, projectId, mode: "paper-review", reasoningEffort, contextLength, contextItems, browser, transient: true, emit: () => {} };
  emitStage(emit, { stage: "specialists", title: "Four independent readings", detail: "Related work, method, experiments, and limitations are reading the source in parallel." });

  const settled = await Promise.all(SPECIALISTS.map(async (specialist) => {
    emitStage(emit, { stage: "specialist_started", reviewerId: specialist.id, title: `${specialist.title} is reading`, detail: "Checking the original PDF for page-cited evidence." });
    try {
      const result = await runAgent({ ...common, prompt: specialistPrompt(specialist, paper, pageCount) });
      if (result.status !== "completed") throw new Error(result.response || "The specialist did not complete its reading.");
      emitStage(emit, { stage: "specialist_complete", reviewerId: specialist.id, title: `${specialist.title} completed`, detail: "Its independent evidence note is ready." });
      return { ...specialist, status: "complete", response: result.response, error: "", run: result };
    } catch (error) {
      const message = error?.message || String(error);
      emitStage(emit, { stage: "specialist_failed", reviewerId: specialist.id, title: `${specialist.title} needs attention`, detail: message });
      return { ...specialist, status: "error", response: "", error: message, run: null };
    }
  }));

  const usable = settled.filter((result) => result.status === "complete");
  if (!usable.length) {
    throw new Error("No specialist completed a page-cited reading, so Archimedes cannot produce a reliable review memorandum.");
  }
  const agentRuns = settled.map((result) => result.run).filter(Boolean);

  emitStage(emit, { stage: "supervisor", title: "Evidence audit", detail: "Checking citations, overclaims, and conflicts before synthesis." });
  let supervisorRun = null;
  let supervisor = { verdict: "ready", repair_targets: [], reason: "Evidence audit unavailable; the memorandum will retain all stated uncertainty.", requirements: {} };
  try {
    supervisorRun = await runAgent({ ...common, prompt: supervisorPrompt(paper, usable) });
    agentRuns.push(supervisorRun);
    if (supervisorRun.status === "completed") supervisor = parseSupervisor(supervisorRun.response);
  } catch (error) {
    supervisor.reason = `Evidence supervisor did not complete: ${error?.message || String(error)}`;
  }

  if (supervisor.repair_targets.length) {
    emitStage(emit, { stage: "repair", title: "Targeted evidence repair", detail: `${supervisor.repair_targets.length} specialist note${supervisor.repair_targets.length === 1 ? "" : "s"} is being re-checked against the PDF.` });
    const repaired = await Promise.all(supervisor.repair_targets.map(async (id) => {
      const specialist = SPECIALISTS.find((item) => item.id === id);
      const previous = settled.find((item) => item.id === id);
      if (!specialist || !previous?.response) return null;
      try {
        const run = await runAgent({ ...common, prompt: repairPrompt(specialist, paper, previous.response, supervisor.requirements[id], pageCount) });
        agentRuns.push(run);
        if (run.status !== "completed") throw new Error(run.response || "The repair pass did not complete.");
        return { id, response: run.response, run };
      } catch (error) {
        return { id, error: error?.message || String(error), run: null };
      }
    }));
    for (const repair of repaired) {
      if (!repair) continue;
      const target = settled.find((item) => item.id === repair.id);
      if (!target) continue;
      if (repair.response) {
        target.response = repair.response;
        target.run = repair.run;
        target.repaired = true;
      } else if (repair.error) {
        target.error = `${target.error ? `${target.error} ` : ""}Repair pass: ${repair.error}`;
      }
    }
  }

  const finalReports = settled.filter((result) => result.status === "complete" && result.response);
  emitStage(emit, { stage: "summary", title: "Writing the memorandum", detail: "Combining audited evidence while retaining uncertainty and disagreements." });
  const summaryRun = await runAgent({ ...common, prompt: summaryPrompt(paper, finalReports, supervisor) });
  agentRuns.push(summaryRun);
  if (summaryRun.status !== "completed") throw new Error(summaryRun.response || "The Summary agent did not complete the review memorandum.");
  emitStage(emit, { stage: "complete", title: "Review memorandum complete", detail: "The evidence-audited review is ready to read." });

  return {
    specialists: settled.map(({ id, title, status, response, error, repaired, run }) => ({ id, title, status, response, error, repaired: Boolean(repaired), run })),
    supervisor: { verdict: supervisor.verdict, repairTargets: supervisor.repair_targets, reason: supervisor.reason, run: supervisorRun },
    summary: { response: summaryRun.response, run: summaryRun },
    agentRuns,
  };
}

module.exports = { runPaperReview };
