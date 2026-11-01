import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronDown, ExternalLink, GraduationCap, ImageOff, LoaderCircle, Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { MenuSurface } from "./Menu";
import DataChartGallery from "./DataChartGallery";
import { Tabs, Tab } from "./Tabs";

import { Dialog } from "./Dialog";
import { InlineNotice } from "./InlineNotice";
import { StateView } from "./StateView";
import { useUISettings } from "./i18n";
import { loadRetrievalIndex, prepareSemanticQuery, searchRetrievalIndex, type RetrievalIndex } from "./figureforge/retrieval.mjs";
import { sanitizeFigureSvg } from "./figureforge/sanitize-svg.mjs";
import type { FigureScene } from "./figureforge/reconstruction.mjs";
import { parseSvgScene } from "./figureforge/vendor/svg-scene.mjs";
import { sceneToSvgString } from "./figureforge/vendor/reconstruction-renderer.mjs";
import { reconstructWithTopConf } from "./figureforge/reconstruction-workflow.mjs";
import { exportFigureScene } from "./figureforge/export";
import { selectRelevantPdfPages } from "./figureforge/pdf-sections.mjs";
import { verifyImageRatio, verifyImageResolution } from "./figureforge/vendor/aspect-ratio.mjs";
const GALLERY_ROOT = "https://qwdwqfwq.github.io/topconf-paper-figure-gallery/";
const CATALOG_URL = `${GALLERY_ROOT}data/figures.json`;
const PAGE_SIZE = 48;
const VENUES = ["ICLR", "ICML", "NeurIPS", "CVPR", "ACL", "AAAI"] as const;
const YEARS = [2026, 2025, 2024, 2023] as const;
const PATTERNS = [
  ["conceptual", "Concept"], ["framework", "Framework"], ["pipeline", "Pipeline"],
  ["architecture", "Architecture"], ["teaser", "Teaser"], ["taxonomy", "Taxonomy"],
  ["results", "Results"], ["comparison", "Comparison"],
] as const;
const ASPECTS = ["1:1", "3:2", "4:3", "16:9"] as const;
type Aspect = typeof ASPECTS[number];

type Figure = {
  id: string;
  venue: string;
  year: number;
  title: string;
  authors: string[];
  pattern: string;
  image: string;
  paper: string;
  tier?: "oral" | "spotlight";
  award?: string;
  source?: "official-proceedings";
  w?: number;
  h?: number;
};
type Filters = { venue: string; year: number | "all"; tier: string; pattern: string };
const INITIAL_FILTERS: Filters = { venue: "all", year: "all", tier: "all", pattern: "all" };
let catalogPromise: Promise<Figure[]> | null = null;

function isFigure(value: unknown): value is Figure {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && typeof row.title === "string" && typeof row.venue === "string"
    && typeof row.year === "number" && Array.isArray(row.authors) && typeof row.paper === "string"
    && typeof row.pattern === "string" && typeof row.image === "string"
    && /^images\/(?:iclr|icml|neurips|cvpr|acl|aaai)\/final\/[a-zA-Z0-9_.-]+\.jpg$/.test(row.image);
}

function loadCatalog(refresh = false) {
  if (refresh) catalogPromise = null;
  if (!catalogPromise) {
    catalogPromise = fetch(CATALOG_URL).then(async (response) => {
      if (!response.ok) throw new Error(`Gallery catalog returned HTTP ${response.status}.`);
      const payload: unknown = await response.json();
      if (!Array.isArray(payload)) throw new Error("The gallery catalog format has changed.");
      const figures = payload.filter(isFigure);
      if (!figures.length) throw new Error("No valid figures were found in the gallery catalog.");
      return figures;
    }).catch((error: unknown) => {
      catalogPromise = null;
      throw error;
    });
  }
  return catalogPromise;
}

function imageUrl(figure: Figure) {
  if (figure.image.startsWith("images/")) return `${GALLERY_ROOT}${figure.image}`;
  if (/^https?:/.test(figure.image) || figure.image.startsWith("data:")) return figure.image;
  return new URL(figure.image, document.baseURI).href;
}
function paperUrl(figure: Figure) {
  try { const url = new URL(figure.paper); return url.protocol === "https:" ? url.href : ""; }
  catch { return ""; }
}
function tierName(figure: Figure) {
  if (figure.award) return figure.award === "best" ? "Best paper" : "Award";
  if (figure.tier === "oral") return "Oral";
  if (figure.tier === "spotlight") return "Spotlight";
  return "";
}
function patternLabel(pattern: string) {
  return PATTERNS.find(([id]) => id === pattern)?.[1] || pattern;
}
function matches(figure: Figure, filters: Filters, query: string) {
  if (filters.venue !== "all" && figure.venue !== filters.venue.toLowerCase()) return false;
  if (filters.year !== "all" && figure.year !== filters.year) return false;
  if (filters.tier !== "all" && (filters.tier === "best" ? !figure.award : figure.tier !== filters.tier || Boolean(figure.award))) return false;
  if (filters.pattern !== "all" && figure.pattern !== filters.pattern) return false;
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const content = `${figure.title} ${figure.authors.join(" ")} ${figure.venue} ${figure.year} ${figure.pattern}`.toLocaleLowerCase();
  return words.every((word) => content.includes(word));
}
function Facet({ label, options, value, onChange }: {
  label: string; options: Array<{ value: string | number; label: string; count?: number }>;
  value: string | number; onChange: (value: string | number) => void;
}) {
  return <div className="gallery-facet">
    <span className="gallery-facet-label">{label}</span>
    <div className="gallery-facet-options">{options.map((option) =>
      <button type="button" key={option.value} className={value === option.value ? "selected" : ""}
        aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
        {option.label}{option.count !== undefined && <small>{option.count.toLocaleString()}</small>}
      </button>)}</div>
  </div>;
}

function FigureCard({ figure, onOpen, onUseTemplate }: {
  figure: Figure; onOpen: () => void; onUseTemplate: () => void;
}) {
  const { t } = useUISettings();
  const [failed, setFailed] = useState(false);
  return <article className="image-creation-card">
    <button type="button" className="image-creation-card-image" onClick={onOpen}
      aria-label={`View figure: ${figure.title}`} title={figure.title}>
      {failed ? <span className="gallery-image-failed"><ImageOff size={22} />Image unavailable</span> :
        <img src={imageUrl(figure)} alt={`Figure from ${figure.title}`} loading="lazy" decoding="async" onError={() => setFailed(true)} />}
      <span className="image-creation-card-shade" aria-hidden="true" />
      <span className="image-creation-card-venue">{figure.venue.toUpperCase()} · {figure.year}</span>
      <span className="image-creation-card-title">{figure.title}</span>
    </button>
    <button type="button" className="image-creation-card-use" onClick={onUseTemplate}
      title={`Use "${figure.title}" as a template`}>
      <Sparkles size={12} />{t("Use as template")}
    </button>
  </article>;
}

function FigureDialog({ figure, index, total, onClose, onStep }: {
  figure: Figure; index: number; total: number; onClose: () => void; onStep: (step: number) => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") onStep(-1);
      if (event.key === "ArrowRight") onStep(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onStep]);
  const source = paperUrl(figure);
  return <Dialog open onClose={onClose} size="gallery" className="gallery-dialog" overlayClassName="gallery-dialog-backdrop app-dialog-overlay" ariaLabel={`Figure from ${figure.title}`}>
      <header><span>{index + 1} / {total.toLocaleString()}</span><button type="button" title="Close figure" aria-label="Close figure" onClick={onClose}><X size={20} /></button></header>
      <div className="gallery-dialog-content"><button type="button" aria-label="Previous figure" title="Previous figure" onClick={() => onStep(-1)}><ArrowLeft size={21} /></button><img src={imageUrl(figure)} alt={`Figure from ${figure.title}`} /><button type="button" aria-label="Next figure" title="Next figure" onClick={() => onStep(1)}><ArrowRight size={21} /></button></div>
      <footer><div><span className="gallery-dialog-kicker">{figure.venue.toUpperCase()} {figure.year} · {patternLabel(figure.pattern)}{tierName(figure) ? ` · ${tierName(figure)}` : ""}</span><h2>{figure.title}</h2><p>{figure.authors.join(", ")}</p></div><div className="gallery-dialog-links">{source && <a href={source} target="_blank" rel="noreferrer">Open paper <ExternalLink size={14} /></a>}<a href={imageUrl(figure)} target="_blank" rel="noreferrer">Image source <ExternalLink size={14} /></a></div></footer>
  </Dialog>;
}

export default function ImageCreationView({ active, onBrowseProceedings }: { active: boolean; onBrowseProceedings: () => void }) {
  const { t, language } = useUISettings();
  const [figures, setFigures] = useState<Figure[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [sort, setSort] = useState("newest");
  const [chartSort, setChartSort] = useState<"preferred" | "newest">("preferred");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"gallery" | "charts">("gallery");
  const [filterOpen, setFilterOpen] = useState(false);
  const [references, setReferences] = useState<Figure[]>([]);
  const [uploadedReferences, setUploadedReferences] = useState<Array<{ id: string; name: string; file: File; url: string }>>([]);
  const [uploadingReferences, setUploadingReferences] = useState(false);
  const uploadedReferencesRef = useRef(uploadedReferences);
  const [forgeOpen, setForgeOpen] = useState(false);
  const [paperTitle, setPaperTitle] = useState("");
  const [paperContent, setPaperContent] = useState("");
  const [pdfName, setPdfName] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfStatus, setPdfStatus] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [forgeError, setForgeError] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);
  const [retrievalStatus, setRetrievalStatus] = useState("");
  const [recommendations, setRecommendations] = useState<Array<{ figure: Figure; score: number | null }>>([]);
  const [visibleRecommendations, setVisibleRecommendations] = useState(60);
  const [forgeMethod, setForgeMethod] = useState<"direct" | "two-stage">("two-stage");
  const [visionModel, setVisionModel] = useState("");
  const [forgeProvider, setForgeProvider] = useState("configured");
  const [forgeBaseUrl, setForgeBaseUrl] = useState("");
  const [forgeApiKey, setForgeApiKey] = useState("");
  const [parseModel, setParseModel] = useState("");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelsBusy, setModelsBusy] = useState(false);
  const [outputMode, setOutputMode] = useState<"svg" | "bitmap">("svg");
  const [imageModel, setImageModel] = useState("");
  const [imageResolution, setImageResolution] = useState("1K");
  const [styleGuide, setStyleGuide] = useState("");
  const [generatedSvg, setGeneratedSvg] = useState("");
  const [svgWarnings, setSvgWarnings] = useState<string[]>([]);
  const [generatedBitmap, setGeneratedBitmap] = useState("");
  const [generationBusy, setGenerationBusy] = useState(false);
  const [reconstructionFile, setReconstructionFile] = useState<File | null>(null);
  const [reconstructionBusy, setReconstructionBusy] = useState(false);
  const [reconstructionStatus, setReconstructionStatus] = useState("");
  const [reconstructedScene, setReconstructedScene] = useState<FigureScene | null>(null);
  const [exportSource, setExportSource] = useState<"svg" | "bitmap">("bitmap");
  const [exportFormat, setExportFormat] = useState<"svg" | "pptx" | "vsdx" | "drawio">("svg");
  const [exportFont, setExportFont] = useState("");
  const retrievalRef = useRef<RetrievalIndex | null>(null);
  const retrievalSequence = useRef(0);
  const pdfSequence = useRef(0);
  const pdfPages = useRef<string[]>([]);
  const [figureType, setFigureType] = useState("framework");
  const [figurePlan, setFigurePlan] = useState("");
  const [composerText, setComposerText] = useState("");
  const [aspect, setAspect] = useState<Aspect>("1:1");
  const pageRef = useRef<HTMLElement>(null);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const connection = forgeProvider === "configured" ? undefined : { provider: forgeProvider, baseUrl: forgeBaseUrl, apiKey: forgeApiKey, model: parseModel };

  async function refresh(force = false) {
    setLoading(true); setError("");
    try { setFigures(await loadCatalog(force)); }
    catch (failure) {
      setFigures([]);
      setError(failure instanceof Error ? failure.message : String(failure));
    }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);
  useEffect(() => { if (!active) setSelectedId(null); }, [active]);
  useEffect(() => { uploadedReferencesRef.current = uploadedReferences; }, [uploadedReferences]);
  useEffect(() => () => { uploadedReferencesRef.current.forEach((item) => URL.revokeObjectURL(item.url)); }, []);
  useEffect(() => { setSelectedId(null); }, [tab]);
  useEffect(() => { setVisibleCount(PAGE_SIZE); setSelectedId(null); }, [filters, query, sort]);

  const result = useMemo(() => {
    const matched = figures.filter((figure) => matches(figure, filters, query));
    return matched.sort((a, b) => sort === "newest"
      ? b.year - a.year || a.venue.localeCompare(b.venue) || a.title.localeCompare(b.title)
      : sort === "oldest" ? a.year - b.year || a.venue.localeCompare(b.venue) || a.title.localeCompare(b.title)
        : a.venue.localeCompare(b.venue) || b.year - a.year || a.title.localeCompare(b.title));
  }, [figures, filters, query, sort]);
  const selectedIndex = result.findIndex((figure) => figure.id === selectedId);
  const shown = result.slice(0, visibleCount);
  const activeFilterCount = [filters.venue, filters.year, filters.tier, filters.pattern].filter((value) => value !== "all").length;
  const updateFilter = (key: keyof Filters, value: string | number) => setFilters((current) => ({ ...current, [key]: value }));
  const step = (direction: number) => { if (selectedIndex >= 0) setSelectedId(result[(selectedIndex + direction + result.length) % result.length].id); };
  const resetFilters = () => { setQuery(""); setFilters(INITIAL_FILTERS); };
  function showForge(open: boolean) {
    setForgeOpen(open);
    requestAnimationFrame(() => pageRef.current?.scrollIntoView({ block: "start" }));
  }
  function useAsTemplate(figure: Figure) {
    if (uploadingReferences) return;
    setReferences((current) => current.some((item) => item.id === figure.id) || current.length + uploadedReferences.length >= 10 ? current : [...current, figure]);
    showForge(true);
  }
  async function importPaper(file: File | undefined) {
    if (!file) return;
    const sequence = ++pdfSequence.current;
    pdfPages.current = []; setPaperContent(""); setPaperTitle(""); setPdfName(""); setPdfFile(null); setPdfStatus(""); setForgeError(""); setFigurePlan("");
    if (!file.name.toLowerCase().endsWith(".pdf") || file.size > 25 * 1024 * 1024) { setForgeError(t("Choose a PDF smaller than 25 MB.")); return; }
    setPdfBusy(true);
    try {
      const { pdfjs } = await import("./pdf-runtime");
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      const pages: string[] = [];
      let extractedLength = 0;
      let pagesRead = 0;
      try {
        for (let pageNumber = 1; pageNumber <= Math.min(doc.numPages, 100) && extractedLength < 600_000; pageNumber++) {
          const page = await doc.getPage(pageNumber);
          const content = await page.getTextContent();
          const text = content.items.map((item) => "str" in item ? item.str : "").join(" ");
          const pageText = `\n[Page ${pageNumber}]\n${text}\n`; pages.push(pageText); extractedLength += pageText.length;
          pagesRead = pageNumber;
          page.cleanup();
        }
      } finally { await doc.destroy(); }
      if (sequence !== pdfSequence.current) return;
      const extracted = selectRelevantPdfPages(pages, composerText);
      pdfPages.current = pages; setPaperContent(extracted); setPdfName(file.name); setPdfFile(file);
      setPdfStatus(extracted.replace(/\[Page \d+\]/g, "").trim().length < 100
        ? t("No local text found; native PDF analysis requires a provider that supports documents.")
        : t("Extracted {pages} of {total} pages locally; up to 60,000 characters are available for fallback.", { pages: pagesRead, total: doc.numPages }));
    } catch (error) {
      if (sequence === pdfSequence.current) setForgeError(error instanceof Error ? error.message : String(error));
    } finally { if (sequence === pdfSequence.current) setPdfBusy(false); }
  }
  async function analyzePaper() {
    if (!window.researchDesk?.prepareFigurePlan) { setForgeError(t("Paper analysis is available in the desktop app after restarting it.")); return; }
    setAnalysisBusy(true); setForgeError(""); setFigurePlan("");
    try {
      const pdfData = pdfFile ? await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === "string" ? resolve(reader.result.replace(/^data:[^;]*;base64,/, "data:application/pdf;base64,")) : reject(new Error("Could not read the PDF.")); reader.onerror = () => reject(new Error("Could not read the PDF.")); reader.readAsDataURL(pdfFile); }) : undefined;
      const result = await window.researchDesk.prepareFigurePlan({ paperText: pdfPages.current.length ? selectRelevantPdfPages(pdfPages.current, composerText) : paperContent, pdfData, figureType, requirements: [paperTitle && `Title: ${paperTitle}`, composerText].filter(Boolean).join("\n"), language, connection });
      setFigurePlan(result.plan);
      setPdfStatus(result.source === "pdf" ? t("Paper analyzed using native PDF input.") : t("Paper analyzed using extracted text.") );
    } catch (error) { setForgeError(error instanceof Error ? error.message : String(error)); }
    finally { setAnalysisBusy(false); }
  }
  async function refreshFigureModels() {
    if (!window.researchDesk?.listProviderModels) { setForgeError(t("Figure generation requires the desktop app after restarting it.")); return; }
    const endpoints: Record<string, string> = { infistar: "https://infistar.cc/v1", nonelinear: "https://api.nonelinear.com.cn/v1", openai: "https://api.openai.com/v1", ark: "https://ark.cn-beijing.volces.com/api/v3", siliconflow: "https://api.siliconflow.cn/v1", glm: "https://open.bigmodel.cn/api/paas/v4", qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1", moonshot: "https://api.moonshot.cn/v1", anthropic: "https://api.anthropic.com/v1" };
    setModelsBusy(true); setForgeError("");
    try {
      const saved = forgeProvider === "configured" ? await window.researchDesk.getModelConfig("agent") : null;
      const baseUrl = saved?.baseUrl || (forgeProvider === "custom" ? forgeBaseUrl : endpoints[forgeProvider]);
      const provider = saved?.provider || (forgeProvider === "anthropic" ? "anthropic" : "custom");
      const result = await window.researchDesk.listProviderModels({ provider, baseUrl, apiKey: forgeProvider === "configured" ? undefined : forgeApiKey }, "agent");
      setAvailableModels(result.models);
    } catch (error) { setForgeError(error instanceof Error ? error.message : String(error)); }
    finally { setModelsBusy(false); }
  }
  async function findReferences() {
    const sequence = ++retrievalSequence.current;
    const query = (figurePlan || paperContent || composerText).slice(0, 10_000);
    setSearchBusy(true); setForgeError(""); setRetrievalStatus(t("Loading the reference index…"));
    try {
      const index = retrievalRef.current ?? await loadRetrievalIndex();
      retrievalRef.current = index;
      const candidates = index.data.figs.map((figure, i) => ({ figure, i })).filter(({ figure }) =>
        (filters.venue === "all" || figure.venue === filters.venue.toLowerCase()) &&
        (filters.year === "all" || figure.year === filters.year) &&
        (filters.pattern === "all" || figure.pattern === filters.pattern) &&
        (filters.tier === "all" || (filters.tier === "best" ? Boolean(figure.award) : figure.tier === filters.tier && !figure.award))
      ).map(({ i }) => i);
      const show = (vector?: number[]) => {
        if (retrievalSequence.current !== sequence) return;
        setRecommendations(searchRetrievalIndex(index, query, candidates, vector).filter(({ figure }) => isFigure(figure)) as Array<{ figure: Figure; score: number | null }>);
      };
      setVisibleRecommendations(60); show();
      if (!query.trim()) { setRetrievalStatus(t("Showing references without relevance ranking.")); return; }
      setRetrievalStatus(t("Keyword results ready; semantic model is loading locally…"));
      const worker = new Worker(new URL("./figureforge/semantic-worker.ts", import.meta.url), { type: "module" });
      try {
        const vector = new Promise<number[]>((resolve, reject) => {
          const timer = window.setTimeout(() => reject(new Error("Semantic model timed out.")), 180_000);
          worker.onmessage = (event: MessageEvent<{ vector?: number[]; error?: string }>) => { clearTimeout(timer); event.data.vector ? resolve(event.data.vector) : reject(new Error(event.data.error || "Semantic model failed.")); };
          worker.onerror = () => { clearTimeout(timer); reject(new Error("Semantic worker failed.")); };
          worker.postMessage({ id: sequence, text: prepareSemanticQuery(index, query) });
        });
        const [embedding] = await Promise.all([vector, index.loadEmbeddings()]);
        show(embedding);
        if (retrievalSequence.current === sequence) setRetrievalStatus(t("CLIP and keyword results ready."));
      } catch (error) {
        if (retrievalSequence.current === sequence) setRetrievalStatus(`${t("Semantic search unavailable; showing keyword results.")} ${error instanceof Error ? error.message : String(error)}`);
      } finally { worker.terminate(); }
    } catch (error) {
      if (retrievalSequence.current === sequence) setForgeError(error instanceof Error ? error.message : String(error));
    } finally { if (retrievalSequence.current === sequence) setSearchBusy(false); }
  }
  async function referenceDataUrls() {
    const remote = references.map(async (figure) => {
      const response = await fetch(imageUrl(figure), { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`Reference image HTTP ${response.status}`);
      return response.blob();
    });
    const blobs = await Promise.all([...remote, ...uploadedReferences.map(async (item) => item.file)]);
    return Promise.all(blobs.map(async (blob) => {
      if (blob.size > 20_000_000 || !/^image\/(jpeg|png|webp)$/.test(blob.type)) throw new Error("Invalid or oversized reference image.");
      const image = await createImageBitmap(blob);
      try {
        if (image.width * image.height > 40_000_000) throw new Error("Reference image dimensions exceed the limit.");
        const scale = Math.min(1, 1024 / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Could not process reference image.");
        context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/jpeg", 0.85);
      } finally { image.close(); }
    }));
  }
  async function addUploadedReferences(files: FileList | null) {
    if (!files) return;
    if (uploadingReferences) return;
    setForgeError("");
    const available = 10 - references.length - uploadedReferences.length;
    const input = Array.from(files);
    if (input.length > available) { setForgeError(t("Maximum of 10 references. Remove one before adding another.")); return; }
    const added: Array<{ id: string; name: string; file: File; url: string }> = [];
    setUploadingReferences(true);
    try {
      for (const file of input) {
        if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 20_000_000) throw new Error(t("Choose PNG, JPEG or WebP images under 20 MB."));
        const bitmap = await createImageBitmap(file);
        const pixels = bitmap.width * bitmap.height; bitmap.close();
        if (pixels > 40_000_000) throw new Error(t("A reference image exceeds 40 million pixels."));
        added.push({ id: crypto.randomUUID(), name: file.name, file, url: URL.createObjectURL(file) });
      }
      setUploadedReferences((current) => [...current, ...added]);
    } catch (error) {
      added.forEach((item) => URL.revokeObjectURL(item.url));
      setForgeError(error instanceof Error ? error.message : String(error));
    } finally { setUploadingReferences(false); }
  }
  async function generateFigure() {
    if (!window.researchDesk?.generateFigureSvg || !window.researchDesk?.generateFigureBitmap || !window.researchDesk?.analyzeFigureReferences) { setForgeError(t("Figure generation requires the desktop app after restarting it.")); return; }
    setGenerationBusy(true); setForgeError(""); setGeneratedSvg(""); setSvgWarnings([]); setGeneratedBitmap(""); setStyleGuide(""); setReconstructedScene(null); setReconstructionStatus("");
    try {
      const images = await referenceDataUrls();
      let guide = "";
      let selectedImages = images;
      if (forgeMethod === "two-stage") {
        const analysis = await window.researchDesk.analyzeFigureReferences({ references: images, plan: figurePlan, model: visionModel.trim() || undefined, connection });
        guide = analysis.guide; setStyleGuide(guide);
        selectedImages = analysis.representative.map((index) => images[index - 1]).filter(Boolean);
      }
      if (outputMode === "svg") {
        const output = await window.researchDesk.generateFigureSvg({ references: selectedImages, plan: figurePlan, guide, method: forgeMethod, model: visionModel.trim() || undefined, aspect, connection });
        const svg = sanitizeFigureSvg(output.svg);
        setGeneratedSvg(svg);
        const scene = parseSvgScene(svg);
        setSvgWarnings(scene.warnings);
        if (!scene.nodes.length) throw new Error("The generated SVG contains no exportable editable objects.");
        setReconstructedScene({ ...scene, svgSource: true } as FigureScene); setExportSource("svg");
      } else {
        const output = await window.researchDesk.generateFigureBitmap({ references: selectedImages, plan: figurePlan, guide, method: forgeMethod, model: imageModel.trim(), aspect, resolution: imageResolution, connection });
        const imageResponse = await fetch(output.image, { signal: AbortSignal.timeout(30_000) });
        if (!imageResponse.ok) throw new Error("Could not load the generated image for size verification.");
        const bitmap = await createImageBitmap(await imageResponse.blob());
        try {
          if (!verifyImageRatio(bitmap.width, bitmap.height, aspect) || !verifyImageResolution(bitmap.width, bitmap.height, imageResolution, output.requestedSize)) throw new Error(`Generated image ${bitmap.width}×${bitmap.height} does not match the requested ${aspect} ${imageResolution}.`);
        } finally { bitmap.close(); }
        setGeneratedBitmap(output.image);
      }
    } catch (error) { setForgeError(error instanceof Error ? error.message : String(error)); }
    finally { setGenerationBusy(false); }
  }
  function downloadSvg() {
    if (!generatedSvg) return;
    const url = URL.createObjectURL(new Blob([generatedSvg], { type: "image/svg+xml" }));
    const link = document.createElement("a"); link.href = url; link.download = "figure.svg"; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function reconstructBitmap() {
    if (!window.researchDesk?.requestReconstructionEvidence) { setForgeError(t("Figure generation requires the desktop app after restarting it.")); return; }
    setReconstructionBusy(true); setForgeError(""); setReconstructionStatus(""); setReconstructedScene(null);
    try {
      let blob: Blob;
      if (reconstructionFile) blob = reconstructionFile;
      else if (generatedBitmap) {
        const response = await fetch(generatedBitmap, { signal: AbortSignal.timeout(30_000) });
        if (!response.ok) throw new Error(`Image HTTP ${response.status}`);
        blob = await response.blob();
      } else throw new Error(t("Upload or generate a bitmap first."));
      if (!/^image\/(jpeg|png|webp)$/.test(blob.type) || blob.size > 40_000_000) throw new Error(t("Choose a PNG, JPEG or WebP under 40 MB."));
      const image = await createImageBitmap(blob);
      try {
        if (image.width * image.height > 40_000_000) throw new Error(t("A reference image exceeds 40 million pixels."));
        const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
        const context = canvas.getContext("2d"); if (!context) throw new Error("Could not process bitmap.");
        context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
        const result = await reconstructWithTopConf(canvas, dataUrl, (input) => window.researchDesk.requestReconstructionEvidence({ ...input, model: visionModel.trim() || undefined, connection }), () => setReconstructionStatus(t("Recognizing and checking editable objects…")));
        setReconstructedScene(result.scene); setExportSource("bitmap");
        setReconstructionStatus(result.audit.finalValidation?.state === "passed" && result.audit.tilePassComplete ? t("Reconstruction checks passed. Review the result before use.") : t("Reconstruction could not be fully verified. Check for missing or misplaced objects before use."));
      } finally { image.close(); }
    } catch (error) { setForgeError(error instanceof Error ? error.message : String(error)); }
    finally { setReconstructionBusy(false); }
  }
  async function downloadReconstruction() {
    if (!reconstructedScene) return;
    try {
      let originalSvg = generatedSvg;
      if (exportSource === "svg" && exportFormat === "svg" && exportFont) {
        const document = new DOMParser().parseFromString(originalSvg, "image/svg+xml");
        document.querySelectorAll("text,tspan").forEach((element) => element.setAttribute("font-family", exportFont));
        originalSvg = new XMLSerializer().serializeToString(document.documentElement);
      }
      const blob = exportSource === "svg" && exportFormat === "svg" ? new Blob([originalSvg], { type: "image/svg+xml" }) : await exportFigureScene(reconstructedScene, exportFormat, exportFont);
      const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `figure.${exportFormat}`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setForgeError(error instanceof Error ? error.message : String(error)); }
  }

  return <main ref={pageRef} className={tab === "charts" ? "image-creation-page data-chart-page" : "image-creation-page"}>
    {!forgeOpen && <div className="image-creation-tabs">
      <Tabs value={tab} onChange={(value) => setTab(value as "gallery" | "charts")} label="Image creation views" className="workbench-tabs image-creation-tablist">
        <Tab value="gallery" id="image-creation-tab-gallery" controls="image-creation-panel-gallery" className="workbench-tab">Paper diagrams <small>{loading && !figures.length ? "…" : result.length.toLocaleString()}</small></Tab>
        <Tab value="charts" id="image-creation-tab-charts" controls="image-creation-panel-charts" className="workbench-tab">Data charts</Tab>
      </Tabs>
      <div className="image-creation-actions">
        {tab === "gallery" && <label className="image-creation-sort">
          <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort paper diagrams">
            <option value="newest">Sort: Newest</option>
            <option value="venue">Sort: Venue / year</option>
            <option value="oldest">Sort: Oldest</option>
          </select>
          <ChevronDown size={12} aria-hidden="true" />
        </label>}
        {tab === "charts" && <label className="image-creation-sort">
          <select value={chartSort} onChange={(event) => setChartSort(event.target.value as "preferred" | "newest")} aria-label="Sort data charts">
            <option value="preferred">Sort: AI venues first</option>
            <option value="newest">Sort: Newest across all</option>
          </select>
          <ChevronDown size={12} aria-hidden="true" />
        </label>}
        {tab === "gallery" && <button type="button" className="image-creation-proceedings" onClick={onBrowseProceedings}><GraduationCap size={14} />Browse full proceedings</button>}
        <button type="button" className="image-creation-forge-button" onClick={() => showForge(true)}><Sparkles size={14} />FigureForge</button>
      </div>
    </div>}

    {!forgeOpen && (tab === "gallery" ? <div className="image-creation-panel" role="tabpanel" id="image-creation-panel-gallery" aria-labelledby="image-creation-tab-gallery">
      <div className="image-creation-controls">
        <label className="gallery-search image-creation-search"><Search size={17} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a published diagram, author, or topic" aria-label="Search paper diagrams" /></label>
        <div className="image-creation-filter">
          <button ref={filterTriggerRef} type="button" className={filterOpen ? "image-creation-filter-button active" : "image-creation-filter-button"} onClick={() => setFilterOpen((open) => !open)} aria-haspopup="true" aria-expanded={filterOpen} title="Filter paper diagrams">
            <SlidersHorizontal size={14} />Filters{activeFilterCount > 0 && <b>{activeFilterCount}</b>}
          </button>
          <MenuSurface open={filterOpen} onClose={() => setFilterOpen(false)} anchorRef={filterTriggerRef} placement="bottom-start" width={560} maxHeight={520} className="image-creation-filter-panel" role="group" ariaLabel="Filter paper diagrams">
            <header><strong>Filter paper diagrams</strong><button type="button" onClick={resetFilters} disabled={!activeFilterCount && !query}>Clear all</button></header>
            <Facet label="Venue" value={filters.venue} onChange={(value) => updateFilter("venue", value)} options={[{ value: "all", label: "All" }, ...VENUES.map((venue) => ({ value: venue, label: venue, count: figures.filter((figure) => figure.venue === venue.toLowerCase()).length }))]} />
            <Facet label="Year" value={filters.year} onChange={(value) => updateFilter("year", value)} options={[{ value: "all", label: "All" }, ...YEARS.map((year) => ({ value: year, label: String(year) }))]} />
            <Facet label="Presentation" value={filters.tier} onChange={(value) => updateFilter("tier", value)} options={[{ value: "all", label: "All" }, { value: "best", label: "Awarded" }, { value: "oral", label: "Oral" }, { value: "spotlight", label: "Spotlight" }]} />
            <Facet label="Figure type" value={filters.pattern} onChange={(value) => updateFilter("pattern", value)} options={[{ value: "all", label: "All" }, ...PATTERNS.map(([value, label]) => ({ value, label }))]} />
          </MenuSurface>
        </div>
      </div>
      {error && figures.length > 0 && <InlineNotice tone="warning" className="gallery-notice">The Top-Conf catalogue could not be refreshed. Showing the last successfully loaded catalogue.</InlineNotice>}
      {loading && !figures.length ? <StateView tone="loading" className="gallery-state" icon={<LoaderCircle className="spin" size={25} />} title="Loading figures…" />
        : error && !figures.length ? <StateView tone="error" className="gallery-state" icon={<ImageOff size={25} />} title="Could not load paper diagrams" description={error} action={<button type="button" onClick={() => void refresh(true)}>Retry</button>} />
          : !result.length ? <StateView className="gallery-state" icon={<Search size={25} />} title="No figures match these filters" action={<button type="button" onClick={resetFilters}>Clear filters</button>} />
            : <>
              <div className="image-creation-grid">{shown.map((figure) => <FigureCard key={figure.id} figure={figure} onOpen={() => setSelectedId(figure.id)} onUseTemplate={() => useAsTemplate(figure)} />)}</div>
              {visibleCount < result.length && <div className="gallery-load-more"><button type="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>Show more figures <span>{Math.min(visibleCount, result.length).toLocaleString()} / {result.length.toLocaleString()}</span></button></div>}
            </>}
      <p className="gallery-credit">Figures belong to their paper authors and publishers. The catalogue and image files are served by <a href={GALLERY_ROOT} target="_blank" rel="noreferrer">Top-Conf Figure Gallery</a>. Check each paper's license before reuse.</p>
    </div> : <div className="image-creation-panel" role="tabpanel" id="image-creation-panel-charts" aria-labelledby="image-creation-tab-charts"><DataChartGallery active={active} sort={chartSort} /></div>)}

    {active && selectedIndex >= 0 && <FigureDialog figure={result[selectedIndex]} index={selectedIndex} total={result.length} onClose={() => setSelectedId(null)} onStep={step} />}
    {active && forgeOpen && <section className="figure-forge-page" aria-label={t("FigureForge planning workspace")}>
      <button type="button" className="figure-forge-back" onClick={() => showForge(false)}><ArrowLeft size={15} />{t("Back to gallery")}</button>
      <header className="figure-forge-header"><div><strong>FigureForge</strong><p>{t("Plan a paper figure with references")}</p></div></header>
      <div className="figure-forge-body">
        <h2 className="figure-forge-step">{t("1. Paper content")}</h2>
        <p className="figure-forge-notice">{t("Upload a PDF to extract its text locally. AI features use your configured model provider and may incur charges. Drafts are not saved.")}</p>
        <label>{t("Upload paper PDF")}<input type="file" accept=".pdf,application/pdf" disabled={pdfBusy || analysisBusy} onChange={(event) => { void importPaper(event.target.files?.[0]); event.target.value = ""; }} /></label>
        {pdfBusy && <p role="status">{t("Reading PDF locally…")}</p>}
        {pdfName && <p role="status">{pdfName} · {pdfStatus}</p>}
        <details><summary>{t("Optional: enter or review paper text")}</summary>
          <label>{t("Paper title")}<input value={paperTitle} disabled={analysisBusy} onChange={(event) => { setPaperTitle(event.target.value); }} /></label>
          <label>{t("Abstract or paper content")}<textarea rows={5} value={paperContent} disabled={analysisBusy} onChange={(event) => { pdfPages.current = []; setPdfFile(null); setPdfStatus(t("Using manually edited paper text.")); setPaperContent(event.target.value.slice(0, 60_000)); }} /></label>
        </details>
        <label>{t("Figure type")}<select value={figureType} disabled={analysisBusy} onChange={(event) => { setFigureType(event.target.value); }}>{[["framework", "Framework"], ["architecture", "Architecture"], ["pipeline", "Pipeline"], ["conceptual", "Concept"], ["custom", "Custom"]].map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label>
        <section className="figure-forge-generation"><strong>{t("Paper analysis model and provider")}</strong>
          <label>{t("Provider")}<select value={forgeProvider} disabled={analysisBusy || generationBusy || reconstructionBusy || modelsBusy} onChange={(event) => { setForgeProvider(event.target.value); setForgeApiKey(""); setAvailableModels([]); }}><option value="configured">{t("Use Archimedes main model")}</option><option value="infistar">Infistar</option><option value="nonelinear">NoneLinear</option><option value="openai">OpenAI</option><option value="ark">Volcengine Ark</option><option value="siliconflow">SiliconFlow</option><option value="glm">Zhipu GLM</option><option value="qwen">Qwen</option><option value="moonshot">Moonshot</option><option value="anthropic">Anthropic</option><option value="custom">{t("Custom OpenAI-compatible")}</option></select></label>
          {forgeProvider !== "configured" && <><label>{t("API key (this session only)")}<input type="password" autoComplete="off" disabled={analysisBusy || generationBusy || reconstructionBusy || modelsBusy} value={forgeApiKey} onChange={(event) => setForgeApiKey(event.target.value)} /></label><label>{t("Paper analysis model")}<input list="figure-forge-models" disabled={analysisBusy || generationBusy || reconstructionBusy || modelsBusy} value={parseModel} onChange={(event) => setParseModel(event.target.value)} /></label>{forgeProvider === "custom" && <label>{t("Model API base URL")}<input type="url" disabled={analysisBusy || generationBusy || reconstructionBusy || modelsBusy} value={forgeBaseUrl} onChange={(event) => setForgeBaseUrl(event.target.value)} placeholder="https://example.com/v1" /></label>}<p>{t("This key stays in memory for this session and is not saved to the project.")}</p></>}
          <datalist id="figure-forge-models">{availableModels.map((model) => <option key={model} value={model} />)}</datalist>
          <button type="button" disabled={modelsBusy} onClick={() => void refreshFigureModels()}>{modelsBusy ? t("Loading models…") : t("Refresh model list")}</button>
        </section>
        <label>{t("Drawing requirements")}<textarea rows={2} value={composerText} disabled={analysisBusy} onChange={(event) => { setComposerText(event.target.value); }} /></label>
        <p>{t("Analyzing sends your PDF and requirements to the selected model provider; if PDF input is rejected, readable extracted text is used instead. This may incur charges. Reference images are not sent in this step.")}</p>
        <div className="figure-forge-footer"><button type="button" disabled={pdfBusy || analysisBusy || (!pdfFile && paperContent.trim().length < 100)} onClick={() => void analyzePaper()}>{analysisBusy ? t("Analyzing paper…") : t("Analyze paper and draft plan")}</button></div>
        {forgeError && <p role="alert">{forgeError}</p>}
        <label>{t("Figure plan")}<textarea rows={5} value={figurePlan} disabled={analysisBusy} onChange={(event) => { setFigurePlan(event.target.value); }} placeholder={t("Analyze the paper to draft a plan, then review and edit it.")} /></label>
        <section className="figure-forge-search"><div className="figure-forge-section-heading"><strong>{t("2. Find and select references")}</strong><button type="button" disabled={searchBusy} onClick={() => void findReferences()}>{searchBusy ? t("Searching…") : t("Search references")}</button></div>
          <div className="figure-forge-filter-row">
            <label>{t("Figure type")}<select value={filters.pattern} onChange={(event) => updateFilter("pattern", event.target.value)}><option value="all">{t("All")}</option>{PATTERNS.map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label>
            <label>{t("Venue")}<select value={filters.venue} onChange={(event) => updateFilter("venue", event.target.value)}><option value="all">{t("All")}</option>{VENUES.map((venue) => <option key={venue} value={venue}>{venue}</option>)}</select></label>
            <label>{t("Year")}<select value={filters.year} onChange={(event) => updateFilter("year", event.target.value === "all" ? "all" : Number(event.target.value))}><option value="all">{t("All")}</option>{YEARS.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
            <label>{t("Presentation")}<select value={filters.tier} onChange={(event) => updateFilter("tier", event.target.value)}><option value="all">{t("All")}</option><option value="best">{t("Awarded")}</option><option value="oral">Oral</option><option value="spotlight">Spotlight</option></select></label>
          </div>
          <p>{t("Search uses the paper plan or text. Gallery filters also apply. First use downloads the CLIP model; your query is processed locally.")}</p>
          {retrievalStatus && <p role="status">{retrievalStatus}</p>}
          <div className="figure-forge-results">{recommendations.slice(0, visibleRecommendations).map(({ figure, score }) => { const selected = references.some((item) => item.id === figure.id); return <button type="button" key={figure.id} aria-pressed={selected} disabled={generationBusy || uploadingReferences || (!selected && references.length + uploadedReferences.length >= 10)} onClick={() => { setReferences((current) => selected ? current.filter((item) => item.id !== figure.id) : [...current, figure]); }}><img src={imageUrl(figure)} alt="" loading="lazy" /><span>{figure.title}</span><small>{figure.venue.toUpperCase()} · {figure.year}{score !== null ? ` · ${score}` : ""}</small><b>{selected ? t("Selected") : t("Select reference")}</b></button>; })}</div>
          {visibleRecommendations < recommendations.length && <button type="button" onClick={() => setVisibleRecommendations((count) => count + 60)}>{t("Show more references")}</button>}
        </section>
        <section className="figure-forge-references"><div className="figure-forge-section-heading"><strong>{t("References ({count}/10)", { count: references.length + uploadedReferences.length })}</strong><button type="button" disabled={generationBusy || uploadingReferences} onClick={() => { setTab("gallery"); showForge(false); }}>{t("Browse references")}</button></div>
          <label className="figure-forge-upload">{t("Upload reference images")}<input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={generationBusy || uploadingReferences} onChange={(event) => { void addUploadedReferences(event.target.files); event.target.value = ""; }} /></label>
          {references.length + uploadedReferences.length === 0 && <p>{t("Choose Use as template on a gallery image to add a reference.")}</p>}
          {references.map((figure) => <div className="figure-forge-reference" key={figure.id}><img src={imageUrl(figure)} alt="" /><div><strong>{figure.title}</strong><span>{figure.venue.toUpperCase()} · {figure.year}</span><a href={paperUrl(figure)} target="_blank" rel="noreferrer">{t("Open paper")}</a></div><button type="button" disabled={generationBusy} onClick={() => { setReferences((current) => current.filter((item) => item.id !== figure.id)); }} aria-label={t("Remove reference")}> <X size={16} /></button></div>)}
          {uploadedReferences.map((item) => <div className="figure-forge-reference" key={item.id}><img src={item.url} alt="" /><div><strong>{item.name}</strong><span>{t("Uploaded reference")}</span></div><button type="button" disabled={generationBusy} onClick={() => { URL.revokeObjectURL(item.url); setUploadedReferences((current) => current.filter((value) => value.id !== item.id)); }} aria-label={t("Remove reference")}><X size={16} /></button></div>)}
          {references.length + uploadedReferences.length >= 10 && <p>{t("Maximum of 10 references. Remove one before adding another.")}</p>}
        </section>
        <section className="figure-forge-generation"><strong>{t("3. Generate figure")}</strong>
          <label>{t("Generation method")}<select value={forgeMethod} disabled={generationBusy} onChange={(event) => setForgeMethod(event.target.value as "direct" | "two-stage")}><option value="two-stage">{t("Two-stage: analyze then generate")}</option><option value="direct">{t("Direct generation")}</option></select></label>
          <label>{t("Output format")}<select value={outputMode} disabled={generationBusy} onChange={(event) => setOutputMode(event.target.value as "svg" | "bitmap")}><option value="svg">SVG</option><option value="bitmap">{t("AI bitmap")}</option></select></label>
          <label>{t("Aspect ratio")}<select value={aspect} disabled={generationBusy} onChange={(event) => setAspect(event.target.value as Aspect)}>{ASPECTS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          {outputMode === "bitmap" && <label>{t("Resolution")}<select value={imageResolution} disabled={generationBusy} onChange={(event) => setImageResolution(event.target.value)}><option>1K</option><option>2K</option><option>4K</option></select></label>}
          <label>{t("Vision model override (optional)")}<input list="figure-forge-models" value={visionModel} disabled={generationBusy || reconstructionBusy} onChange={(event) => setVisionModel(event.target.value)} placeholder={t("Uses the configured main model by default")} /></label>
          {outputMode === "bitmap" && <label>{t("Image generation model")}<input list="figure-forge-models" value={imageModel} disabled={generationBusy} onChange={(event) => setImageModel(event.target.value)} placeholder="gpt-image-1" /></label>}
          <p>{t("Selected reference images and your plan will be sent to the configured model provider. Use a model that supports images; charges may apply.")}</p>
          <p>{t("Two-stage requires 4–10 references; direct generation requires 2–4.")}</p>
          <button type="button" disabled={generationBusy || reconstructionBusy || uploadingReferences || !figurePlan.trim() || (outputMode === "bitmap" && !imageModel.trim()) || references.length + uploadedReferences.length < (forgeMethod === "two-stage" ? 4 : 2) || (forgeMethod === "direct" && references.length + uploadedReferences.length > 4)} onClick={() => void generateFigure()}>{generationBusy ? t("Generating…") : t("Generate draft")}</button>
          {styleGuide && <details><summary>{t("Reference analysis")}</summary><pre>{styleGuide}</pre></details>}
          {generatedSvg && <div className="figure-forge-output"><img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(generatedSvg)}`} alt={t("Generated figure preview")} /><button type="button" onClick={downloadSvg}>{t("Download SVG")}</button></div>}
          {svgWarnings.length > 0 && <p role="status">{svgWarnings.join("; ")}</p>}
          {generatedBitmap && <div className="figure-forge-output"><img src={generatedBitmap} alt={t("Generated figure preview")} /><a href={generatedBitmap} download="figure.png" target="_blank" rel="noreferrer">{t("Download bitmap")}</a></div>}
        </section>
        <section className="figure-forge-generation"><strong>{t("4. Reconstruct and export editable figure")}</strong>
          <label>{t("Upload a bitmap or use the generated image")}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={reconstructionBusy} onChange={(event) => { setReconstructionFile(event.target.files?.[0] ?? null); setReconstructedScene(null); }} /></label>
          <p>{t("Reconstruction sends the bitmap and rendered comparisons to the configured vision model in multiple requests. This may incur charges; check results before use.")}</p>
          <button type="button" disabled={reconstructionBusy || generationBusy || (!reconstructionFile && !generatedBitmap)} onClick={() => void reconstructBitmap()}>{reconstructionBusy ? t("Reconstructing…") : t("Reconstruct editable objects")}</button>
          {reconstructionStatus && <p role="status">{reconstructionStatus}</p>}
          {reconstructedScene && <><div className="figure-forge-output"><img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(exportSource === "svg" ? generatedSvg : sceneToSvgString(reconstructedScene))}`} alt={t("Reconstructed figure preview")} /></div>
            <label>{t("Export format")}<select value={exportFormat} onChange={(event) => setExportFormat(event.target.value as typeof exportFormat)}><option value="svg">SVG</option><option value="pptx">PPTX</option><option value="vsdx">VSDX</option><option value="drawio">draw.io</option></select></label>
            <label>{t("Export font")}<select value={exportFont} onChange={(event) => setExportFont(event.target.value)}><option value="">{t("Keep generated fonts")}</option><option>Arial</option><option>Helvetica</option><option>Times New Roman</option><option>Noto Sans</option></select></label>
            <button type="button" onClick={() => void downloadReconstruction()}>{t("Export editable figure")}</button></>}
        </section>
        <p>{t("References belong to their authors. Check each paper's license before reuse.")}</p>
      </div>
    </section>}
  </main>;
}
