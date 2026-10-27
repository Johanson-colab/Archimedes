import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Expand, FileStack, LoaderCircle, NotebookText, RefreshCw, Sparkles } from "lucide-react";

type PresentationPaper = Pick<LibraryPaper, "id" | "title" | "authors" | "year" | "venue" | "abstract" | "url" | "pdf_url">;
type LoadState = "loading" | "ready" | "error";
type SourceFocus = NonNullable<PaperPresentationSlide["source"]>["focus"];

const SECTION_LABELS: Record<PaperPresentationSection, string> = {
  background: "Background",
  related_work: "Related work",
  method: "Method",
  experiments: "Experiments",
  limitations: "Limitations",
};

const FOCUS_RECTS: Record<SourceFocus, { x: number; y: number; width: number; height: number }> = {
  full: { x: 0, y: 0, width: 1, height: 1 },
  top: { x: 0, y: 0, width: 1, height: .58 },
  middle: { x: 0, y: .2, width: 1, height: .6 },
  bottom: { x: 0, y: .42, width: 1, height: .58 },
  left: { x: 0, y: 0, width: .58, height: 1 },
  right: { x: .42, y: 0, width: .58, height: 1 },
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

function legacySource(slide: PaperPresentationSlide) {
  const page = slide.source?.page || slide.page || 1;
  return slide.source || { page, label: `PDF p. ${page}`, kind: "page" as const, figure: "", panel: "", focus: "full" as const };
}

function PresentationSourceVisual({ url, source, label, compact = false }: {
  url: string;
  source: NonNullable<PaperPresentationSlide["source"]>;
  label: string;
  compact?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [state, setState] = useState<LoadState>(url ? "loading" : "error");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) }));
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!url || !size.width || !size.height) return;
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<unknown> } | null = null;
    setState("loading");
    void (async () => {
      try {
        const [{ pdfjs }, bytes] = await Promise.all([import("./pdf-runtime"), loadPdfBytes(url)]);
        if (cancelled) return;
        const pdfDocument = await pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
        const pdfPage = await pdfDocument.getPage(Math.min(Math.max(1, source.page), pdfDocument.numPages));
        const base = pdfPage.getViewport({ scale: 1 });
        const crop = source.crop || FOCUS_RECTS[source.focus] || FOCUS_RECTS.full;
        const density = Math.min(2, window.devicePixelRatio || 1);
        const targetWidth = Math.max(1, Math.floor(size.width * density));
        const targetHeight = Math.max(1, Math.floor((size.height - 28) * density));
        const scale = Math.min(2.4, Math.max(targetWidth / (base.width * crop.width), targetHeight / (base.height * crop.height), .35));
        const viewport = pdfPage.getViewport({ scale });
        const sourceCanvas = window.document.createElement("canvas");
        const sourceContext = sourceCanvas.getContext("2d");
        if (!sourceContext) throw new Error("Canvas is unavailable.");
        sourceCanvas.width = Math.max(1, Math.floor(viewport.width));
        sourceCanvas.height = Math.max(1, Math.floor(viewport.height));
        renderTask = pdfPage.render({ canvas: sourceCanvas, canvasContext: sourceContext, viewport });
        await renderTask.promise;
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context || cancelled) return;
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        context.fillStyle = "#fff";
        context.fillRect(0, 0, targetWidth, targetHeight);
        const sx = Math.floor(crop.x * sourceCanvas.width);
        const sy = Math.floor(crop.y * sourceCanvas.height);
        const sw = Math.max(1, Math.floor(crop.width * sourceCanvas.width));
        const sh = Math.max(1, Math.floor(crop.height * sourceCanvas.height));
        const fit = Math.min(targetWidth / sw, targetHeight / sh);
        const drawWidth = sw * fit;
        const drawHeight = sh * fit;
        context.drawImage(sourceCanvas, sx, sy, sw, sh, (targetWidth - drawWidth) / 2, (targetHeight - drawHeight) / 2, drawWidth, drawHeight);
        pdfPage.cleanup();
        pdfDocument.cleanup();
        if (!cancelled) setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [source.crop?.height, source.crop?.width, source.crop?.x, source.crop?.y, source.focus, source.page, size.height, size.width, url]);

  const anchor = [source.figure, source.panel].filter(Boolean).join(" ");
  return <figure className={`paper-presentation-source${compact ? " compact" : ""}`} ref={hostRef}>
    <canvas ref={canvasRef} aria-label={`${label}, PDF page ${source.page}`} />
    {state === "loading" && <span className="paper-presentation-page-state"><LoaderCircle className="spin" size={17} />Rendering evidence</span>}
    {state === "error" && <span className="paper-presentation-page-state"><AlertTriangle size={17} />Source evidence unavailable</span>}
    <figcaption><span>{anchor || source.kind}</span>{source.label || `PDF p. ${source.page}`}</figcaption>
  </figure>;
}

function SlideHeader({ index, slide }: { index: number; slide: PaperPresentationSlide }) {
  return <header className="paper-presentation-slide-header">
    <p>{String(index).padStart(2, "0")} · {SECTION_LABELS[slide.section]}</p>
    <h2>{slide.title}</h2>
  </header>;
}

function BulletList({ bullets }: { bullets: string[] }) {
  if (!bullets.length) return null;
  return <ol className="paper-presentation-bullets">{bullets.map((bullet, index) => <li key={index}><span>{String(index + 1).padStart(2, "0")}</span><p>{bullet}</p></li>)}</ol>;
}

function visualItems(slide: PaperPresentationSlide) {
  const items = slide.visual?.items || [];
  if (items.length) return items;
  return slide.bullets.map((bullet, index) => ({ label: `${index + 1}`, value: "", detail: bullet }));
}

function StructuredVisual({ slide }: { slide: PaperPresentationSlide }) {
  const items = visualItems(slide);
  const kind = slide.visual?.kind || slide.layout || "source";
  if (!items.length || kind === "source") return null;
  return <div className={`paper-presentation-structured ${kind}`}>
    {items.map((item, index) => <div key={`${item.label}-${index}`}>
      <span>{String(index + 1).padStart(2, "0")}</span>
      <section><strong>{item.label}</strong>{item.value && <b>{item.value}</b>}<p>{item.detail}</p></section>
    </div>)}
  </div>;
}

function Takeaway({ slide }: { slide: PaperPresentationSlide }) {
  if (!slide.takeaway) return null;
  const label = slide.section === "experiments" ? "Evidence verdict" : slide.section === "method" ? "Mechanism" : slide.section === "limitations" ? "Evidence boundary" : "Why it matters";
  return <p className="paper-presentation-takeaway"><strong>{label}</strong>{slide.takeaway}</p>;
}

function ContentSlide({ slide, index, pdfUrl }: { slide: PaperPresentationSlide; index: number; pdfUrl: string }) {
  const layout = slide.layout || (slide.section === "method" ? "process" : slide.section === "experiments" ? "figure-led" : slide.section === "limitations" ? "boundaries" : "split");
  const source = legacySource(slide);
  const lead = slide.lead || slide.summary || "";

  if (layout === "figure-led") {
    return <article className="paper-presentation-slide layout-figure-led">
      <SlideHeader index={index} slide={slide} />
      <div className="paper-presentation-figure-led-body">
        <PresentationSourceVisual url={pdfUrl} source={source} label={slide.title} />
        <aside>{lead && <p className="paper-presentation-lead">{lead}</p>}<BulletList bullets={slide.bullets.slice(0, 3)} /></aside>
      </div>
      <Takeaway slide={slide} />
    </article>;
  }

  if (["process", "comparison", "metrics", "boundaries"].includes(layout)) {
    return <article className={`paper-presentation-slide layout-${layout}`}>
      <SlideHeader index={index} slide={slide} />
      {lead && <p className="paper-presentation-lead">{lead}</p>}
      <div className="paper-presentation-structured-body">
        <StructuredVisual slide={slide} />
        <PresentationSourceVisual url={pdfUrl} source={source} label={slide.title} compact />
      </div>
      <Takeaway slide={slide} />
    </article>;
  }

  return <article className="paper-presentation-slide layout-split">
    <SlideHeader index={index} slide={slide} />
    <div className="paper-presentation-split">
      <PresentationSourceVisual url={pdfUrl} source={source} label={slide.title} />
      <div className="paper-presentation-copy">{lead && <p className="paper-presentation-lead">{lead}</p>}<BulletList bullets={slide.bullets} /></div>
    </div>
    <Takeaway slide={slide} />
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
  const [showNotes, setShowNotes] = useState(false);
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
  const active = slides[activeSlide];

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
      const saved = await bridge.runPaperPresentation({ paper, pageCount, workspace, projectId, reasoningEffort: "high", contextLength: "extra-long", contextItems: paperContext });
      setPresentation(saved);
      setActiveSlide(0);
      setShowNotes(false);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : String(generationError));
    } finally {
      setGenerating(false);
    }
  }

  if (restoring) return <section className="paper-presentation-empty"><LoaderCircle className="spin" size={20} /><h2>Restoring presentation</h2><p>The saved deck is kept separately from the evidence review.</p></section>;

  if (!presentation) return <section className="paper-presentation-empty">
    <div className="paper-presentation-empty-mark"><FileStack size={28} strokeWidth={1.45} /></div>
    <p className="paper-review-kicker">Built-in Paper2PPT skill</p>
    <h2>Turn the finished review into an evidence-led lab-meeting deck.</h2>
    <p>Paper2PPT re-reads the paper, maps each claim to its source, and chooses a figure-led layout. The saved text review stays untouched.</p>
    {error && <p className="paper-presentation-error"><AlertTriangle size={15} />{error}</p>}
    <button onClick={() => void generate()} disabled={!reviewReady || generating || !workspace}>
      {generating ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
      {generating ? "Reading paper and designing slides" : reviewReady ? "Generate with Paper2PPT" : "Finish the review first"}
    </button>
  </section>;

  return <section className="paper-presentation-workbench">
    <header className="paper-presentation-toolbar">
      <div><span><Check size={14} />Saved independently · {presentation.source_sufficiency || "review-grounded"}</span>{stale && <em>The text review changed after this deck was generated.</em>}</div>
      <div>
        <button onClick={() => setShowNotes((value) => !value)} className={showNotes ? "active" : ""} disabled={!active}><NotebookText size={15} />Notes</button>
        <button onClick={() => void generate()} disabled={!reviewReady || generating}>{generating ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}{generating ? "Regenerating" : "Regenerate"}</button>
        <button onClick={() => void stageRef.current?.requestFullscreen()}><Expand size={15} />Present</button>
      </div>
    </header>

    {error && <p className="paper-presentation-error"><AlertTriangle size={15} />{error}</p>}

    <div className="paper-presentation-stage" ref={stageRef}>
      <div className="paper-presentation-frame">
        {activeSlide === 0 ? <article className="paper-presentation-slide cover">
          <div className="paper-presentation-cover-copy">
            <p>Paper2PPT · evidence-led presentation</p>
            <h2>{presentation.title || paper.title}</h2>
            <h3>{presentation.subtitle}</h3>
            <dl><div><dt>Authors</dt><dd>{paper.authors.slice(0, 5).join(", ") || "Unknown"}{paper.authors.length > 5 ? " et al." : ""}</dd></div><div><dt>Source</dt><dd>{paper.venue || "Paper"} · {paper.year || "n.d."}</dd></div></dl>
          </div>
          <div className="paper-presentation-cover-object"><PresentationSourceVisual url={pdfUrl} source={{ page: 1, label: "Original paper · PDF p. 1", kind: "page", figure: "", panel: "", focus: "top" }} label={paper.title} compact /><span>Evidence</span><span>Review</span></div>
        </article> : active && <ContentSlide slide={active} index={activeSlide} pdfUrl={pdfUrl} />}
      </div>

      <nav className="paper-presentation-index" aria-label="Presentation slides">
        {slides.map((slide, index) => <button key={slide?.id || index} className={index === activeSlide ? "active" : ""} onClick={() => { setActiveSlide(index); setShowNotes(false); }}><span>{String(index + 1).padStart(2, "0")}</span><b>{index === 0 ? "Cover" : SECTION_LABELS[slide!.section]}</b>{slide && <small>{slide.title}</small>}</button>)}
      </nav>
      <div className="paper-presentation-controls">
        <button onClick={() => setActiveSlide((current) => Math.max(0, current - 1))} disabled={activeSlide === 0} aria-label="Previous slide"><ArrowLeft size={17} /></button>
        <span>{activeSlide + 1} / {slides.length}</span>
        <button onClick={() => setActiveSlide((current) => Math.min(slides.length - 1, current + 1))} disabled={activeSlide === slides.length - 1} aria-label="Next slide"><ArrowRight size={17} /></button>
      </div>
      {showNotes && active && <aside className="paper-presentation-notes"><strong>Speaker notes</strong><p>{active.speaker_notes || "No speaker notes were stored for this legacy slide. Regenerate it with Paper2PPT."}</p></aside>}
    </div>
  </section>;
}
