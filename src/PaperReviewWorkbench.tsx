import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AlertTriangle, ArrowRight, BookOpenCheck, Check, ChevronDown, ChevronUp, FileSearch, FlaskConical, Lightbulb, LoaderCircle, RefreshCw, ScanSearch, Sparkles } from "lucide-react";

type ReviewAgentId = "related" | "method" | "experiments" | "limitations";
type ReviewStatus = "idle" | "working" | "complete" | "error";

type ReviewRun = { status: ReviewStatus; response: string; error: string };

type ReviewPaper = Pick<LibraryPaper, "id" | "title" | "authors" | "year" | "venue" | "abstract" | "url" | "pdf_url">;

const REVIEWERS: Array<{
  id: ReviewAgentId;
  title: string;
  subtitle: string;
  icon: typeof FileSearch;
  instruction: string;
}> = [
  {
    id: "related",
    title: "Related work",
    subtitle: "Position the contribution against its cited landscape.",
    icon: FileSearch,
    instruction: "Map the paper's related-work landscape. Identify the closest cited lines of work, the exact distinction the authors claim, and whether that distinction is adequately supported by the paper. Treat the paper's citations as evidence; clearly label any inference or missing comparison.",
  },
  {
    id: "method",
    title: "Method",
    subtitle: "Reconstruct the mechanism, assumptions, and dependencies.",
    icon: ScanSearch,
    instruction: "Reconstruct the proposed method in enough detail for a technically capable reader to implement or falsify it. Explain the pipeline, inputs and outputs, objective or algorithm, assumptions, and the critical design choices. Separate what is explicitly specified from what must be inferred.",
  },
  {
    id: "experiments",
    title: "Experiments",
    subtitle: "Test whether the evidence actually carries the claims.",
    icon: FlaskConical,
    instruction: "Audit the experimental evidence. List the central claims, datasets or tasks, baselines, metrics, ablations, and quantitative results. Judge whether each important claim is supported, partially supported, or unsupported. Flag missing controls, statistical uncertainty, or potentially unfair comparisons.",
  },
  {
    id: "limitations",
    title: "Limitations",
    subtitle: "Surface failure modes, scope boundaries, and open questions.",
    icon: Lightbulb,
    instruction: "Act as a constructive skeptical reviewer. Find limitations in the problem formulation, method, evaluation, reproducibility, and claimed scope. Distinguish author-stated limitations from your own evidence-grounded concerns. For every concern, say what observation or experiment could resolve it.",
  },
];

function initialRuns(): Record<ReviewAgentId, ReviewRun> {
  return Object.fromEntries(REVIEWERS.map((reviewer) => [reviewer.id, { status: "idle", response: "", error: "" }])) as Record<ReviewAgentId, ReviewRun>;
}

function reviewPrompt(reviewer: (typeof REVIEWERS)[number], paper: ReviewPaper, pageCount: number) {
  return `You are the ${reviewer.title} specialist in a five-agent paper review for “${paper.title}”.

${reviewer.instruction}

The PDF is attached and contains ${pageCount} indexed pages. Read the relevant original PDF sections before writing. Do not invent details. Cite the PDF page number for every material factual claim, table result, and quoted author claim. Use this exact structure:

## Findings
- concise, evidence-grounded findings

## Evidence and caveats
- claim or observation — p. N — why it matters

## Questions for the authors
- concrete questions that could change your assessment

Write for the Summary agent, not as a generic paper summary.`;
}

function summaryPrompt(paper: ReviewPaper, reports: Array<{ title: string; response: string }>) {
  const evidence = reports.map(({ title, response }) => `## ${title} specialist report\n${response.slice(0, 7500)}`).join("\n\n");
  return `You are the Summary agent for a five-agent review of “${paper.title}”. Synthesize the four specialist reports below into a durable research note.

Only treat page-cited claims as verified paper evidence. Preserve disagreements or uncertainty rather than smoothing them away. Do not invent citations.

Use this exact structure:

# Review note
## One-paragraph takeaway
## What the paper contributes
## How the method works
## Evidence assessment
## Related-work position
## Limitations and open questions
## Reproducibility checklist
## Recommended next reading or experiment

Specialist reports:
${evidence}`;
}

function readableReviewError(error: unknown) {
  return error instanceof Error ? error.message : String(error || "The agent request failed.");
}

export default function PaperReviewWorkbench({ bridge, workspace, projectId, paper, pageCount, ready, onAgentRun }: {
  bridge: ResearchDeskBridge;
  workspace: string;
  projectId?: string | null;
  paper: ReviewPaper;
  pageCount: number;
  ready: boolean;
  onAgentRun?: (result: AgentRunResult) => void;
}) {
  const [runs, setRuns] = useState<Record<ReviewAgentId, ReviewRun>>(initialRuns);
  const [summary, setSummary] = useState<ReviewRun>({ status: "idle", response: "", error: "" });
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState<Set<ReviewAgentId>>(new Set());

  const paperContext = useMemo<ContextAttachment[]>(() => [{
    id: `paper:${paper.id}`,
    type: "paper",
    name: paper.title,
    detail: `${paper.year ?? "n.d."} · ${paper.venue || "Paper"}`,
    paper: { title: paper.title, authors: paper.authors, year: paper.year, abstract: paper.abstract, url: paper.url, pdfUrl: paper.pdf_url },
  }], [paper]);

  const completeCount = REVIEWERS.filter((reviewer) => runs[reviewer.id].status === "complete").length;
  const errorCount = REVIEWERS.filter((reviewer) => runs[reviewer.id].status === "error").length;

  async function runReview() {
    if (running || !workspace || !ready) return;
    setRunning(true);
    setRuns(Object.fromEntries(REVIEWERS.map((reviewer) => [reviewer.id, { status: "working", response: "", error: "" }])) as Record<ReviewAgentId, ReviewRun>);
    setSummary({ status: "working", response: "", error: "" });

    const specialistResults = await Promise.all(REVIEWERS.map(async (reviewer) => {
      try {
        const result = await bridge.runAgent({
          prompt: reviewPrompt(reviewer, paper, pageCount),
          workspace,
          projectId: projectId || undefined,
          mode: "paper-review",
          reasoningEffort: "high",
          contextLength: "extra-long",
          contextItems: paperContext,
          clientRunId: crypto.randomUUID(),
        });
        if (result.status === "failed") throw new Error(result.response || "The specialist did not complete its review.");
        setRuns((current) => ({ ...current, [reviewer.id]: { status: "complete", response: result.response, error: "" } }));
        onAgentRun?.(result);
        return { reviewer, response: result.response };
      } catch (error) {
        const message = readableReviewError(error);
        setRuns((current) => ({ ...current, [reviewer.id]: { status: "error", response: "", error: message } }));
        return { reviewer, response: "", error: message };
      }
    }));

    const usableReports = specialistResults
      .filter((result): result is { reviewer: (typeof REVIEWERS)[number]; response: string } => Boolean(result.response))
      .map(({ reviewer, response }) => ({ title: reviewer.title, response }));

    if (!usableReports.length) {
      setSummary({ status: "error", response: "", error: "No specialist review completed, so there is nothing reliable to synthesize yet." });
      setRunning(false);
      return;
    }

    try {
      const result = await bridge.runAgent({
        prompt: summaryPrompt(paper, usableReports),
        workspace,
        projectId: projectId || undefined,
        mode: "paper-review",
        reasoningEffort: "high",
        contextLength: "extra-long",
        contextItems: paperContext,
        clientRunId: crypto.randomUUID(),
      });
      if (result.status === "failed") throw new Error(result.response || "The Summary agent did not complete its note.");
      setSummary({ status: "complete", response: result.response, error: "" });
      onAgentRun?.(result);
    } catch (error) {
      setSummary({ status: "error", response: "", error: readableReviewError(error) });
    } finally {
      setRunning(false);
    }
  }

  function toggleExpanded(id: ReviewAgentId) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return <main className="paper-review-workbench">
    <header className="paper-review-heading">
      <div>
        <span className="eyebrow">MULTI-AGENT REVIEW</span>
        <h1>Five lenses, one evidence-backed note.</h1>
        <p>Four specialists read the paper in parallel. The Summary agent then turns their evidence into a single research note.</p>
      </div>
      <button className="paper-review-run" onClick={() => void runReview()} disabled={running || !ready || !workspace}>
        {running ? <LoaderCircle className="spin" size={15} /> : completeCount || errorCount || summary.status === "complete" ? <RefreshCw size={15} /> : <Sparkles size={15} />}
        {running ? "Review in progress" : completeCount || errorCount || summary.status === "complete" ? "Run again" : "Run review"}
      </button>
    </header>

    {!ready && <div className="paper-review-notice"><AlertTriangle size={16} /><div><strong>Prepare the paper first</strong><span>The agents need the locally indexed PDF so they can cite the original pages.</span></div></div>}
    {!workspace && <div className="paper-review-notice"><AlertTriangle size={16} /><div><strong>Choose a workspace first</strong><span>A workspace is required to keep the five review runs available in Archimedes.</span></div></div>}

    <section className="paper-review-grid" aria-label="Specialist review agents">
      {REVIEWERS.map((reviewer) => {
        const run = runs[reviewer.id];
        const Icon = reviewer.icon;
        const isExpanded = expanded.has(reviewer.id);
        return <article className={`paper-review-card ${run.status}`} key={reviewer.id}>
          <header>
            <span className="paper-review-icon"><Icon size={18} /></span>
            <div><h2>{reviewer.title}</h2><p>{reviewer.subtitle}</p></div>
            <span className={`paper-review-status ${run.status}`}>{run.status === "working" ? <LoaderCircle className="spin" size={13} /> : run.status === "complete" ? <Check size={13} /> : run.status === "error" ? <AlertTriangle size={13} /> : <ArrowRight size={13} />}</span>
          </header>
          {run.status === "working" && <p className="paper-review-card-message">Reading the source and assembling page-cited findings…</p>}
          {run.status === "error" && <p className="paper-review-card-error">{run.error}</p>}
          {run.status === "complete" && <>
            <button className="paper-review-expand" onClick={() => toggleExpanded(reviewer.id)} aria-expanded={isExpanded}>{isExpanded ? "Hide specialist note" : "Read specialist note"}{isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
            {isExpanded && <div className="paper-review-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{run.response}</ReactMarkdown></div>}
          </>}
        </article>;
      })}
    </section>

    <section className={`paper-review-summary ${summary.status}`}>
      <header><span className="paper-review-icon"><BookOpenCheck size={18} /></span><div><span className="eyebrow">SUMMARY AGENT</span><h2>Final research note</h2></div>{summary.status === "working" && <span className="paper-review-summary-state"><LoaderCircle className="spin" size={14} />Synthesizing evidence</span>}</header>
      {summary.status === "idle" && <p>Run the review to collect independent readings before producing the final note.</p>}
      {summary.status === "working" && <p>Specialist reports are being checked for agreement, evidence, and open questions.</p>}
      {summary.status === "error" && <p className="paper-review-summary-error">{summary.error}</p>}
      {summary.status === "complete" && <div className="paper-review-markdown paper-review-final-note"><ReactMarkdown remarkPlugins={[remarkGfm]}>{summary.response}</ReactMarkdown></div>}
    </section>
  </main>;
}
