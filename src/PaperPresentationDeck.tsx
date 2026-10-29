import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Expand, FolderOpen, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import { useUISettings, type Language } from "./i18n";

type PresentationPaper = Pick<LibraryPaper, "id" | "title" | "authors" | "year" | "venue" | "abstract" | "url" | "pdf_url">;
type LoadState = "loading" | "ready" | "error";
type SourceFocus = NonNullable<PaperPresentationSlide["source"]>["focus"];
type LivePresentation = Pick<PaperPresentation, "title" | "subtitle" | "source_sufficiency" | "generation_mode" | "slides"> & {
  previewUrls: string[];
  total: number;
};

const SECTION_LABELS: Record<PaperPresentationSection, string> = {
  background: "Background",
  related_work: "Related work",
  method: "Method",
  experiments: "Experiments",
  limitations: "Limitations",
};

const PAPER_PRESENTATION_VERSION = 4;
const PAPER_PRESENTATION_MIN_CONTENT_SLIDES = 14;

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

type PresentationSource = NonNullable<PaperPresentationSlide["source"]>;

/**
 * The model is asked for a page/section label, but it often repeats the
 * figure/table and writes “全图” or a multi-page citation. Build the visible
 * caption from structured fields so the same source is not printed twice.
 */
function sourceReference(source: PresentationSource, includeLabelRange = true) {
  const raw = String(source.label || "").replace(/\s+/g, " ").trim();
  const section = raw.match(/§\s*[^·;|]+/)?.[0]?.trim() || "";
  const pages = [...raw.matchAll(/(?:PDF\s*)?pp?\.\s*(\d+)(?:\s*[–-]\s*(\d+))?/gi)];
  let first = Math.max(1, Number(source.page) || 1);
  let last = first;
  if (includeLabelRange && pages.length) {
    first = Math.max(1, Number(pages[0][1]) || first);
    const finalPage = pages.at(-1)!;
    last = Math.max(first, Number(finalPage[2] || finalPage[1]) || first);
  }
  const pageLabel = last > first ? `PDF pp. ${first}–${last}` : `PDF p. ${first}`;
  return [pageLabel, section].filter(Boolean).join(" · ");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tightenToInk(canvas: HTMLCanvasElement, crop: { x: number; y: number; width: number; height: number }) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  const sx = Math.max(0, Math.floor(crop.x * canvas.width));
  const sy = Math.max(0, Math.floor(crop.y * canvas.height));
  const sw = Math.max(1, Math.min(canvas.width - sx, Math.floor(crop.width * canvas.width)));
  const sh = Math.max(1, Math.min(canvas.height - sy, Math.floor(crop.height * canvas.height)));
  const pixels = context.getImageData(sx, sy, sw, sh).data;
  const stride = Math.max(1, Math.floor(Math.min(sw, sh) / 720));
  let left = sw;
  let top = sh;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < sh; y += stride) {
    for (let x = 0; x < sw; x += stride) {
      const offset = (y * sw + x) * 4;
      if (pixels[offset + 3] < 24) continue;
      if (pixels[offset] > 246 && pixels[offset + 1] > 246 && pixels[offset + 2] > 246) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) return null;
  const inkWidth = right - left + 1;
  const inkHeight = bottom - top + 1;
  if (inkWidth < sw * .08 || inkHeight < sh * .08) return null;
  const padX = Math.max(10, Math.round(inkWidth * .035));
  const padY = Math.max(10, Math.round(inkHeight * .045));
  left = Math.max(0, left - padX);
  top = Math.max(0, top - padY);
  right = Math.min(sw - 1, right + padX);
  bottom = Math.min(sh - 1, bottom + padY);
  return { sx: sx + left, sy: sy + top, sw: right - left + 1, sh: bottom - top + 1 };
}

function PresentationSourceVisual({ url, source, label, compact = false }: {
  url: string;
  source: PresentationSource;
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
        let crop = source.crop || FOCUS_RECTS[source.focus] || FOCUS_RECTS.full;
        if (!source.crop && (source.kind === "figure" || source.kind === "table") && source.figure) {
          const number = source.figure.match(/\d+(?:\.\d+)?/)?.[0];
          if (number) {
            const prefix = source.kind === "table" ? "table" : "(?:figure|fig\\.)";
            const captionPattern = new RegExp(`^${prefix}\\s*${escapeRegExp(number)}\\b`, "i");
            const text = await pdfPage.getTextContent();
            const caption = text.items.find((item) => {
              const candidate = item as { str?: string };
              return captionPattern.test(String(candidate.str || "").trim());
            }) as { transform?: number[]; height?: number } | undefined;
            const baseline = Number(caption?.transform?.[5]);
            const captionHeight = Number(caption?.height || caption?.transform?.[3]);
            if (Number.isFinite(baseline) && Number.isFinite(captionHeight)) {
              const captionTop = Math.max(0, Math.min(1, 1 - ((baseline + captionHeight) / base.height)));
              const cropTop = source.kind === "table" ? Math.max(.015, captionTop - .025) : Math.max(.015, captionTop - .5);
              crop = source.kind === "table"
                ? { x: .055, y: cropTop, width: .89, height: Math.min(.58, .975 - cropTop) }
                : { x: .055, y: cropTop, width: .89, height: Math.min(.54, captionTop + .045 - cropTop) };
            }
          }
        }
        const density = Math.min(2, window.devicePixelRatio || 1);
        const targetWidth = Math.max(1, Math.floor(size.width * density));
        const targetHeight = Math.max(1, Math.floor(size.height * density));
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
        context.clearRect(0, 0, targetWidth, targetHeight);
        const tightened = tightenToInk(sourceCanvas, crop);
        const sx = tightened?.sx ?? Math.floor(crop.x * sourceCanvas.width);
        const sy = tightened?.sy ?? Math.floor(crop.y * sourceCanvas.height);
        const sw = tightened?.sw ?? Math.max(1, Math.floor(crop.width * sourceCanvas.width));
        const sh = tightened?.sh ?? Math.max(1, Math.floor(crop.height * sourceCanvas.height));
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
  }, [source.crop?.height, source.crop?.width, source.crop?.x, source.crop?.y, source.figure, source.focus, source.kind, source.page, size.height, size.width, url]);

  return <figure className={`paper-presentation-source${compact ? " compact" : ""}`} ref={hostRef}>
    <canvas ref={canvasRef} aria-label={`${label}, PDF page ${source.page}`} />
    {state === "loading" && <span className="paper-presentation-page-state"><LoaderCircle className="spin" size={17} />Rendering evidence</span>}
    {state === "error" && <span className="paper-presentation-page-state"><AlertTriangle size={17} />Source evidence unavailable</span>}
  </figure>;
}

function RenderedPresentationPage({ url, pageNumber }: { url: string; pageNumber: number }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [state, setState] = useState<LoadState>("loading");

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
        const document = await pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
        const page = await document.getPage(Math.min(Math.max(1, pageNumber), document.numPages));
        const base = page.getViewport({ scale: 1 });
        const density = Math.min(2, window.devicePixelRatio || 1);
        const scale = Math.max(.2, Math.min(size.width / base.width, size.height / base.height) * density);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context || cancelled) return;
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        renderTask = page.render({ canvas, canvasContext: context, viewport });
        await renderTask.promise;
        if (!cancelled) setState("ready");
        page.cleanup();
        await document.destroy();
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => { cancelled = true; renderTask?.cancel(); };
  }, [url, pageNumber, size.width, size.height]);

  return <div className="paper-presentation-rendered-page" ref={hostRef}>
    <canvas ref={canvasRef} aria-label={`Rendered presentation slide ${pageNumber}`} />
    {state === "loading" && <span className="paper-presentation-page-state"><LoaderCircle className="spin" size={17} />Rendering slide</span>}
    {state === "error" && <span className="paper-presentation-page-state"><AlertTriangle size={17} />Rendered slide unavailable</span>}
  </div>;
}

function SlideHeader({ index, slide, sourceNote = "" }: { index: number; slide: PaperPresentationSlide; sourceNote?: string }) {
  return <header className="paper-presentation-slide-header">
    <p><span>{String(index).padStart(2, "0")} · {SECTION_LABELS[slide.section]}</span>{sourceNote && <em>{sourceNote}</em>}</p>
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
  const columns = kind === "outline" ? 1 : kind === "process"
    ? Math.min(4, Math.max(1, items.length))
    : items.length <= 3 ? Math.max(1, items.length) : items.length === 4 ? 2 : 3;
  const style = { [kind === "process" ? "--process-columns" : "--structured-columns"]: columns } as CSSProperties;
  return <div className={`paper-presentation-structured ${kind}`} style={style}>
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

  if (layout === "outline") {
    return <article className="paper-presentation-slide layout-outline">
      <SlideHeader index={index} slide={slide} />
      <div className="paper-presentation-outline-body">
        <StructuredVisual slide={slide} />
        <aside><span>Core thread</span><p>{lead || slide.takeaway}</p></aside>
      </div>
    </article>;
  }

  if (layout === "editorial") {
    return <article className="paper-presentation-slide layout-editorial">
      <SlideHeader index={index} slide={slide} />
      {lead && <p className="paper-presentation-lead">{lead}</p>}
      <div className="paper-presentation-editorial-body">
        <StructuredVisual slide={slide} />
        <BulletList bullets={slide.bullets} />
      </div>
      <Takeaway slide={slide} />
    </article>;
  }

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
    // A full, uncropped page is not evidence at thumbnail scale. It also steals
    // width from the structured argument, so only show a visual when the model
    // supplied an inspected crop.
    const showSource = Boolean(source.crop);
    return <article className={`paper-presentation-slide layout-${layout}`}>
      <SlideHeader index={index} slide={slide} sourceNote={showSource ? "" : sourceReference(source)} />
      {lead && <p className="paper-presentation-lead">{lead}</p>}
      <div className={`paper-presentation-structured-body${showSource ? "" : " no-source"}`}>
        <StructuredVisual slide={slide} />
        {showSource && <PresentationSourceVisual url={pdfUrl} source={source} label={slide.title} compact />}
      </div>
      <Takeaway slide={slide} />
    </article>;
  }

  const showSplitSource = Boolean(source.crop) || source.kind === "figure" || source.kind === "table";
  return <article className="paper-presentation-slide layout-split">
    <SlideHeader index={index} slide={slide} sourceNote={showSplitSource ? "" : sourceReference(source)} />
    <div className={`paper-presentation-split${showSplitSource ? "" : " no-source"}`}>
      {showSplitSource && <PresentationSourceVisual url={pdfUrl} source={source} label={slide.title} />}
      <div className="paper-presentation-copy">{lead && <p className="paper-presentation-lead">{lead}</p>}<BulletList bullets={slide.bullets} /></div>
    </div>
    <Takeaway slide={slide} />
  </article>;
}

const EMPTY_PRESENTATION_COPY = {
  en: {
    kicker: "Academic presentation",
    generatingTitle: "Building a deck you can inspect live",
    legacyTitle: "Create a new presentation for this paper review",
    readyTitle: "Turn this paper review into a presentation you can deliver",
    directTitle: "Create a presentation directly from the original paper",
    generatingDescription: "Each page appears here as soon as it is rendered, so you can review the deck while it is being built.",
    readyDescription: "The saved review becomes a concise academic presentation, with a live preview for every completed page.",
    directDescription: "No saved review is required. The planner reads the original PDF, maps its evidence, and builds the same editable deck with live previews.",
    question: "Research question",
    questionTitle: "Why does long history slow inference?",
    questionCaption: "Problem framing · evidence mapping",
    method: "Method",
    methodTitle: "Compress history into an evolving state",
    methodCaption: "Mechanism diagram · one claim per slide",
    input: "Input",
    state: "State",
    output: "Output",
    evidence: "Evidence",
    evidenceTitle: "More efficient — but fidelity remains to be tested",
    evidenceCaption: "Results chart · conclusion and boundary",
    mapClaims: "Map claims",
    generatePages: "Generate slides",
    saveDeck: "Save deck",
    generatingButton: "Building slides",
    reviewButton: "Use saved text review",
    paperButton: "Read original paper",
  },
  zh: {
    kicker: "学术演示稿",
    generatingTitle: "正在搭建可实时查看的演示稿",
    legacyTitle: "为这份论文复盘生成新版演示稿",
    readyTitle: "把论文复盘组织成一份可讲清的演示稿",
    directTitle: "直接从原论文生成一份可讲述的演示稿",
    generatingDescription: "每一页完成渲染后会立即显示在这里；你可以边生成边翻阅。",
    readyDescription: "系统会将已保存的 Review 转换为一套可讲述的学术演示稿，并逐页提供实时预览。",
    directDescription: "无需先完成 Review。系统会读取原论文 PDF、定位证据，并以同一套可编辑演示稿链路逐页生成预览。",
    question: "研究问题",
    questionTitle: "为什么长历史会拖慢推理？",
    questionCaption: "问题定义 · 证据定位",
    method: "方法",
    methodTitle: "把历史压缩成持续更新的状态",
    methodCaption: "机制图 · 一页一个论点",
    input: "输入",
    state: "状态",
    output: "输出",
    evidence: "证据",
    evidenceTitle: "效率提高，但保真度仍需检验",
    evidenceCaption: "实验图表 · 结论与边界",
    mapClaims: "梳理论点",
    generatePages: "逐页生成",
    saveDeck: "保存演示稿",
    generatingButton: "正在生成页面",
    reviewButton: "使用已保存的 Review",
    paperButton: "直接读取原论文",
  },
} as const;

function PresentationExamples({ copy }: { copy: typeof EMPTY_PRESENTATION_COPY[Language] }) {
  return <section className="paper-presentation-showcase" aria-label="Academic presentation examples">
    <article className="paper-presentation-example example-question">
      <p>{copy.question}</p>
      <h3>{copy.questionTitle}</h3>
      <div className="example-question-plot"><i /><i /><i /><b /></div>
      <small>{copy.questionCaption}</small>
    </article>
    <article className="paper-presentation-example example-method">
      <p>{copy.method}</p>
      <h3>{copy.methodTitle}</h3>
      <div className="example-method-flow"><span>{copy.input}</span><i /><span>{copy.state}</span><i /><span>{copy.output}</span></div>
      <small>{copy.methodCaption}</small>
    </article>
    <article className="paper-presentation-example example-evidence">
      <p>{copy.evidence}</p>
      <h3>{copy.evidenceTitle}</h3>
      <div className="example-evidence-chart"><i /><i /><i /><i /></div>
      <small>{copy.evidenceCaption}</small>
    </article>
  </section>;
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
  const { language } = useUISettings();
  const emptyCopy = EMPTY_PRESENTATION_COPY[language];
  const [presentation, setPresentation] = useState<StoredPaperPresentation | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [activeSlide, setActiveSlide] = useState(0);
  const [livePresentation, setLivePresentation] = useState<LivePresentation | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const runIdRef = useRef("");

  useEffect(() => bridge.onPaperPresentationEvent((event) => {
    if (event.paperId !== paper.id || event.clientRunId !== runIdRef.current) return;
    setProgress(event.detail);
    if (event.kind !== "page-ready" || !event.page || !event.presentation) return;
    setLivePresentation((current) => {
      const previewUrls = Array.from({ length: event.page!.total }, (_, index) =>
        index === event.page!.index ? event.page!.preview_url : current?.previewUrls[index] || "");
      return { ...event.presentation!, previewUrls, total: event.page!.total };
    });
    setActiveSlide((current) => current === 0 || current === event.page!.index - 1 ? event.page!.index : current);
  }), [bridge, paper.id]);

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
      setLivePresentation(null);
      setActiveSlide(0);
    }).catch((restoreError) => {
      if (mounted) setError(restoreError instanceof Error ? restoreError.message : String(restoreError));
    }).finally(() => {
      if (mounted) setRestoring(false);
    });
    return () => { mounted = false; };
  }, [bridge, paper.id, workspace]);

  const stale = Boolean(presentation && presentation.generation_mode !== "paper" && reviewUpdatedAt && presentation.source_review_updated_at !== reviewUpdatedAt);
  const legacyPresentation = Boolean(presentation && (
    presentation.skill?.id !== "paper-presentation" ||
    Number(presentation.skill?.version || 1) < PAPER_PRESENTATION_VERSION ||
    presentation.slides.length < PAPER_PRESENTATION_MIN_CONTENT_SLIDES ||
    presentation.artifact?.kind !== "pptx" || presentation.artifact.missing || !presentation.artifact.preview_url
  ));
  const activePresentation = livePresentation || (legacyPresentation ? null : presentation);
  const slides = activePresentation ? [null, ...activePresentation.slides] : [];
  const active = slides[activeSlide];
  const storedPreviewUrl = livePresentation ? "" : presentation?.artifact?.preview_url || "";

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

  async function generate(sourceMode: "review" | "paper") {
    if ((sourceMode === "review" && !reviewReady) || generating || !workspace) return;
    setGenerating(true);
    setError("");
    setLivePresentation(null);
    setProgress(sourceMode === "paper" ? "Reading the original paper…" : "Reading the saved review and paper…");
    runIdRef.current = crypto.randomUUID();
    try {
      const saved = await bridge.runPaperPresentation({ paper, pageCount, workspace, projectId, reasoningEffort: "high", contextLength: "extra-long", contextItems: paperContext, language, sourceMode, clientRunId: runIdRef.current });
      if (saved.skill?.id !== "paper-presentation" || Number(saved.skill?.version || 1) < PAPER_PRESENTATION_VERSION ||
          saved.slides.length < PAPER_PRESENTATION_MIN_CONTENT_SLIDES || saved.artifact?.kind !== "pptx" || !saved.artifact.preview_url) {
        throw new Error("The presentation backend did not return a complete rendered PowerPoint deck.");
      }
      setPresentation(saved);
      setLivePresentation(null);
      setActiveSlide(0);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : String(generationError));
    } finally {
      setGenerating(false);
      setProgress("");
      runIdRef.current = "";
    }
  }

  async function reveal() {
    try { await bridge.revealPaperPresentation(paper.id, workspace); }
    catch (revealError) { setError(revealError instanceof Error ? revealError.message : String(revealError)); }
  }

  if (restoring) return <section className="paper-presentation-empty"><LoaderCircle className="spin" size={20} /><h2>Restoring presentation</h2><p>The saved deck is kept separately from the evidence review.</p></section>;

  if (!activePresentation) return <section className="paper-presentation-empty">
    <div className="paper-presentation-empty-main">
      <div>
        <p className="paper-review-kicker">{emptyCopy.kicker}</p>
        <h2>{generating ? emptyCopy.generatingTitle : legacyPresentation ? emptyCopy.legacyTitle : reviewReady ? emptyCopy.readyTitle : emptyCopy.directTitle}</h2>
        {!legacyPresentation && <p>{generating ? emptyCopy.generatingDescription : reviewReady ? emptyCopy.readyDescription : emptyCopy.directDescription}</p>}
      </div>
    </div>
    <PresentationExamples copy={emptyCopy} />
    <div className="paper-presentation-empty-flow" aria-label="Presentation generation stages"><span className={generating ? "active" : ""}>{emptyCopy.mapClaims}</span><span className={generating ? "active" : ""}>{emptyCopy.generatePages}</span><span>{emptyCopy.saveDeck}</span></div>
    {generating && <p className="paper-presentation-progress" role="status"><LoaderCircle className="spin" size={15} />{progress}</p>}
    {error && <p className="paper-presentation-error"><AlertTriangle size={15} />{error}</p>}
    <div className="paper-presentation-entry-actions">
      {reviewReady && <button onClick={() => void generate("review")} disabled={generating || !workspace}>
        {generating ? <LoaderCircle className="spin" size={16} /> : legacyPresentation ? <RefreshCw size={16} /> : <Sparkles size={16} />}
        {generating ? emptyCopy.generatingButton : emptyCopy.reviewButton}
      </button>}
      <button className={reviewReady ? "secondary" : ""} onClick={() => void generate("paper")} disabled={generating || !workspace}>
        {generating ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
        {generating ? emptyCopy.generatingButton : emptyCopy.paperButton}
      </button>
    </div>
  </section>;

  return <section className="paper-presentation-workbench">
    <header className="paper-presentation-toolbar">
      <div><span>{livePresentation ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />}{livePresentation ? `${livePresentation.previewUrls.filter(Boolean).length} / ${livePresentation.total} pages ready to view` : `Editable PowerPoint · ${activePresentation.source_sufficiency || "review-grounded"}`}</span>{stale && !livePresentation && <em>The text review changed after this deck was generated.</em>}</div>
      <div>
        <button onClick={() => void reveal()} disabled={Boolean(livePresentation)}><FolderOpen size={15} />Open PPTX</button>
        <button onClick={() => void generate(activePresentation.generation_mode === "paper" || !reviewReady ? "paper" : "review")} disabled={generating}>{generating ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}{generating ? "Regenerating" : "Regenerate"}</button>
        <button onClick={() => void stageRef.current?.requestFullscreen()} disabled={Boolean(livePresentation)}><Expand size={15} />Present</button>
      </div>
    </header>

    {error && <p className="paper-presentation-error"><AlertTriangle size={15} />{error}</p>}
    {generating && <p className="paper-presentation-progress" role="status">{progress}</p>}

    <div className="paper-presentation-stage" ref={stageRef}>
      <div className="paper-presentation-frame">
        {livePresentation?.previewUrls[activeSlide] ? <RenderedPresentationPage url={livePresentation.previewUrls[activeSlide]} pageNumber={1} /> : storedPreviewUrl ? <RenderedPresentationPage url={storedPreviewUrl} pageNumber={activeSlide + 1} /> : <article className="paper-presentation-live-placeholder">
          <LoaderCircle className="spin" size={24} />
          <strong>{activeSlide === 0 ? "Cover" : active?.title || "Preparing this slide"}</strong>
          <p>{livePresentation ? "This page will appear here immediately after it is rendered." : "The saved presentation has no renderable preview."}</p>
        </article>}
        {!livePresentation && !storedPreviewUrl && activeSlide === 0 ? <article className="paper-presentation-slide cover">
          <div className="paper-presentation-cover-rail"><b>组会</b><span>论文分享</span><small>Research presentation</small></div>
          <div className="paper-presentation-cover-copy">
            <p>Academic paper presentation</p>
            <h2>{activePresentation.title || paper.title}</h2>
            <h3>{activePresentation.subtitle}</h3>
            <dl><div><dt>Authors</dt><dd>{paper.authors.slice(0, 5).join(", ") || "Unknown"}{paper.authors.length > 5 ? " et al." : ""}</dd></div><div><dt>Source</dt><dd>{paper.venue || "Paper"} · {paper.year || "n.d."}</dd></div></dl>
          </div>
          <div className="paper-presentation-cover-object"><PresentationSourceVisual url={pdfUrl} source={{ page: 1, label: "Original paper · PDF p. 1", kind: "page", figure: "", panel: "", focus: "top" }} label={paper.title} compact /></div>
        </article> : !livePresentation && !storedPreviewUrl && active && <ContentSlide slide={active} index={activeSlide} pdfUrl={pdfUrl} />}
      </div>

      <nav className="paper-presentation-index" aria-label="Presentation slides">
        {slides.map((slide, index) => <button key={slide?.id || index} className={`${index === activeSlide ? "active" : ""}${livePresentation && !livePresentation.previewUrls[index] ? " queued" : ""}`} onClick={() => setActiveSlide(index)}><span>{String(index + 1).padStart(2, "0")}</span><b>{index === 0 ? "Cover" : SECTION_LABELS[slide!.section]}</b>{slide && <small>{livePresentation && !livePresentation.previewUrls[index] ? "Rendering…" : slide.title}</small>}</button>)}
      </nav>
      <div className="paper-presentation-controls">
        <button onClick={() => setActiveSlide((current) => Math.max(0, current - 1))} disabled={activeSlide === 0} aria-label="Previous slide"><ArrowLeft size={17} /></button>
        <span>{activeSlide + 1} / {slides.length}</span>
        <button onClick={() => setActiveSlide((current) => Math.min(slides.length - 1, current + 1))} disabled={activeSlide === slides.length - 1} aria-label="Next slide"><ArrowRight size={17} /></button>
      </div>
    </div>
  </section>;
}
