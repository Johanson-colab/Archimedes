import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Expand, FileStack, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";

type PresentationPaper = Pick<LibraryPaper, "id" | "title" | "authors" | "year" | "venue" | "abstract" | "url" | "pdf_url">;
type LoadState = "loading" | "ready" | "error";

const SECTION_LABELS: Record<PaperPresentationSection, string> = {
  background: "Background",
  related_work: "Related work",
  method: "Method",
  experiments: "Experiments",
  limitations: "Limitations",
};

const pdfByteCache = new Map<string, Promise<ArrayBuffer>>();

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

function PresentationPageVisual({ url, page, label, compact = false }: { url: string; page: number; label: string; compact?: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [state, setState] = useState<LoadState>(url ? "loading" : "error");

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
        const pdfPage = await document.getPage(Math.min(Math.max(1, page), document.numPages));
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

  return <figure className={`paper-presentation-page${compact ? " compact" : ""}`} ref={hostRef}>
    <canvas ref={canvasRef} aria-label={`${label}, PDF page ${page}`} />
    {state === "loading" && <span className="paper-presentation-page-state"><LoaderCircle className="spin" size={17} /> Rendering page {page}</span>}
    {state === "error" && <span className="paper-presentation-page-state"><AlertTriangle size={17} /> Source page unavailable</span>}
    <figcaption>Source figure / table · PDF p. {page}</figcaption>
  </figure>;
}

function SlideHeader({ index, section, title }: { index: number; section: PaperPresentationSection; title: string }) {
  return <header className="paper-presentation-slide-header">
    <p>{String(index).padStart(2, "0")} · {SECTION_LABELS[section]}</p>
    <h2>{title}</h2>
  </header>;
}

function ContentSlide({ slide, index, pdfUrl }: { slide: PaperPresentationSlide; index: number; pdfUrl: string }) {
  if (slide.section === "related_work") {
    return <article className="paper-presentation-slide related-work">
      <SlideHeader index={index} section={slide.section} title={slide.title} />
      <p className="paper-presentation-summary">{slide.summary}</p>
      <div className="paper-presentation-related-grid">
        <div className="paper-presentation-comparison">
          {slide.bullets.map((bullet, bulletIndex) => <div key={bulletIndex}><b>{String(bulletIndex + 1).padStart(2, "0")}</b><p>{bullet}</p></div>)}
        </div>
        <PresentationPageVisual url={pdfUrl} page={slide.page} label={slide.title} compact />
      </div>
      <p className="paper-presentation-takeaway"><strong>Positioning</strong>{slide.takeaway}</p>
    </article>;
  }

  if (slide.section === "limitations") {
    return <article className="paper-presentation-slide limitations">
      <SlideHeader index={index} section={slide.section} title={slide.title} />
      <div className="paper-presentation-limit-grid">
        <div><p className="paper-presentation-summary">{slide.summary}</p>{slide.bullets.map((bullet, bulletIndex) => <div className="paper-presentation-limit" key={bulletIndex}><b>{String.fromCharCode(65 + bulletIndex)}</b><p>{bullet}</p></div>)}</div>
        <PresentationPageVisual url={pdfUrl} page={slide.page} label={slide.title} compact />
      </div>
      <p className="paper-presentation-takeaway"><strong>What remains open</strong>{slide.takeaway}</p>
    </article>;
  }

  return <article className={`paper-presentation-slide ${slide.section}`}>
    <SlideHeader index={index} section={slide.section} title={slide.title} />
    <div className="paper-presentation-split">
      <PresentationPageVisual url={pdfUrl} page={slide.page} label={slide.title} />
      <div className="paper-presentation-copy">
        <p className="paper-presentation-summary">{slide.summary}</p>
        <ol>{slide.bullets.map((bullet, bulletIndex) => <li key={bulletIndex}><span>{String(bulletIndex + 1).padStart(2, "0")}</span><p>{bullet}</p></li>)}</ol>
      </div>
    </div>
    <p className="paper-presentation-takeaway"><strong>{slide.section === "experiments" ? "Evidence verdict" : slide.section === "method" ? "Mechanism" : "Why it matters"}</strong>{slide.takeaway}</p>
  </article>;
}

export default function PaperPresentationDeck({ bridge, workspace, projectId, paper, pageCount, pdfUrl, reviewReady, reviewUpdatedAt }: {
  bridge: ResearchDeskBridge;
  workspace: string;
  projectId?: string | null;
  paper: PresentationPaper;
  pageCount: number;
  pdfUrl: string;
  reviewReady: boolean;
  reviewUpdatedAt: string;
}) {
  const [presentation, setPresentation] = useState<StoredPaperPresentation | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [activeSlide, setActiveSlide] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);

  const paperContext = useMemo<ContextAttachment[]>(() => [{
    id: `paper:${paper.id}`,
    type: "paper",
    name: paper.title,
    detail: `${paper.year ?? "n.d."} · ${paper.venue || "Paper"}`,
    paper: { title: paper.title, authors: paper.authors, year: paper.year, abstract: paper.abstract, url: paper.url, pdfUrl: paper.pdf_url },
  }], [paper]);

  useEffect(() => {
    let mounted = true;
    setRestoring(true);
    setError("");
    void bridge.getPaperPresentation(paper.id, workspace).then((saved) => {
      if (!mounted) return;
      setPresentation(saved);
      setActiveSlide(0);
    }).catch((restoreError) => {
      if (mounted) setError(restoreError instanceof Error ? restoreError.message : String(restoreError));
    }).finally(() => {
      if (mounted) setRestoring(false);
    });
    return () => { mounted = false; };
  }, [bridge, paper.id, workspace]);

  const slides = presentation ? [null, ...presentation.slides] : [];
  const stale = Boolean(presentation && reviewUpdatedAt && presentation.source_review_updated_at !== reviewUpdatedAt);

  useEffect(() => {
    function navigate(event: KeyboardEvent) {
      if (!slides.length || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") {
        event.preventDefault();
        setActiveSlide((current) => Math.min(slides.length - 1, current + 1));
      }
      if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        setActiveSlide((current) => Math.max(0, current - 1));
      }
      if (event.key === "Home") setActiveSlide(0);
      if (event.key === "End") setActiveSlide(slides.length - 1);
    }
    window.addEventListener("keydown", navigate);
    return () => window.removeEventListener("keydown", navigate);
  }, [slides.length]);

  async function generate() {
    if (!reviewReady || generating || !workspace) return;
    setGenerating(true);
    setError("");
    try {
      const saved = await bridge.runPaperPresentation({
        paper,
        pageCount,
        workspace,
        projectId,
        reasoningEffort: "high",
        contextLength: "extra-long",
        contextItems: paperContext,
      });
      setPresentation(saved);
      setActiveSlide(0);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : String(generationError));
    } finally {
      setGenerating(false);
    }
  }

  if (restoring) return <section className="paper-presentation-empty"><LoaderCircle className="spin" size={20} /><h2>Restoring presentation</h2><p>The saved deck is kept separately from the evidence review.</p></section>;

  if (!presentation) return <section className="paper-presentation-empty">
    <div className="paper-presentation-empty-mark"><FileStack size={28} strokeWidth={1.45} /></div>
    <p className="paper-review-kicker">Built-in presentation skill</p>
    <h2>Turn the finished review into a lab-meeting deck.</h2>
    <p>The saved text review stays untouched. A separate skill condenses it into a six-slide narrative: Background, Related work, Method, Experiments, and Limitations.</p>
    {error && <p className="paper-presentation-error"><AlertTriangle size={15} />{error}</p>}
    <button onClick={() => void generate()} disabled={!reviewReady || generating || !workspace}>
      {generating ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
      {generating ? "Generating presentation" : reviewReady ? "Generate presentation" : "Finish the review first"}
    </button>
  </section>;

  const active = slides[activeSlide];
  return <section className="paper-presentation-workbench">
    <header className="paper-presentation-toolbar">
      <div><span><Check size={14} /> Saved independently</span>{stale && <em>The text review changed after this deck was generated.</em>}</div>
      <div>
        <button onClick={() => void generate()} disabled={!reviewReady || generating}>{generating ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}{generating ? "Regenerating" : "Regenerate"}</button>
        <button onClick={() => void stageRef.current?.requestFullscreen()}><Expand size={15} /> Present</button>
      </div>
    </header>

    {error && <p className="paper-presentation-error"><AlertTriangle size={15} />{error}</p>}

    <div className="paper-presentation-stage" ref={stageRef}>
      <div className="paper-presentation-frame">
        {activeSlide === 0 ? <article className="paper-presentation-slide cover">
          <div className="paper-presentation-cover-copy">
            <p>Paper presentation · generated from saved review</p>
            <h2>{presentation.title || paper.title}</h2>
            <h3>{presentation.subtitle}</h3>
            <dl><div><dt>Authors</dt><dd>{paper.authors.slice(0, 5).join(", ") || "Unknown"}{paper.authors.length > 5 ? " et al." : ""}</dd></div><div><dt>Source</dt><dd>{paper.venue || "Paper"} · {paper.year || "n.d."}</dd></div></dl>
          </div>
          <div className="paper-presentation-cover-object"><PresentationPageVisual url={pdfUrl} page={1} label={paper.title} compact /><span>Review</span><span>Paper</span></div>
        </article> : active && <ContentSlide slide={active} index={activeSlide} pdfUrl={pdfUrl} />}
      </div>

      <nav className="paper-presentation-index" aria-label="Presentation slides">
        {slides.map((slide, index) => <button key={index} className={index === activeSlide ? "active" : ""} onClick={() => setActiveSlide(index)}><span>{String(index + 1).padStart(2, "0")}</span>{index === 0 ? "Cover" : SECTION_LABELS[slide!.section]}</button>)}
      </nav>
      <div className="paper-presentation-controls">
        <button onClick={() => setActiveSlide((current) => Math.max(0, current - 1))} disabled={activeSlide === 0} aria-label="Previous slide"><ArrowLeft size={17} /></button>
        <span>{activeSlide + 1} / {slides.length}</span>
        <button onClick={() => setActiveSlide((current) => Math.min(slides.length - 1, current + 1))} disabled={activeSlide === slides.length - 1} aria-label="Next slide"><ArrowRight size={17} /></button>
      </div>
    </div>
  </section>;
}
