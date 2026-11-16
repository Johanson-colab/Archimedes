import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronDown, ExternalLink, GraduationCap, ImageOff, ImagePlus, LoaderCircle, Search, SlidersHorizontal, Sparkle, Upload, Wand, X } from "lucide-react";
import { MenuSurface } from "./Menu";
import { Tabs, Tab } from "./Tabs";

import { Dialog } from "./Dialog";
import { InlineNotice } from "./InlineNotice";
import { StateView } from "./StateView";
import { useUISettings } from "./i18n";
import { loadRetrievalIndex, prepareSemanticQuery, searchRetrievalIndex, type RetrievalIndex } from "./figureforge/retrieval.mjs";
import { contractIsUsable, normalizeDesignContract, renderDesignContract, renderImageGuide, type DesignContract } from "./figureforge/design-contract.mjs";
import { sanitizeFigureSvg } from "./figureforge/sanitize-svg.mjs";
import type { FigureScene } from "./figureforge/reconstruction.mjs";
import { parseSvgScene } from "./figureforge/vendor/svg-scene.mjs";
import { sceneToSvgString } from "./figureforge/vendor/reconstruction-renderer.mjs";
import { reconstructWithTopConf } from "./figureforge/reconstruction-workflow.mjs";
import { exportFigureScene } from "./figureforge/export";
import { selectRelevantPdfPages } from "./figureforge/pdf-sections.mjs";
import { verifyImageRatio, verifyImageResolution } from "./figureforge/vendor/aspect-ratio.mjs";
import { figurePng } from "./figure-image";
import type { ProjectResultOpenRequest, ProjectResultDetail, ProjectResultFile, ProjectResultOwner, ProjectResultsBridge, ProjectResultSummary } from "./project-results";
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
// The stage-1 figure type maps onto the gallery's visual-pattern vocabulary so
// reference retrieval inherits the intent instead of ignoring it.
const FIGURE_TYPE_PATTERN: Record<string, string> = {
  framework: "framework", architecture: "architecture", pipeline: "pipeline", conceptual: "conceptual", custom: "all",
};
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
  savedSourceUrl?: string;
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
      <span className="image-creation-card-venue">{figure.venue.toUpperCase()} · {figure.year}</span>
    </button>
    <button type="button" className="image-creation-card-caption" onClick={onOpen} title={figure.title}>{figure.title}</button>
    <button type="button" className="image-creation-card-use" onClick={onUseTemplate}
      title={`Use "${figure.title}" as a template`}>
      <Sparkle size={12} />{t("Use as template")}
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

type ImageCreationProps = { active: boolean; ownerKey?: string; owner?: ProjectResultOwner; bridge?: ProjectResultsBridge; mainModel?: PublicModelConfig | null; openRequest?: ProjectResultOpenRequest; onUseInManuscript?: (result: ProjectResultDetail, fileName: string) => Promise<void>; onOpenModelSettings?: () => void; onBrowseProceedings: () => void; onBrowseChartReferences?: () => void };

export default function ImageCreationView(props: ImageCreationProps) {
  const key = props.ownerKey ?? "preview";
  const [visited, setVisited] = useState<Record<string, ProjectResultOwner | undefined>>({});
  useEffect(() => { setVisited((current) => current[key] === props.owner && key in current ? current : { ...current, [key]: props.owner }); }, [key, props.owner?.projectId, props.owner?.workspaceId, props.owner?.executionRoot]);
  const owners = { ...visited, [key]: props.owner };
  // Keep each project's unsaved working draft alive. Changing owners never
  // retargets another draft's uploads or delayed generation result.
  return <>{Object.entries(owners).map(([ownerKey, owner]) => <div key={ownerKey} hidden={ownerKey !== key || !props.active} className="figure-owner-workspace"><ImageCreationWorkspace {...props} ownerKey={ownerKey} owner={owner} active={props.active && ownerKey === key} /></div>)}</>;
}

function ImageCreationWorkspace({ active, owner, bridge, mainModel, onOpenModelSettings, onUseInManuscript, openRequest, onBrowseProceedings, onBrowseChartReferences }: ImageCreationProps) {
  const { t, language } = useUISettings();
  const [figures, setFigures] = useState<Figure[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [sort, setSort] = useState("newest");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [references, setReferences] = useState<Figure[]>([]);
  const [uploadedReferences, setUploadedReferences] = useState<Array<{ id: string; name: string; file: File; url: string }>>([]);
  const [uploadingReferences, setUploadingReferences] = useState(false);
  const uploadedReferencesRef = useRef(uploadedReferences);
  const [forgeOpen, setForgeOpen] = useState(true);
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
  const [forgeFilters, setForgeFilters] = useState<Filters>(INITIAL_FILTERS);
  const [searchedQuery, setSearchedQuery] = useState<string | null>(null);
  const [designContract, setDesignContract] = useState<DesignContract | null>(null);
  const [designPicks, setDesignPicks] = useState<{ representative: number[]; imageRefs: number[] }>({ representative: [], imageRefs: [] });
  const [contractBusy, setContractBusy] = useState(false);
  const [recommendations, setRecommendations] = useState<Array<{ figure: Figure; score: number | null; reason?: string; keywords?: string[] }>>([]);
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
  const [generatedSvg, setGeneratedSvg] = useState("");
  const [paperInputId, setPaperInputId] = useState<string>(() => crypto.randomUUID());
  const [outputOrigin, setOutputOrigin] = useState<{ signature: string; source: Record<string, unknown> } | null>(null);
  const [sceneOrigin, setSceneOrigin] = useState<{ signature: string } | { file: File } | null>(null);
  const restoredOutputPending = useRef(false);
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
  const [savedResults, setSavedResults] = useState<ProjectResultSummary[]>([]);
  const [resultId, setResultId] = useState<string | null>(null);
  const [chosenResult, setChosenResult] = useState("");
  const [resultBusy, setResultBusy] = useState(false);
  const [resultNotice, setResultNotice] = useState("");
  const activeRef = useRef(active); activeRef.current = active;
  const referenceBlobs = useRef(new Map<string, Promise<Blob>>());
  const pageRef = useRef<HTMLElement>(null);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const modelSettingsRef = useRef<HTMLDetailsElement>(null);
  const connection = forgeProvider === "configured" ? undefined : { provider: forgeProvider, baseUrl: forgeBaseUrl, apiKey: forgeApiKey, model: parseModel };
  const inputSource = {
    inputId: paperInputId, paper: { title: paperTitle, sourceName: pdfName }, requirements: composerText, plan: figurePlan,
    figureType, aspect, outputMode, method: forgeMethod,
    model: { provider: forgeProvider, baseUrl: safeBaseUrl(forgeBaseUrl), parseModel, visionModel, imageModel, resolution: imageResolution,
      ...(forgeProvider === "configured" && mainModel ? { configured: { provider: mainModel.provider, model: mainModel.model, baseUrl: safeBaseUrl(mainModel.baseUrl) } } : {}) },
    references: [...references.map((item) => ({ id: item.id, sourceUrl: item.savedSourceUrl || imageUrl(item) })), ...uploadedReferences.map((item) => ({ id: item.id, name: item.name, size: item.file.size }))],
    designContract, designPicks,
  };
  const inputSignature = JSON.stringify({ source: inputSource, paperContent, pages: pdfPages.current });
  const liveInput = useRef(inputSignature); liveInput.current = inputSignature;
  const outputIsCurrent = Boolean(outputOrigin && outputOrigin.signature === inputSignature);
  const sceneIsCurrent = Boolean(sceneOrigin && ("file" in sceneOrigin ? sceneOrigin.file === reconstructionFile : sceneOrigin.signature === inputSignature));
  const liveReconstructionFile = useRef(reconstructionFile); liveReconstructionFile.current = reconstructionFile;
  const liveGeneratedBitmap = useRef(generatedBitmap); liveGeneratedBitmap.current = generatedBitmap;
  const draftSignature = JSON.stringify([inputSignature, generatedSvg, generatedBitmap, reconstructedScene, exportSource, exportFormat, exportFont]);
  const liveDraft = useRef(draftSignature); liveDraft.current = draftSignature;
  useEffect(() => {
    if (!restoredOutputPending.current) return;
    restoredOutputPending.current = false;
    if (generatedSvg || generatedBitmap) setOutputOrigin({ signature: inputSignature, source: inputSource });
    if (reconstructedScene && !reconstructionFile) setSceneOrigin({ signature: inputSignature });
  }, [inputSignature]);
  async function refreshSavedResults() {
    if (!owner || !bridge || !activeRef.current) return;
    setSavedResults(await bridge.listProjectResults({ projectId: owner.projectId, workspaceId: owner.workspaceId, kind: "figure" }));
  }
  useEffect(() => { if (active) void refreshSavedResults().catch((reason) => setForgeError(String(reason))); }, [active, bridge]);

  async function referenceBlob(figure: Figure) {
    const key = `${figure.id}:${figure.image}`;
    let pending = referenceBlobs.current.get(key);
    if (!pending) {
      pending = fetch(imageUrl(figure), { signal: AbortSignal.timeout(30_000) }).then(async (response) => {
        if (!response.ok) throw new Error(`Reference image HTTP ${response.status}`);
        const blob = await response.blob();
        if (blob.size > 20_000_000 || !/^image\/(jpeg|png|webp)$/.test(blob.type)) throw new Error("Invalid or oversized reference image.");
        return blob;
      }).catch((error) => { referenceBlobs.current.delete(key); throw error; });
      referenceBlobs.current.set(key, pending);
    }
    return pending;
  }
  async function encodedFile(blob: Blob, name: string, role: ProjectResultFile["role"]): Promise<ProjectResultFile> {
    if (blob.size > 20_000_000) throw new Error(t("Choose PNG, JPEG or WebP images under 20 MB."));
    const content = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
    return { name, role, encoding: "base64", content };
  }
  function safeBaseUrl(value: string) {
    if (!value.trim()) return "";
    let url: URL; try { url = new URL(value); } catch { return ""; }
    url.username = ""; url.password = ""; url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (/key|token|secret|password|authorization/i.test(key)) url.searchParams.delete(key);
    return url.href;
  }
  async function saveFigureResult(manuscriptImage = false) {
    if (!owner || !bridge || !activeRef.current) return;
    const capturedDraft = liveDraft.current, capturedId = resultId;
    const pages = [...pdfPages.current], source = structuredClone(inputSource);
    const currentOutput = outputIsCurrent, currentScene = sceneIsCurrent;
    const includedScene = currentScene ? reconstructedScene : null;
    const reconstructionSource = currentScene && sceneOrigin && "file" in sceneOrigin ? sceneOrigin.file : null;
    setResultBusy(true); setForgeError(""); setResultNotice("");
    try {
      const files: ProjectResultFile[] = [{ name: "paper.txt", role: "source", encoding: "utf8", content: paperContent }];
      if (pages.length) files.push({ name: "paper-pages.json", role: "source", encoding: "utf8", content: JSON.stringify(pages) });
      const savedReferences: Array<Record<string, unknown>> = [];
      for (const [index, figure] of references.entries()) {
        const blob = await referenceBlob(figure);
        const file = `reference-${index + 1}.${blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg"}`;
        const sourceUrl = figure.savedSourceUrl || imageUrl(figure);
        files.push(await encodedFile(blob, file, "reference")); savedReferences.push({ id: figure.id, origin: "catalog", file, figure: { ...figure, image: sourceUrl }, name: figure.title, sourceUrl, paperUrl: paperUrl(figure) });
      }
      for (const item of uploadedReferences) {
        const file = `reference-${savedReferences.length + 1}.${item.file.type === "image/png" ? "png" : item.file.type === "image/webp" ? "webp" : "jpg"}`;
        files.push(await encodedFile(item.file, file, "reference")); savedReferences.push({ id: item.id, origin: "upload", name: item.name, file, mimeType: item.file.type });
      }
      let output: { file: string; kind: "svg" | "bitmap" } | null = null;
      if (currentOutput && generatedSvg && manuscriptImage) files.push({ name: "figure.png", role: "output", encoding: "base64", content: await figurePng(sanitizeFigureSvg(generatedSvg)) });
      if (currentOutput && generatedSvg) { files.push({ name: "figure.svg", role: "output", encoding: "utf8", content: sanitizeFigureSvg(generatedSvg) }); output = { file: "figure.svg", kind: "svg" }; }
      if (currentOutput && generatedBitmap) {
        const response = await fetch(generatedBitmap); if (!response.ok) throw new Error(t("Could not read the generated image."));
        const blob = await response.blob(), file = `figure.${blob.type === "image/jpeg" ? "jpg" : blob.type === "image/webp" ? "webp" : "png"}`;
        files.push(await encodedFile(blob, file, "output")); output = { file, kind: "bitmap" };
      }
      if (includedScene) files.push({ name: "scene.json", role: "output", encoding: "utf8", content: JSON.stringify(includedScene) });
      let reconstruction: { file: string; name: string; mimeType: string } | undefined;
      if (reconstructionSource) { const file = "reconstruction-source" + (reconstructionSource.type === "image/png" ? ".png" : reconstructionSource.type === "image/webp" ? ".webp" : ".jpg"); files.push(await encodedFile(reconstructionSource, file, "source")); reconstruction = { file, name: reconstructionSource.name, mimeType: reconstructionSource.type }; }
      if (!activeRef.current) { setResultNotice(t("Figure was not saved. Return to this project and save its draft.")); return; }
      const saved = await bridge.saveProjectResult({ id: capturedId || undefined, projectId: owner.projectId, workspaceId: owner.workspaceId, threadId: null, kind: "figure", title: paperTitle || pdfName || t("Figure draft"), manifest: {
        version: 1, inputId: paperInputId, paper: { title: paperTitle, file: "paper.txt", sourceName: pdfName, ...(pages.length ? { pagesFile: "paper-pages.json" } : {}) },
        requirements: composerText, plan: figurePlan, figureType, aspect, outputMode, method: forgeMethod, export: { source: exportSource, format: exportFormat, font: exportFont },
        model: source.model, references: savedReferences, designContract, designPicks, output,
        ...(output && outputOrigin ? { generatedFrom: outputOrigin.source } : {}), ...(includedScene ? { sceneFile: "scene.json" } : {}), ...(reconstruction ? { reconstruction } : {}),
      }, files });
      if (liveDraft.current === capturedDraft) {
        setResultId(saved.id);
        setResultNotice(!currentOutput && (generatedSvg || generatedBitmap) ? t("Figure inputs saved. The earlier output was excluded because its inputs have changed.") : t("Figure snapshot saved to this project."));
      }
      await refreshSavedResults(); return saved;
    } catch (reason) { if (liveDraft.current === capturedDraft) setForgeError(String(reason)); }
    finally { setResultBusy(false); }
  }
  const restoredUrls = useRef<string[]>([]);
  useEffect(() => () => { restoredUrls.current.forEach((url) => URL.revokeObjectURL(url)); }, []);
  async function openFigureResult(id = chosenResult) {
    if (!owner || !bridge || !id || !activeRef.current) return;
    const capturedDraft = liveDraft.current;
    setResultBusy(true); setForgeError(""); setResultNotice("");
    const urls: string[] = [];
    try {
      const saved: ProjectResultDetail = await bridge.getProjectResult(id);
      if (!activeRef.current) return;
      if (saved.kind !== "figure" || saved.projectId !== owner.projectId || saved.workspaceId !== owner.workspaceId) throw new Error(t("This figure belongs to a different project workspace."));
      if (saved.fileState !== "ready") throw new Error(t("Saved figure files have changed or are missing. Restore the files before reopening this snapshot."));
      async function read(name: string) {
        if (!activeRef.current) throw new Error(t("Return to this project to reopen its figure."));
        const item = await bridge!.readProjectResultFile(saved.id, name);
        if (item.fileState !== "ready" || item.sha256 !== saved.files.find((file) => file.name === name)?.sha256) throw new Error(t("The figure files changed while reopening. Try again."));
        return item;
      }
      function restoredBlob(content: string, mime: string) { return new Blob([Uint8Array.from(atob(content), (character) => character.charCodeAt(0))], { type: mime }); }
      const manifest = saved.manifest, paper = manifest.paper as { title: string; file: string; sourceName: string; pagesFile?: string };
      const text = await read(paper.file), pages = paper.pagesFile ? JSON.parse((await read(paper.pagesFile)).content) as string[] : [];
      const refs = manifest.references as Array<{ id: string; file: string; name: string; origin: string; figure?: Figure; mimeType?: string; sourceUrl?: string }>;
      const catalog: Figure[] = [], uploads: typeof uploadedReferences = [];
      for (const ref of refs) {
        const receipt = await read(ref.file), mime = ref.mimeType || (ref.file.endsWith("png") ? "image/png" : ref.file.endsWith("webp") ? "image/webp" : "image/jpeg");
        const blob = restoredBlob(receipt.content, mime), url = URL.createObjectURL(blob); urls.push(url);
        if (ref.origin === "catalog" && ref.figure) { const figure = { ...ref.figure, image: url, savedSourceUrl: ref.sourceUrl || imageUrl(ref.figure) }; catalog.push(figure); referenceBlobs.current.set(`${figure.id}:${figure.image}`, Promise.resolve(blob)); }
        else uploads.push({ id: ref.id, name: ref.name, file: new File([blob], ref.name, { type: mime }), url });
      }
      const output = manifest.output as { file: string; kind: string } | null;
      let svg = "", bitmap = "";
      if (output) {
        const file = await read(output.file);
        if (output.kind === "svg") svg = sanitizeFigureSvg(file.content);
        else { const mime = output.file.endsWith("jpg") ? "image/jpeg" : output.file.endsWith("webp") ? "image/webp" : "image/png"; bitmap = `data:${mime};base64,${file.content}`; }
      }
      const reconstruction = manifest.reconstruction as { file: string; name: string; mimeType: string } | undefined;
      const reconstructionSource = reconstruction ? new File([restoredBlob((await read(reconstruction.file)).content, reconstruction.mimeType)], reconstruction.name, { type: reconstruction.mimeType }) : null;
      const scene = typeof manifest.sceneFile === "string" ? JSON.parse((await read(manifest.sceneFile)).content) as FigureScene : null;
      if (!activeRef.current || liveDraft.current !== capturedDraft) return;
      restoredUrls.current.forEach((url) => URL.revokeObjectURL(url)); restoredUrls.current = urls.splice(0);
      uploadedReferencesRef.current.forEach((item) => URL.revokeObjectURL(item.url));
      ++pdfSequence.current; setPaperInputId(typeof manifest.inputId === "string" ? manifest.inputId : crypto.randomUUID());
      setOutputOrigin(null); setSceneOrigin(null); restoredOutputPending.current = true;
      setReconstructionFile(reconstructionSource);
      if (reconstructionSource && scene) setSceneOrigin({ file: reconstructionSource });
      setPaperTitle(paper.title); setPaperContent(text.content); setPdfName(paper.sourceName); setPdfFile(null); pdfPages.current = pages;
      setComposerText(String(manifest.requirements || "")); setFigurePlan(String(manifest.plan || "")); setFigureType(String(manifest.figureType || "framework")); setAspect(manifest.aspect as Aspect);
      setOutputMode(manifest.outputMode as "svg" | "bitmap"); setForgeMethod(manifest.method as "direct" | "two-stage");
      const exportOptions = manifest.export as { source?: "svg" | "bitmap"; format?: typeof exportFormat; font?: string } | undefined;
      setExportSource(exportOptions?.source || "bitmap"); setExportFormat(exportOptions?.format || "svg"); setExportFont(exportOptions?.font || "");
      const model = manifest.model as { provider: string; baseUrl: string; parseModel: string; visionModel: string; imageModel: string; resolution: string };
      setForgeProvider(model.provider); setForgeBaseUrl(model.baseUrl); setForgeApiKey(""); setParseModel(model.parseModel); setVisionModel(model.visionModel); setImageModel(model.imageModel); setImageResolution(model.resolution);
      setReferences(catalog); setUploadedReferences(uploads); setGeneratedSvg(svg); setGeneratedBitmap(bitmap); setReconstructedScene(scene); setForgeOpen(true);
      designSignature.current = `${String(manifest.plan || "")}\u0000${catalog.map((item) => item.id).join("|")}#${uploads.map((item) => item.id).join("|")}`;
      setDesignContract(manifest.designContract as DesignContract | null); setDesignPicks(manifest.designPicks as typeof designPicks);
      setResultId(saved.id); setResultNotice(t("Saved figure reopened. Model credentials are not stored in the result."));
    } catch (reason) { setForgeError(String(reason)); }
    finally { urls.forEach((url) => URL.revokeObjectURL(url)); setResultBusy(false); }
  }

  const consumedResultRequest = useRef<string | null>(null);
  useEffect(() => {
    if (!active || !openRequest || consumedResultRequest.current === openRequest.token) return;
    consumedResultRequest.current = openRequest.token; void openFigureResult(openRequest.id);
  }, [active, openRequest]);
  async function useInManuscript() {
    const version = liveDraft.current;
    const saved = await saveFigureResult(true);
    if (!saved || !activeRef.current || liveDraft.current !== version) return;
    const file = saved.files.find((item) => item.role === "output" && /\.(png|jpe?g|pdf)$/i.test(item.name));
    if (file) try { await onUseInManuscript?.(saved, file.name); } catch (reason) { setForgeError(String(reason)); }
  }
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
  useEffect(() => { setVisibleCount(PAGE_SIZE); setSelectedId(null); }, [filters, query, sort]);
  // The design contract is derived from the plan text and the exact reference
  // set. Editing either one silently invalidates it, so it is dropped rather
  // than reused against figures it never saw.
  const referenceSignature = `${references.map((item) => item.id).join("|")}#${uploadedReferences.map((item) => item.id).join("|")}`;
  const designSignature = useRef("");
  useEffect(() => {
    const next = `${figurePlan}\u0000${referenceSignature}`;
    if (!designSignature.current) { designSignature.current = next; return; }
    if (designSignature.current === next) return;
    designSignature.current = next;
    setDesignContract(null);
    setDesignPicks({ representative: [], imageRefs: [] });
  }, [figurePlan, referenceSignature]);

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
  const updateForgeFilter = (key: keyof Filters, value: string | number) => setForgeFilters((current) => ({ ...current, [key]: value }));
  // The paper-level figure type is the reader's intent, so it seeds the gallery
  // filter instead of living only inside the plan prompt.
  function changeFigureType(value: string) {
    setFigureType(value);
    const pattern = FIGURE_TYPE_PATTERN[value] ?? "all";
    setForgeFilters((current) => (current.pattern === pattern ? current : { ...current, pattern }));
  }
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
    if (!file.name.toLowerCase().endsWith(".pdf") || file.size > 25 * 1024 * 1024) { setForgeError(t("Choose a PDF smaller than 25 MB.")); return; }
    const sequence = ++pdfSequence.current;
    setPaperInputId(crypto.randomUUID()); setResultId(null); setResultNotice("");
    pdfPages.current = []; setPaperContent(""); setPaperTitle(""); setPdfName(""); setPdfFile(null); setPdfStatus(""); setForgeError(""); setFigurePlan("");
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
        (forgeFilters.venue === "all" || figure.venue === forgeFilters.venue.toLowerCase()) &&
        (forgeFilters.year === "all" || figure.year === forgeFilters.year) &&
        (forgeFilters.pattern === "all" || figure.pattern === forgeFilters.pattern) &&
        (forgeFilters.tier === "all" || (forgeFilters.tier === "best" ? Boolean(figure.award) : figure.tier === forgeFilters.tier && !figure.award))
      ).map(({ i }) => i);
      const show = (vector?: number[]) => {
        if (retrievalSequence.current !== sequence) return;
        setRecommendations(searchRetrievalIndex(index, query, candidates, vector).filter(({ figure }) => isFigure(figure)) as Array<{ figure: Figure; score: number | null; reason?: string; keywords?: string[] }>);
        setSearchedQuery(query);
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
    const remote = references.map(referenceBlob);
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
  async function analyzeReferences() {
    if (!window.researchDesk?.analyzeFigureReferences) { setForgeError(t("Figure generation requires the desktop app after restarting it.")); return; }
    setContractBusy(true); setForgeError("");
    try {
      const images = await referenceDataUrls();
      const analysis = await window.researchDesk.analyzeFigureReferences({ references: images, plan: figurePlan, model: visionModel.trim() || undefined, connection });
      setDesignContract(normalizeDesignContract(analysis.contract));
      setDesignPicks({ representative: analysis.representative, imageRefs: analysis.imageRefs });
    } catch (error) { setForgeError(error instanceof Error ? error.message : String(error)); }
    finally { setContractBusy(false); }
  }
  function resetDesign() {
    setDesignContract(null);
    setDesignPicks({ representative: [], imageRefs: [] });
  }
  // Edits are kept raw while typing (a half-typed hex must not be wiped) and are
  // normalized once, right before they are rendered into a prompt.
  function editContract(mutate: (draft: DesignContract) => void) {
    setDesignContract((current) => {
      if (!current) return current;
      const draft: DesignContract = JSON.parse(JSON.stringify(current));
      mutate(draft);
      return draft;
    });
  }
  async function generateFigure() {
    if (!window.researchDesk?.generateFigureSvg || !window.researchDesk?.generateFigureBitmap) { setForgeError(t("Figure generation requires the desktop app after restarting it.")); return; }
    const capturedInput = inputSignature, capturedSource = structuredClone(inputSource);
    setGenerationBusy(true); setForgeError(""); setOutputOrigin(null); setSceneOrigin(null); setGeneratedSvg(""); setSvgWarnings([]); setGeneratedBitmap(""); setReconstructedScene(null); setReconstructionStatus("");
    try {
      const images = await referenceDataUrls();
      let guide = "";
      let selectedImages = images;
      if (forgeMethod === "two-stage") {
        if (!designContract || !contractIsUsable(designContract)) throw new Error(t("Analyze the references first."));
        const contract = normalizeDesignContract(designContract);
        guide = outputMode === "svg" ? renderDesignContract(contract) : renderImageGuide(contract);
        const picks = outputMode === "svg" ? designPicks.representative : designPicks.imageRefs;
        const anchored = picks.map((index) => images[index - 1]).filter(Boolean);
        if (anchored.length >= 2) selectedImages = anchored;
      }
      if (outputMode === "svg") {
        const output = await window.researchDesk.generateFigureSvg({ references: selectedImages, plan: figurePlan, guide, method: forgeMethod, model: visionModel.trim() || undefined, aspect, connection });
        const svg = sanitizeFigureSvg(output.svg);
        setOutputOrigin({ signature: capturedInput, source: capturedSource });
        setGeneratedSvg(svg);
        const scene = parseSvgScene(svg);
        setSvgWarnings(scene.warnings);
        if (!scene.nodes.length) throw new Error("The generated SVG contains no exportable editable objects.");
        setReconstructedScene({ ...scene, svgSource: true } as FigureScene); setSceneOrigin({ signature: capturedInput }); setExportSource("svg");
      } else {
        const output = await window.researchDesk.generateFigureBitmap({ references: selectedImages, plan: figurePlan, guide, method: forgeMethod, model: imageModel.trim(), aspect, resolution: imageResolution, connection });
        const imageResponse = await fetch(output.image, { signal: AbortSignal.timeout(30_000) });
        if (!imageResponse.ok) throw new Error("Could not load the generated image for size verification.");
        const bitmap = await createImageBitmap(await imageResponse.blob());
        try {
          if (!verifyImageRatio(bitmap.width, bitmap.height, aspect) || !verifyImageResolution(bitmap.width, bitmap.height, imageResolution, output.requestedSize)) throw new Error(`Generated image ${bitmap.width}×${bitmap.height} does not match the requested ${aspect} ${imageResolution}.`);
        } finally { bitmap.close(); }
        setOutputOrigin({ signature: capturedInput, source: capturedSource }); setGeneratedBitmap(output.image);
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
    const capturedInput = inputSignature, capturedFile = reconstructionFile, capturedBitmap = generatedBitmap;
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
        if (capturedFile ? liveReconstructionFile.current !== capturedFile : liveInput.current !== capturedInput || liveGeneratedBitmap.current !== capturedBitmap) return;
        setReconstructedScene(result.scene); setSceneOrigin(capturedFile ? { file: capturedFile } : { signature: outputOrigin?.signature || capturedInput }); setExportSource("bitmap");
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

  // Derived view state for the FigureForge workspace: keep every disabled button
  // explained, so the page never leaves the user guessing why nothing happens.
  const selectedReferenceCount = references.length + uploadedReferences.length;
  const referenceFloor = forgeMethod === "two-stage" ? 4 : 2;
  const referenceCeiling = forgeMethod === "two-stage" ? 10 : 4;
  const hasPaperInput = Boolean(pdfFile) || paperContent.trim().length >= 100;
  const modelSetupMessage = forgeProvider === "configured" ? mainModel && !mainModel.hasApiKey ? t("Configure an API model to use AI planning and generation. Local reference browsing remains available.") : "" : !forgeApiKey.trim() || !parseModel.trim() ? t("Add an API key and a paper-analysis model in Model settings to use AI planning and generation.") : "";
  const analyzeBlockedReason = modelSetupMessage || (hasPaperInput ? "" : t("Add a PDF, or at least 100 characters of paper text."));
  const currentSearchQuery = (figurePlan || paperContent || composerText).slice(0, 10_000);
  const resultsStale = searchedQuery !== null && searchedQuery !== currentSearchQuery && recommendations.length > 0;
  const needsContract = forgeMethod === "two-stage" && !(designContract && contractIsUsable(designContract));
  const analyzeReferencesBlockedReason =
    modelSetupMessage || (selectedReferenceCount < referenceFloor ? t("Select at least {n} references in step 2.", { n: referenceFloor })
      : !figurePlan.trim() ? t("Draft a figure plan in step 1 first.") : "");
  const generateBlockedReason =
    modelSetupMessage || (!figurePlan.trim() ? t("Draft a figure plan in step 1 first.")
      : selectedReferenceCount < referenceFloor ? t("Select at least {n} references in step 2.", { n: referenceFloor })
        : selectedReferenceCount > referenceCeiling ? t("This mode accepts at most {n} references.", { n: referenceCeiling })
          : needsContract ? t("Analyze the references first.")
            : outputMode === "bitmap" && !imageModel.trim() ? t("Enter an image model for bitmap output.")
              : "");
  const generateReady = !generationBusy && !reconstructionBusy && !uploadingReferences && !contractBusy && !generateBlockedReason;
  const forgeSteps = [
    { index: 1, label: t("Paper content"), detail: figurePlan.trim() ? t("Plan drafted") : t("Not analyzed"), tone: figurePlan.trim() ? "done" : "idle" },
    { index: 2, label: t("References"), detail: `${selectedReferenceCount} / ${referenceFloor}`, tone: selectedReferenceCount >= referenceFloor ? "done" : "idle" },
    { index: 3, label: t("Generate"), detail: generationBusy ? t("Generating…") : (generatedSvg || generatedBitmap) ? t("Draft ready") : designContract ? t("Contract ready") : t("Not started"), tone: generationBusy ? "busy" : (generatedSvg || generatedBitmap) ? "done" : "idle" },
    { index: 4, label: t("Export"), detail: reconstructedScene ? t("Ready") : t("Not started"), tone: reconstructedScene ? "done" : "idle" },
  ] as const;
  const goToStep = (index: number) => {
    document.getElementById(`forge-step-${index}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  return <main ref={pageRef} className="image-creation-page">
    {owner && bridge && <div className="figure-project-results"><button className="forge-secondary" disabled={resultBusy || analysisBusy || generationBusy || reconstructionBusy || !(paperContent.trim() || figurePlan.trim() || generatedSvg || generatedBitmap)} onClick={() => void saveFigureResult()}>{t("Save figure to project")}</button>{onUseInManuscript && <button className="forge-secondary" disabled={resultBusy || generationBusy || reconstructionBusy || !outputIsCurrent || !(generatedSvg || generatedBitmap)} onClick={() => void useInManuscript()}>{t("Use in manuscript")}</button>}<select aria-label={t("Saved figures")} value={chosenResult} onChange={(event) => setChosenResult(event.target.value)}><option value="">{t("Saved figures")}</option>{savedResults.map((result) => <option key={result.id} value={result.id}>{result.title}</option>)}</select><button className="forge-secondary" disabled={resultBusy || !chosenResult || analysisBusy || generationBusy || reconstructionBusy} onClick={() => void openFigureResult()}>{t("Open saved figure")}</button>{resultNotice && <span role="status">{resultNotice}</span>}</div>}
    {!forgeOpen && <div className="image-creation-tabs">
      <h2 className="image-creation-heading">{t("Diagram references")}</h2>
      <div className="image-creation-actions">
        <label className="image-creation-sort">
          <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort paper diagrams">
            <option value="newest">Sort: Newest</option>
            <option value="venue">Sort: Venue / year</option>
            <option value="oldest">Sort: Oldest</option>
          </select>
          <ChevronDown size={12} aria-hidden="true" />
        </label>
        <button type="button" className="image-creation-proceedings" onClick={onBrowseProceedings}><GraduationCap size={14} />Browse full proceedings</button>
        <button type="button" className="image-creation-forge-button" onClick={() => showForge(true)}><Wand size={14} />FigureForge</button>
      </div>
    </div>}

    {!forgeOpen && <section className="image-creation-panel" aria-label={t("Diagram references")}>
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
    </section>}

    {active && selectedIndex >= 0 && <FigureDialog figure={result[selectedIndex]} index={selectedIndex} total={result.length} onClose={() => setSelectedId(null)} onStep={step} />}
    {active && forgeOpen && <section className="figure-forge-page" aria-label={t("FigureForge planning workspace")}>
      <div className="forge-topbar">
        <button type="button" className="figure-forge-back" onClick={() => showForge(false)}><ArrowLeft size={15} />{t("Diagram references")}</button>{onBrowseChartReferences && <button type="button" className="figure-forge-back" onClick={onBrowseChartReferences}><GraduationCap size={15} />{t("Paper chart references")}</button>}
        <div className="forge-title"><strong>FigureForge</strong><span>{t("Plan a paper figure with references")}</span></div>
      </div>
      {modelSetupMessage && <InlineNotice tone="info" action={<button className="forge-secondary" onClick={() => { if (forgeProvider === "configured" && onOpenModelSettings) onOpenModelSettings(); else if (modelSettingsRef.current) modelSettingsRef.current.open = true; }}>{t("Configure model")}</button>}>{modelSetupMessage}</InlineNotice>}
      <nav className="forge-steps" aria-label={t("FigureForge steps")}>
        {forgeSteps.map((step) => <button type="button" key={step.index} className={`forge-steps-item is-${step.tone}`} onClick={() => goToStep(step.index)}>
          <span className="forge-steps-index" aria-hidden="true">{step.index}</span>
          <span className="forge-steps-copy"><strong>{step.label}</strong><small>{step.detail}</small></span>
        </button>)}
      </nav>

      {forgeError && <p role="alert" className="forge-alert">{forgeError}</p>}

      <div className="figure-forge-body">
        <section className="forge-step" id="forge-step-1" aria-labelledby="forge-step-1-title">
          <header className="forge-step-head">
            <span className="forge-step-index" aria-hidden="true">1</span>
            <div className="forge-step-copy">
              <h2 className="forge-step-title" id="forge-step-1-title">{t("Paper content")}</h2>
              <p className="forge-step-subtitle">{t("Describe the paper and the figure you need.")}</p>
            </div>
            <div className="forge-step-actions">
              <button type="button" className="forge-primary" disabled={pdfBusy || analysisBusy || !hasPaperInput} onClick={() => void analyzePaper()}>{analysisBusy ? t("Analyzing…") : t("Analyze and draft plan")}</button>
              {analyzeBlockedReason && <span className="forge-blocked">{analyzeBlockedReason}</span>}
            </div>
          </header>
          <div className="forge-step-body">
            <div className="forge-grid">
              <label className="forge-field">
                <span className="forge-field-label">{t("Figure type")}</span>
                <select value={figureType} disabled={analysisBusy} onChange={(event) => { changeFigureType(event.target.value); }}>{[["framework", "Framework"], ["architecture", "Architecture"], ["pipeline", "Pipeline"], ["conceptual", "Concept"], ["custom", "Custom"]].map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select>
                <span className="forge-field-hint">{t("Decides which sections the paper is read for, and seeds the reference filter.")}</span>
              </label>
            </div>

            <label className={`forge-drop${pdfName ? " is-loaded" : ""}`}>
              <input className="forge-drop-input" type="file" accept=".pdf,application/pdf" disabled={pdfBusy || analysisBusy} onChange={(event) => { void importPaper(event.target.files?.[0]); event.target.value = ""; }} />
              <Upload size={17} aria-hidden="true" />
              <span className="forge-drop-copy">
                <strong>{pdfBusy ? t("Reading PDF locally…") : pdfName || t("Drop a paper PDF here, or click to choose one")}</strong>
                <small>{pdfName ? pdfStatus : t("Text is extracted on this machine. Only the plan request leaves it.")}</small>
              </span>
              {pdfName && <span className="forge-drop-action">{t("Replace")}</span>}
            </label>

            <details className="forge-disclosure">
              <summary>{t("Paste the paper text instead")}</summary>
              <div className="forge-disclosure-body">
                <label className="forge-field">
                  <span className="forge-field-label">{t("Paper title")}</span>
                  <input value={paperTitle} disabled={analysisBusy} onChange={(event) => { setPaperTitle(event.target.value); }} />
                </label>
                <label className="forge-field forge-field-stacked">
                  <span className="forge-field-label">{t("Abstract or paper content")}</span>
                  <textarea rows={5} value={paperContent} disabled={analysisBusy} onChange={(event) => { pdfPages.current = []; setPdfFile(null); setPdfStatus(t("Using manually edited paper text.")); setPaperContent(event.target.value.slice(0, 60_000)); }} />
                </label>
              </div>
            </details>

            <label className="forge-field forge-field-stacked">
              <span className="forge-field-label">{t("Drawing requirements")}</span>
              <textarea rows={2} value={composerText} disabled={analysisBusy} onChange={(event) => { setComposerText(event.target.value); }} placeholder={t("Optional: layout wishes, must-have modules, terms to use.")} />
            </label>

            <details className="forge-disclosure" ref={modelSettingsRef}>
              <summary>{t("Model settings")}<span className="forge-disclosure-value">{forgeProvider === "configured" ? t("Archimedes main model") : forgeProvider}</span></summary>
              <div className="forge-disclosure-body">
                <label className="forge-field">
                  <span className="forge-field-label">{t("Provider")}</span>
                  <select value={forgeProvider} disabled={analysisBusy || generationBusy || reconstructionBusy || modelsBusy} onChange={(event) => { setForgeProvider(event.target.value); setForgeApiKey(""); setAvailableModels([]); }}><option value="configured">{t("Use Archimedes main model")}</option><option value="infistar">Infistar</option><option value="nonelinear">NoneLinear</option><option value="openai">OpenAI</option><option value="ark">Volcengine Ark</option><option value="siliconflow">SiliconFlow</option><option value="glm">Zhipu GLM</option><option value="qwen">Qwen</option><option value="moonshot">Moonshot</option><option value="anthropic">Anthropic</option><option value="custom">{t("Custom OpenAI-compatible")}</option></select>
                </label>
                {forgeProvider !== "configured" && <>
                  <label className="forge-field">
                    <span className="forge-field-label">{t("API key (this session only)")}</span>
                    <input type="password" autoComplete="off" disabled={analysisBusy || generationBusy || reconstructionBusy || modelsBusy} value={forgeApiKey} onChange={(event) => setForgeApiKey(event.target.value)} />
                  </label>
                  <label className="forge-field">
                    <span className="forge-field-label">{t("Paper analysis model")}</span>
                    <input list="figure-forge-models" disabled={analysisBusy || generationBusy || reconstructionBusy || modelsBusy} value={parseModel} onChange={(event) => setParseModel(event.target.value)} />
                  </label>
                  {forgeProvider === "custom" && <label className="forge-field">
                    <span className="forge-field-label">{t("Model API base URL")}</span>
                    <input type="url" disabled={analysisBusy || generationBusy || reconstructionBusy || modelsBusy} value={forgeBaseUrl} onChange={(event) => setForgeBaseUrl(event.target.value)} placeholder="https://example.com/v1" />
                  </label>}
                </>}
                <datalist id="figure-forge-models">{availableModels.map((model) => <option key={model} value={model} />)}</datalist>
                <div className="forge-inline-actions">
                  <button type="button" className="forge-secondary" disabled={modelsBusy} onClick={() => void refreshFigureModels()}>{modelsBusy ? t("Loading models…") : t("Refresh model list")}</button>
                  <span>{t("API keys stay in memory for this session and are never written to the project.")}</span>
                </div>
              </div>
            </details>

            <label className="forge-field forge-field-stacked forge-plan">
              <span className="forge-field-label">{t("Figure plan")}</span>
              <textarea rows={8} value={figurePlan} disabled={analysisBusy} onChange={(event) => { setFigurePlan(event.target.value); }} placeholder={t("Analyze the paper to draft a plan, then review and edit it.")} />
              <span className="forge-field-hint">{t("Edit freely. This text drives both reference search and generation.")}</span>
            </label>
          </div>
        </section>

        <section className="forge-step" id="forge-step-2" aria-labelledby="forge-step-2-title">
          <header className="forge-step-head">
            <span className="forge-step-index" aria-hidden="true">2</span>
            <div className="forge-step-copy">
              <h2 className="forge-step-title" id="forge-step-2-title">{t("References")}</h2>
              <p className="forge-step-subtitle">{t("Pick published figures whose layout you want to follow.")}</p>
            </div>
            <span className={`forge-pill${selectedReferenceCount >= referenceFloor ? " is-ready" : ""}`}>{selectedReferenceCount} / {referenceFloor}–{referenceCeiling}</span>
            <div className="forge-step-actions">
              <button type="button" className="forge-secondary" onClick={() => showForge(false)}>{t("Diagram references")}</button>
              <button type="button" className="forge-primary" disabled={searchBusy} onClick={() => void findReferences()}>{searchBusy ? t("Searching…") : t("Search references")}</button>
            </div>
          </header>
          <div className="forge-step-body">
            <div className="forge-filters">
              <label className="forge-field"><span className="forge-field-label">{t("Figure type")}</span><select value={forgeFilters.pattern} onChange={(event) => updateForgeFilter("pattern", event.target.value)}><option value="all">{t("All")}</option>{PATTERNS.map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label>
              <label className="forge-field"><span className="forge-field-label">{t("Venue")}</span><select value={forgeFilters.venue} onChange={(event) => updateForgeFilter("venue", event.target.value)}><option value="all">{t("All")}</option>{VENUES.map((venue) => <option key={venue} value={venue}>{venue}</option>)}</select></label>
              <label className="forge-field"><span className="forge-field-label">{t("Year")}</span><select value={forgeFilters.year} onChange={(event) => updateForgeFilter("year", event.target.value === "all" ? "all" : Number(event.target.value))}><option value="all">{t("All")}</option>{YEARS.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
              <label className="forge-field"><span className="forge-field-label">{t("Presentation")}</span><select value={forgeFilters.tier} onChange={(event) => updateForgeFilter("tier", event.target.value)}><option value="all">{t("All")}</option><option value="best">{t("Awarded")}</option><option value="oral">Oral</option><option value="spotlight">Spotlight</option></select></label>
            </div>
            <p className="forge-field-hint">{t("Ranking is based on the plan above. First search downloads the CLIP model; your query stays local.")}</p>
            {resultsStale && <p role="status" className="forge-stale">{t("The plan changed since the last search. Run the search again to re-rank the references.")}</p>}
            {retrievalStatus && <p role="status" className="forge-field-hint">{retrievalStatus}</p>}
            <div className="figure-forge-results">{recommendations.slice(0, visibleRecommendations).map(({ figure, score, reason, keywords }) => { const selected = references.some((item) => item.id === figure.id); return <button type="button" key={figure.id} aria-pressed={selected} title={reason || undefined} disabled={generationBusy || uploadingReferences || (!selected && selectedReferenceCount >= 10)} onClick={() => { setReferences((current) => selected ? current.filter((item) => item.id !== figure.id) : [...current, figure]); }}><img src={imageUrl(figure)} alt="" loading="lazy" /><span>{figure.title}</span><small>{figure.venue.toUpperCase()} · {figure.year}{score !== null ? ` · ${score}` : ""}</small>{keywords && keywords.length > 0 && <em className="figure-forge-results-hits">{keywords.join(" · ")}</em>}<b>{selected ? t("Selected") : t("Select reference")}</b></button>; })}</div>
            {visibleRecommendations < recommendations.length && <button type="button" className="forge-secondary" onClick={() => setVisibleRecommendations((count) => count + 60)}>{t("Show more references")}</button>}

            <div className="forge-selected">
              <header>
                <div><strong>{t("Selected references")}</strong><span className="forge-field-hint">{selectedReferenceCount} / 10</span></div>
                <label className="forge-upload">
                  <input className="forge-drop-input" type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={generationBusy || uploadingReferences} onChange={(event) => { void addUploadedReferences(event.target.files); event.target.value = ""; }} />
                  {t("Upload images")}
                </label>
              </header>
              {selectedReferenceCount === 0 && <p className="forge-field-hint">{t("Nothing selected yet. Choose references above, or upload your own.")}</p>}
              <div className="forge-selected-list">
                {references.map((figure) => <div className="figure-forge-reference" key={figure.id}><img src={imageUrl(figure)} alt="" /><div><strong>{figure.title}</strong><span>{figure.venue.toUpperCase()} · {figure.year}</span><a href={paperUrl(figure)} target="_blank" rel="noreferrer">{t("Open paper")}</a></div><button type="button" disabled={generationBusy} onClick={() => { setReferences((current) => current.filter((item) => item.id !== figure.id)); }} aria-label={t("Remove reference")}> <X size={16} /></button></div>)}
                {uploadedReferences.map((item) => <div className="figure-forge-reference" key={item.id}><img src={item.url} alt="" /><div><strong>{item.name}</strong><span>{t("Uploaded reference")}</span></div><button type="button" disabled={generationBusy} onClick={() => { URL.revokeObjectURL(item.url); setUploadedReferences((current) => current.filter((value) => value.id !== item.id)); }} aria-label={t("Remove reference")}><X size={16} /></button></div>)}
              </div>
              {selectedReferenceCount >= 10 && <p className="forge-field-hint">{t("Maximum of 10 references. Remove one before adding another.")}</p>}
            </div>
          </div>
        </section>

        <section className="forge-step" id="forge-step-3" aria-labelledby="forge-step-3-title">
          <header className="forge-step-head">
            <span className="forge-step-index" aria-hidden="true">3</span>
            <div className="forge-step-copy">
              <h2 className="forge-step-title" id="forge-step-3-title">{t("Generate")}</h2>
              <p className="forge-step-subtitle">{t("The model reads the references, then drafts the figure.")}</p>
            </div>
            <div className="forge-step-actions">
              <button type="button" className="forge-primary" disabled={!generateReady} onClick={() => void generateFigure()}>{generationBusy ? t("Generating…") : t("Generate draft")}</button>
              {generateBlockedReason && <span className="forge-blocked">{generateBlockedReason}</span>}
            </div>
          </header>
          <div className="forge-step-body">
            <div className="forge-grid">
              <div className="forge-field">
                <span className="forge-field-label">{t("Method")}</span>
                <Tabs value={forgeMethod} onChange={(value) => setForgeMethod(value as "direct" | "two-stage")} label={t("Generation method")} variant="segmented">
                  <Tab value="direct">{t("Direct")}</Tab>
                  <Tab value="two-stage">{t("Two-stage")}</Tab>
                </Tabs>
                <span className="forge-field-hint">{forgeMethod === "two-stage" ? t("Reads the references first and draws from their shared layout.") : t("Draws straight from your plan and the references.")}</span>
              </div>
              <div className="forge-field">
                <span className="forge-field-label">{t("Output")}</span>
                <Tabs value={outputMode} onChange={(value) => setOutputMode(value as "svg" | "bitmap")} label={t("Output format")} variant="segmented">
                  <Tab value="svg">SVG</Tab>
                  <Tab value="bitmap">{t("AI bitmap")}</Tab>
                </Tabs>
                <span className="forge-field-hint">{outputMode === "svg" ? t("Editable text and shapes, ready for Figma or PowerPoint.") : t("A rendered image; reconstruct it in step 4 to edit.")}</span>
              </div>
            </div>
            <div className="forge-grid">
              <label className="forge-field"><span className="forge-field-label">{t("Aspect ratio")}</span><select value={aspect} disabled={generationBusy} onChange={(event) => setAspect(event.target.value as Aspect)}>{ASPECTS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              {outputMode === "bitmap" && <label className="forge-field"><span className="forge-field-label">{t("Resolution")}</span><select value={imageResolution} disabled={generationBusy} onChange={(event) => setImageResolution(event.target.value)}><option>1K</option><option>2K</option><option>4K</option></select></label>}
            </div>
            <details className="forge-disclosure">
              <summary>{t("Advanced model options")}</summary>
              <div className="forge-disclosure-body">
                <label className="forge-field">
                  <span className="forge-field-label">{t("Vision model override (optional)")}</span>
                  <input list="figure-forge-models" value={visionModel} disabled={generationBusy || reconstructionBusy} onChange={(event) => setVisionModel(event.target.value)} placeholder={t("Uses the configured main model by default")} />
                </label>
                {outputMode === "bitmap" && <label className="forge-field">
                  <span className="forge-field-label">{t("Image generation model")}</span>
                  <input list="figure-forge-models" value={imageModel} disabled={generationBusy} onChange={(event) => setImageModel(event.target.value)} placeholder="gpt-image-1" />
                </label>}
                <p className="forge-field-hint">{t("Selected references and your plan are sent to this provider. Use an image-capable model; charges may apply.")}</p>
              </div>
            </details>
            {forgeMethod === "two-stage" && <div className="forge-contract">
              <header className="forge-contract-head">
                <div>
                  <strong>{t("Reference contract")}</strong>
                  <span className="forge-field-hint">{designContract ? t("Measured from the selected references. Edit anything before generating.") : t("Reads the selected references and measures their shared layout, palette and type scale.")}</span>
                </div>
                <button type="button" className="forge-secondary" disabled={contractBusy || generationBusy || Boolean(analyzeReferencesBlockedReason)} onClick={() => void analyzeReferences()}>{contractBusy ? t("Analyzing…") : designContract ? t("Analyze again") : t("Analyze references")}</button>
              </header>
              {!designContract && analyzeReferencesBlockedReason && <p className="forge-blocked forge-blocked-inline">{analyzeReferencesBlockedReason}</p>}
              {designContract && <div className="forge-contract-body">
                <label className="forge-field forge-field-stacked">
                  <span className="forge-field-label">{t("Shared layout")}</span>
                  <textarea rows={2} value={designContract.layout} onChange={(event) => editContract((draft) => { draft.layout = event.target.value; })} />
                </label>
                <div className="forge-metrics">
                  <div className="forge-metric">
                    <span className="forge-field-label">{t("Palette")}</span>
                    <div className="forge-swatches">{(["background", "primary", "accent", "neutral"] as const).map((key) => <label key={key} className="forge-swatch"><i style={{ background: designContract.palette[key] || "transparent" }} aria-hidden="true" /><input className="forge-compact" value={designContract.palette[key]} aria-label={t("Palette color {name}", { name: key })} onChange={(event) => editContract((draft) => { draft.palette[key] = event.target.value; })} /></label>)}</div>
                  </div>
                  <div className="forge-metric">
                    <span className="forge-field-label">{t("Type scale")}</span>
                    <div className="forge-numbers">{[["title", t("Title")], ["panelHeader", t("Header")], ["label", t("Label")], ["note", t("Note")]].map(([key, label]) => <label key={key} className="forge-number"><span>{label}</span><input className="forge-compact" type="number" value={designContract.typography[key as "title"] || ""} onChange={(event) => editContract((draft) => { draft.typography[key as "title"] = Number(event.target.value); })} /></label>)}</div>
                  </div>
                  <div className="forge-metric">
                    <span className="forge-field-label">{t("Strokes")}</span>
                    <div className="forge-numbers">{[["box", t("Box")], ["arrow", t("Arrow")], ["connector", t("Line")]].map(([key, label]) => <label key={key} className="forge-number"><span>{label}</span><input className="forge-compact" type="number" value={designContract.strokes[key as "box"] || ""} onChange={(event) => editContract((draft) => { draft.strokes[key as "box"] = Number(event.target.value); })} /></label>)}</div>
                  </div>
                  <div className="forge-metric">
                    <span className="forge-field-label">{t("Density")}</span>
                    <div className="forge-numbers">{[["panels", t("Panels")], ["modulesPerPanel", t("Per panel")], ["connectors", t("Links")]].map(([key, label]) => <label key={key} className="forge-number"><span>{label}</span><input className="forge-compact" type="number" value={designContract.density[key as "panels"] || ""} onChange={(event) => editContract((draft) => { draft.density[key as "panels"] = Number(event.target.value); })} /></label>)}</div>
                  </div>
                </div>
                {designContract.panels.length > 0 && <p className="forge-field-hint">{t("Panels: {list}", { list: designContract.panels.map((panel) => panel.name || panel.role).filter(Boolean).join(" · ") })}</p>}
                <details className="forge-disclosure">
                  <summary>{t("Elements, hierarchy and caveats")}</summary>
                  <div className="forge-disclosure-body">
                    <label className="forge-field forge-field-stacked"><span className="forge-field-label">{t("Recurring elements")}</span><textarea rows={2} value={designContract.elements} onChange={(event) => editContract((draft) => { draft.elements = event.target.value; })} /></label>
                    <label className="forge-field forge-field-stacked"><span className="forge-field-label">{t("Information hierarchy")}</span><textarea rows={2} value={designContract.hierarchy} onChange={(event) => editContract((draft) => { draft.hierarchy = event.target.value; })} /></label>
                    <label className="forge-field forge-field-stacked"><span className="forge-field-label">{t("Caveats")}</span><textarea rows={2} value={designContract.caveats} onChange={(event) => editContract((draft) => { draft.caveats = event.target.value; })} /></label>
                  </div>
                </details>
              </div>}
            </div>}
            {(generatedSvg || generatedBitmap) && !outputIsCurrent && <InlineNotice tone="warning">{t("This output was generated from earlier inputs. It remains available to preview and download; generate again before saving it with the current inputs.")}</InlineNotice>}
            {generatedSvg && <div className="figure-forge-output"><img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(generatedSvg)}`} alt={t("Generated figure preview")} /><button type="button" className="forge-secondary" onClick={downloadSvg}>{t("Download SVG")}</button></div>}
            {svgWarnings.length > 0 && <p role="status" className="forge-field-hint">{svgWarnings.join("; ")}</p>}
            {generatedBitmap && <div className="figure-forge-output"><img src={generatedBitmap} alt={t("Generated figure preview")} /><a href={generatedBitmap} download="figure.png" target="_blank" rel="noreferrer">{t("Download bitmap")}</a></div>}
          </div>
        </section>

        <section className="forge-step" id="forge-step-4" aria-labelledby="forge-step-4-title">
          <header className="forge-step-head">
            <span className="forge-step-index" aria-hidden="true">4</span>
            <div className="forge-step-copy">
              <h2 className="forge-step-title" id="forge-step-4-title">{t("Export")}</h2>
              <p className="forge-step-subtitle">{t("Hand the draft over as editable vector objects.")}</p>
            </div>
            {reconstructedScene && <div className="forge-step-actions">
              <button type="button" className="forge-primary" onClick={() => void downloadReconstruction()}>{t("Export editable figure")}</button>
            </div>}
          </header>
          <div className="forge-step-body">
            <p className="forge-field-hint">{outputMode === "svg" ? t("SVG drafts are already editable — choose a format and export. Reconstruct only to turn a bitmap into objects.") : t("Reconstruct the bitmap into editable objects, then export.")}</p>
            <label className={`forge-drop${reconstructionFile ? " is-loaded" : ""}`}>
              <input className="forge-drop-input" type="file" accept="image/png,image/jpeg,image/webp" disabled={reconstructionBusy} onChange={(event) => { setReconstructionFile(event.target.files?.[0] ?? null); setReconstructedScene(null); }} />
              <ImagePlus size={17} aria-hidden="true" />
              <span className="forge-drop-copy">
                <strong>{reconstructionFile ? reconstructionFile.name : t("Drop a bitmap here, or use the generated image")}</strong>
                <small>{t("Reconstruction makes several model calls; check the result before use.")}</small>
              </span>
            </label>
            <div className="forge-inline-actions">
              <button type="button" className="forge-secondary" disabled={reconstructionBusy || generationBusy || Boolean(modelSetupMessage) || (!reconstructionFile && !generatedBitmap)} onClick={() => void reconstructBitmap()}>{reconstructionBusy ? t("Reconstructing…") : t("Reconstruct editable objects")}</button>
              {!reconstructionFile && !generatedBitmap && <span>{t("Generate a bitmap draft first, or upload one.")}</span>}
            </div>
            {reconstructionStatus && <p role="status" className="forge-field-hint">{reconstructionStatus}</p>}
            {reconstructedScene && <>
              <div className="figure-forge-output"><img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(exportSource === "svg" ? generatedSvg : sceneToSvgString(reconstructedScene))}`} alt={t("Reconstructed figure preview")} /></div>
              <div className="forge-grid">
                <label className="forge-field"><span className="forge-field-label">{t("Export format")}</span><select value={exportFormat} onChange={(event) => setExportFormat(event.target.value as typeof exportFormat)}><option value="svg">SVG</option><option value="pptx">PPTX</option><option value="vsdx">VSDX</option><option value="drawio">draw.io</option></select></label>
                <label className="forge-field"><span className="forge-field-label">{t("Export font")}</span><select value={exportFont} onChange={(event) => setExportFont(event.target.value)}><option value="">{t("Keep generated fonts")}</option><option>Arial</option><option>Helvetica</option><option>Times New Roman</option><option>Noto Sans</option></select></label>
              </div>
            </>}
            <p className="forge-footnote">{t("References belong to their authors. Check each paper's license before reuse.")}</p>
          </div>
        </section>
      </div>
    </section>}
  </main>;
}
