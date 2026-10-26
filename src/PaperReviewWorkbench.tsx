import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Expand, FileSearch, FlaskConical, Lightbulb, LoaderCircle, RefreshCw, ScanSearch, Sparkles } from "lucide-react";

type ReviewAgentId = "related" | "method" | "experiments" | "limitations";
type ReviewStatus = "idle" | "working" | "complete" | "error";
type ReviewRun = { status: ReviewStatus; response: string; error: string; repaired?: boolean };
type ReviewPaper = Pick<LibraryPaper, "id" | "title" | "authors" | "year" | "venue" | "abstract" | "url" | "pdf_url">;

const REVIEWERS: Array<{ id: ReviewAgentId; title: string; icon: typeof FileSearch }> = [
  { id: "related", title: "Positioning", icon: FileSearch },
  { id: "method", title: "Method", icon: ScanSearch },
  { id: "experiments", title: "Evidence", icon: FlaskConical },
  { id: "limitations", title: "Discussion", icon: Lightbulb },
];

const SLIDE_NAMES = ["Cover", "Question", "Contribution", "Method", "Evidence", "Verdict", "Discussion"];
const pdfByteCache = new Map<string, Promise<ArrayBuffer>>();

function isReviewAgentId(value: string | undefined): value is ReviewAgentId {
  return REVIEWERS.some((reviewer) => reviewer.id === value);
}

function initialRuns(): Record<ReviewAgentId, ReviewRun> {
  return Object.fromEntries(REVIEWERS.map((reviewer) => [reviewer.id, { status: "idle", response: "", error: "" }])) as Record<ReviewAgentId, ReviewRun>;
}

function reviewError(error: unknown) {
  return error instanceof Error ? error.message : String(error || "The review could not be completed.");
}

function plainText(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\\\[[\s\S]*?\\\]/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
    .replace(/[\\*_`>#]/g, "")
    .replace(/\s*\((?:PDF\s*)?pp?\.\s*[^\)]+\)/gi, "")
    .replace(/\s*\[(?:PDF\s*)?pp?\.\s*[^\]]+\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function shorten(value: string, limit = 150) {
  const text = plainText(value);
  if (text.length <= limit) return text;
  const shortened = text.slice(0, limit + 1).replace(/\s+\S*$/, "").trimEnd();
  return `${shortened || text.slice(0, limit)}…`;
}

function reviewPoints(markdown: string, limit = 3) {
  const bulletLines = markdown.split("\n")
    .filter((line) => /^\s*(?:[-*]|\d+\.)\s+/.test(line))
    .map((line) => shorten(line.replace(/^\s*(?:[-*]|\d+\.)\s+/, "")))
    .filter((line) => line.length > 24);
  if (bulletLines.length) return bulletLines.slice(0, limit);
  return plainText(markdown)
    .split(/(?<=[.!?])\s+/)
    .filter((line) => line.length > 28)
    .slice(0, limit)
    .map((line) => shorten(line));
}

function citedPage(markdown: string, fallback: number, pageCount: number, preferRangeEnd = false) {
  const match = markdown.match(/(?:PDF\s*)?pp?\.\s*(\d+)(?:\s*[–-]\s*(\d+))?/i);
  const page = match ? Number(preferRangeEnd && match[2] ? match[2] : match[1]) : fallback;
  return Math.min(Math.max(1, Number.isFinite(page) ? page : fallback), Math.max(1, pageCount));
}

function displayMetric(sentence: string) {
  const explicitMetric = sentence.match(/\d+(?:\.\d+)?(?:%|×|x|\s+points?|\s+MiB|\s+GiB)/i)?.[0];
  if (explicitMetric) return explicitMetric;
  return Array.from(sentence.matchAll(/\d+(?:\.\d+)?/g)).find((match) => {
    const before = sentence[match.index! - 1] || "";
    const after = sentence[match.index! + match[0].length] || "";
    const prefix = sentence.slice(Math.max(0, match.index! - 8), match.index!);
    return before !== "-" && !/[A-Za-z]/.test(after) && !/Table\s*$/i.test(prefix);
  })?.[0] || "";
}

function metricStatements(markdown: string) {
  const candidates = plainText(markdown).split(/(?<=[.!?])\s+/)
    .filter((sentence) => Boolean(displayMetric(sentence)))
    .map((sentence, order) => {
      const normalized = sentence.toLowerCase();
      let score = 0;
      if (/headline|principal memory table|average score|flash.*50\.6|nano.*47\.0/.test(normalized)) score += 70;
      if (/speedup|latency|66×|persistent logical state|per-trajectory|reduction in/.test(normalized)) score += 55;
      if (/outperform|baseline|benchmark|strongest/.test(normalized)) score += 30;
      if (/general capability|noise condition|drops?|down\s+\d|difference/.test(normalized)) score -= 45;
      if (/capped|used for memory capability/.test(normalized)) score -= 60;
      return { sentence, score, order };
    })
    .sort((left, right) => right.score - left.score || left.order - right.order);
  const selected: typeof candidates = [];
  for (const candidate of candidates) {
    const category = /speedup|latency/.test(candidate.sentence.toLowerCase()) ? "speed"
      : /66×|persistent logical state|per-trajectory|reduction in/.test(candidate.sentence.toLowerCase()) ? "storage"
        : "quality";
    if (selected.some((entry) => {
      const selectedCategory = /speedup|latency/.test(entry.sentence.toLowerCase()) ? "speed"
        : /66×|persistent logical state|per-trajectory|reduction in/.test(entry.sentence.toLowerCase()) ? "storage"
          : "quality";
      return selectedCategory === category;
    })) continue;
    selected.push(candidate);
    if (selected.length === 3) break;
  }
  return selected.map(({ sentence }) => {
    const metric = displayMetric(sentence) || "Result";
    return { metric, context: shorten(sentence.replace(metric, "").replace(/^\s*[,;:–—-]?\s*/, ""), 112) };
  });
}

function loadPdfBytes(url: string) {
  const cached = pdfByteCache.get(url);
  if (cached) return cached;
  const request = fetch(url).then((response) => {
    if (!response.ok) throw new Error(`PDF request failed (${response.status})`);
    return response.arrayBuffer();
  });
  pdfByteCache.set(url, request);
  return request;
}

function PaperSlideVisual({ url, page, label, crop = "page" }: { url: string; page: number; label: string; crop?: "page" | "detail" }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!url || !width) return;
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<unknown> } | null = null;
    setState("loading");
    void (async () => {
      try {
        const [{ pdfjs }, bytes] = await Promise.all([import("./pdf-runtime"), loadPdfBytes(url)]);
        if (cancelled) return;
        const document = await pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
        const pdfPage = await document.getPage(Math.min(page, document.numPages));
        const base = pdfPage.getViewport({ scale: 1 });
        const density = Math.min(2, window.devicePixelRatio || 1);
        const viewport = pdfPage.getViewport({ scale: Math.max(0.2, (width * density) / base.width) });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas is unavailable.");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        renderTask = pdfPage.render({ canvas, canvasContext: context, viewport });
        await renderTask.promise;
        if (!cancelled) setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [page, url, width]);

  return <figure className={`review-slide-visual ${crop}`} ref={hostRef} data-ui>
    <canvas ref={canvasRef} aria-label={`${label}, PDF page ${page}`} />
    {state === "loading" && <span><LoaderCircle className="spin" size={18} />Rendering page {page}</span>}
    {state === "error" && <span><AlertTriangle size={18} />Page {page} could not be rendered</span>}
    <figcaption>PDF · p. {page}</figcaption>
  </figure>;
}

function SlideCounter({ current, total }: { current: number; total: number }) {
  return <span className="review-slide-counter">{current + 1} / {total}</span>;
}

export default function PaperReviewWorkbench({ bridge, workspace, projectId, paper, pageCount, ready, pdfUrl = "", onInternalReviewThreadsDeleted }: {
  bridge: ResearchDeskBridge;
  workspace: string;
  projectId?: string | null;
  paper: ReviewPaper;
  pageCount: number;
  ready: boolean;
  pdfUrl?: string;
  onInternalReviewThreadsDeleted?: (threadIds: string[]) => void;
}) {
  const [runs, setRuns] = useState<Record<ReviewAgentId, ReviewRun>>(initialRuns);
  const [summary, setSummary] = useState<ReviewRun>({ status: "idle", response: "", error: "" });
  const [audit, setAudit] = useState("The evidence audit will check citations, overclaims, and disagreements before synthesis.");
  const [stage, setStage] = useState("Ready for a source-grounded review.");
  const [running, setRunning] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const runIdRef = useRef<string | null>(null);
  const restoreIdRef = useRef(0);
  const deckRef = useRef<HTMLDivElement>(null);

  const paperContext = useMemo<ContextAttachment[]>(() => [{
    id: `paper:${paper.id}`,
    type: "paper",
    name: paper.title,
    detail: `${paper.year ?? "n.d."} · ${paper.venue || "Paper"}`,
    paper: { title: paper.title, authors: paper.authors, year: paper.year, abstract: paper.abstract, url: paper.url, pdfUrl: paper.pdf_url },
  }], [paper]);

  useEffect(() => bridge.onPaperReviewEvent((event) => {
    if (!runIdRef.current || event.clientRunId !== runIdRef.current) return;
    setStage(event.detail);
    if (isReviewAgentId(event.reviewerId) && event.stage === "specialist_complete" && event.response) {
      setRuns((current) => ({ ...current, [event.reviewerId!]: { status: "complete", response: event.response!, error: "" } }));
    }
    if (isReviewAgentId(event.reviewerId) && event.stage === "specialist_failed") {
      setRuns((current) => ({ ...current, [event.reviewerId!]: { status: "error", response: "", error: event.detail } }));
    }
    if (event.stage === "supervisor" || event.stage === "repair") setAudit(event.detail);
  }), [bridge]);

  useEffect(() => {
    let mounted = true;
    void bridge.cleanupPaperReviewRuns(workspace).then(({ threadIds }) => {
      if (mounted && threadIds.length) onInternalReviewThreadsDeleted?.(threadIds);
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, [bridge, onInternalReviewThreadsDeleted, workspace]);

  useEffect(() => {
    let mounted = true;
    const restoreId = ++restoreIdRef.current;
    void bridge.getPaperReview(paper.id, workspace).then((saved) => {
      if (!mounted || restoreId !== restoreIdRef.current || runIdRef.current || !saved) return;
      const restoredRuns = initialRuns();
      for (const report of saved.specialists) {
        if (!isReviewAgentId(report.id)) continue;
        restoredRuns[report.id] = { status: report.status, response: report.response, error: report.error, repaired: report.repaired };
      }
      setRuns(restoredRuns);
      setAudit(saved.audit || "The saved evidence audit did not include a written rationale.");
      setSummary({ status: "complete", response: saved.summary, error: "" });
      setStage("Saved review restored. Run the review again to replace it.");
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, [bridge, paper.id, workspace]);

  const visibleRuns = summary.status === "error"
    ? Object.fromEntries(REVIEWERS.map((reviewer) => {
      const run = runs[reviewer.id];
      return [reviewer.id, run.status === "working"
        ? { status: "error" as const, response: "", error: `Review stopped before this reading completed. ${summary.error}` }
        : run];
    })) as Record<ReviewAgentId, ReviewRun>
    : runs;
  const completeCount = REVIEWERS.filter((reviewer) => visibleRuns[reviewer.id].status === "complete").length;
  const relatedPoints = reviewPoints(visibleRuns.related.response, 3);
  const methodPoints = reviewPoints(visibleRuns.method.response, 3);
  const experimentPoints = reviewPoints(visibleRuns.experiments.response, 3);
  const limitationPoints = reviewPoints(visibleRuns.limitations.response, 3);
  const summaryPoints = reviewPoints(summary.response, 3);
  const metrics = metricStatements(visibleRuns.experiments.response);
  const slideCount = summary.status === "complete" ? SLIDE_NAMES.length : 1;

  const pages = {
    cover: 1,
    related: citedPage(visibleRuns.related.response, Math.min(5, pageCount), pageCount),
    method: citedPage(visibleRuns.method.response, Math.min(7, pageCount), pageCount),
    experiments: citedPage(visibleRuns.experiments.response, Math.min(10, pageCount), pageCount, true),
    limitations: citedPage(visibleRuns.limitations.response, Math.max(1, pageCount - 2), pageCount),
  };

  useEffect(() => setActiveSlide(0), [paper.id, summary.status]);

  useEffect(() => {
    function navigate(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") {
        event.preventDefault();
        setActiveSlide((current) => Math.min(slideCount - 1, current + 1));
      }
      if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        setActiveSlide((current) => Math.max(0, current - 1));
      }
      if (event.key === "Home") setActiveSlide(0);
      if (event.key === "End") setActiveSlide(slideCount - 1);
    }
    window.addEventListener("keydown", navigate);
    return () => window.removeEventListener("keydown", navigate);
  }, [slideCount]);

  async function runReview() {
    if (running || !workspace || !ready) return;
    const clientRunId = crypto.randomUUID();
    runIdRef.current = clientRunId;
    setRunning(true);
    setActiveSlide(0);
    setStage("Four independent readings are starting from the indexed original PDF.");
    setAudit("The evidence audit will begin after the independent readings finish.");
    setRuns(Object.fromEntries(REVIEWERS.map((reviewer) => [reviewer.id, { status: "working", response: "", error: "" }])) as Record<ReviewAgentId, ReviewRun>);
    setSummary({ status: "working", response: "", error: "" });

    try {
      const result = await bridge.runPaperReview({ paper, pageCount, workspace, projectId, reasoningEffort: "high", contextLength: "extra-long", contextItems: paperContext, clientRunId });
      const nextRuns = initialRuns();
      for (const report of result.specialists) nextRuns[report.id] = { status: report.status, response: report.response, error: report.error, repaired: report.repaired };
      setRuns(nextRuns);
      if (result.error || !result.summary) {
        const message = result.error || "The review ended before a research memorandum could be written.";
        setAudit(result.supervisor.reason);
        setSummary({ status: "error", response: "", error: message });
        setStage(message);
        return;
      }
      setAudit(result.supervisor.repairTargets.length
        ? `${result.supervisor.reason} A targeted repair was completed for ${result.supervisor.repairTargets.join(" and ")}.`
        : result.supervisor.reason);
      setSummary({ status: "complete", response: result.summary.response, error: "" });
      setStage("Presentation ready.");
    } catch (error) {
      const message = reviewError(error);
      setRuns((current) => Object.fromEntries(REVIEWERS.map((reviewer) => {
        const run = current[reviewer.id];
        return [reviewer.id, run.status === "working" ? { status: "error" as const, response: "", error: `Review stopped before this reading completed. ${message}` } : run];
      })) as Record<ReviewAgentId, ReviewRun>);
      setSummary({ status: "error", response: "", error: message });
      setStage(message);
    } finally {
      setRunning(false);
      runIdRef.current = null;
    }
  }

  function renderSlide() {
    if (summary.status !== "complete") {
      return <section className={`review-slide review-slide-waiting ${summary.status}`}>
        <div className="review-waiting-copy">
          <span className="review-deck-wordmark">Archimedes briefing</span>
          <h1>{paper.title}</h1>
          <p>{summary.status === "error" ? summary.error : running ? stage : "Generate a visual, source-grounded presentation for your next lab meeting."}</p>
          <button type="button" onClick={() => void runReview()} disabled={running || !ready || !workspace}>
            {running ? <LoaderCircle className="spin" size={18} /> : summary.status === "error" ? <RefreshCw size={18} /> : <Sparkles size={18} />}
            {running ? `${completeCount} of 4 readings complete` : summary.status === "error" ? "Try review again" : "Build presentation"}
          </button>
        </div>
        {pdfUrl ? <PaperSlideVisual url={pdfUrl} page={pages.cover} label={paper.title} /> : <div className="review-slide-paper-fallback"><span>{paper.title.slice(0, 1)}</span></div>}
      </section>;
    }

    if (activeSlide === 0) return <section className="review-slide review-slide-cover">
      <div className="review-cover-copy">
        <span className="review-deck-wordmark">Paper briefing</span>
        <h1>{paper.title}</h1>
        <p>{paper.authors.slice(0, 5).join(", ")}{paper.authors.length > 5 ? " et al." : ""}</p>
        <div><strong>{paper.year ?? "Undated"}</strong><span>{paper.venue || "Research paper"}</span></div>
      </div>
      <PaperSlideVisual url={pdfUrl} page={pages.cover} label="Paper title page" />
      <SlideCounter current={activeSlide} total={slideCount} />
    </section>;

    if (activeSlide === 1) return <section className="review-slide review-slide-question">
      <div className="review-slide-heading"><h2>What problem does this paper solve?</h2><p>{shorten(paper.abstract || summaryPoints[0] || "The paper's central research question is reconstructed from the review.", 330)}</p></div>
      <div className="review-question-takeaway"><strong>{summaryPoints[0] || relatedPoints[0] || "A source-grounded assessment is ready."}</strong></div>
      <PaperSlideVisual url={pdfUrl} page={pages.related} label="Problem framing in the paper" crop="detail" />
      <SlideCounter current={activeSlide} total={slideCount} />
    </section>;

    if (activeSlide === 2) return <section className="review-slide review-slide-contribution">
      <div className="review-slide-heading"><h2>What is actually new?</h2><p>The closest work and the paper's claimed departure, shown side by side.</p></div>
      <div className="review-contribution-copy">
        <div><span>Closest precedent</span><strong>{relatedPoints[0] || "The review identifies the closest architectural and conceptual predecessor."}</strong></div>
        <div><span>Claimed departure</span><strong>{relatedPoints[1] || methodPoints[0] || "The method changes where and how the system stores information."}</strong></div>
      </div>
      <PaperSlideVisual url={pdfUrl} page={pages.related} label="Related work evidence" crop="detail" />
      <SlideCounter current={activeSlide} total={slideCount} />
    </section>;

    if (activeSlide === 3) return <section className="review-slide review-slide-method">
      <PaperSlideVisual url={pdfUrl} page={pages.method} label="Method figure" crop="detail" />
      <div className="review-method-copy"><h2>How it works</h2><ol>{(methodPoints.length ? methodPoints : ["Read the current state.", "Process the current interaction.", "Write the updated state."]).map((point) => <li key={point}>{point}</li>)}</ol></div>
      <SlideCounter current={activeSlide} total={slideCount} />
    </section>;

    if (activeSlide === 4) return <section className="review-slide review-slide-evidence">
      <div className="review-evidence-copy"><h2>Does the evidence support the claim?</h2><div>{(metrics.length ? metrics : experimentPoints.slice(0, 3).map((context) => ({ metric: "Finding", context }))).map(({ metric, context }) => <article key={`${metric}-${context}`}><strong>{metric}</strong><p>{context}</p></article>)}</div></div>
      <PaperSlideVisual url={pdfUrl} page={pages.experiments} label="Main experimental result" crop="detail" />
      <SlideCounter current={activeSlide} total={slideCount} />
    </section>;

    if (activeSlide === 5) return <section className="review-slide review-slide-verdict">
      <div className="review-verdict-mark"><Check size={54} strokeWidth={1.5} /><span>Evidence audit</span></div>
      <div className="review-verdict-copy"><h2>The short verdict</h2><blockquote>{summaryPoints[0] || shorten(summary.response, 220)}</blockquote><p>{shorten(audit, 260)}</p></div>
      <PaperSlideVisual url={pdfUrl} page={pages.experiments} label="Evidence behind the verdict" crop="detail" />
      <SlideCounter current={activeSlide} total={slideCount} />
    </section>;

    return <section className="review-slide review-slide-discussion">
      <div className="review-discussion-copy"><h2>Questions for the room</h2><div>{(limitationPoints.length ? limitationPoints : ["Which claim is most sensitive to the evaluation setup?", "What experiment would change the assessment?", "Where does the method fail first?"]).map((point) => <p key={point}>{point}</p>)}</div></div>
      <PaperSlideVisual url={pdfUrl} page={pages.limitations} label="Limitations and open questions" crop="detail" />
      <SlideCounter current={activeSlide} total={slideCount} />
    </section>;
  }

  return <main className="paper-review-workbench">
    <div className="review-deck-toolbar">
      <div><strong>Paper briefing</strong><span>{summary.status === "complete" ? `${SLIDE_NAMES.length} slides · saved automatically` : stage}</span></div>
      <div>
        {summary.status === "complete" && <button type="button" onClick={() => void deckRef.current?.requestFullscreen()}><Expand size={16} />Present</button>}
        <button type="button" onClick={() => void runReview()} disabled={running || !ready || !workspace}>{running ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}{summary.status === "complete" ? "Review again" : "Run review"}</button>
      </div>
    </div>

    {!ready && <div className="review-deck-notice"><AlertTriangle size={17} /><span>Prepare the local PDF before building the presentation.</span></div>}
    {!workspace && <div className="review-deck-notice"><AlertTriangle size={17} /><span>Choose a workspace so the presentation can be saved.</span></div>}

    <div className="paper-review-deck" ref={deckRef} aria-label="Paper presentation">
      <div className="review-slide-stage" key={`${paper.id}-${summary.status}-${activeSlide}`}>{renderSlide()}</div>
      {summary.status === "complete" && <>
        <button className="review-slide-arrow previous" type="button" aria-label="Previous slide" disabled={activeSlide === 0} onClick={() => setActiveSlide((current) => Math.max(0, current - 1))}><ArrowLeft size={22} /></button>
        <button className="review-slide-arrow next" type="button" aria-label="Next slide" disabled={activeSlide === slideCount - 1} onClick={() => setActiveSlide((current) => Math.min(slideCount - 1, current + 1))}><ArrowRight size={22} /></button>
      </>}
    </div>

    {summary.status === "complete" && <nav className="review-slide-nav" aria-label="Presentation slides">
      {SLIDE_NAMES.map((name, index) => <button type="button" key={name} className={activeSlide === index ? "active" : ""} aria-current={activeSlide === index ? "page" : undefined} onClick={() => setActiveSlide(index)}><span>{name}</span></button>)}
    </nav>}
    <p className="review-deck-hint">Use ← → or Space to present. PDF pages and review findings stay linked to the saved paper.</p>
  </main>;
}
