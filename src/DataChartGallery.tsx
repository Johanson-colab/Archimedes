import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, ExternalLink, ImageOff, LoaderCircle, Search, SlidersHorizontal, X } from "lucide-react";
import { useDialogFocus } from "./useDialogFocus";

const SOURCE_ROOT = "https://paperfigure.net/";
const IMAGE_ROOT = "https://img.paperfigure.net/";
const SHARDS = [0, 1, 2, 3].map((index) => `${SOURCE_ROOT}data/index-${index}.json`);
const PAGE_SIZE = 48;
const CHART_TYPES = [
  { id: "bar", label: "Bar" }, { id: "line", label: "Line" },
  { id: "scatter", label: "Scatter" }, { id: "point", label: "Point & error bar" },
  { id: "pie", label: "Pie" }, { id: "heatmap", label: "Heatmap" },
  { id: "contour", label: "Contour" }, { id: "histogram", label: "Histogram" },
  { id: "box", label: "Box & violin" }, { id: "radar", label: "Radar" },
  { id: "confusion_matrix", label: "Confusion matrix" },
] as const;
const ALLOWED_CHARTS = new Set<string>(CHART_TYPES.map(({ id }) => id));
const EXCLUDED_CHARTS = new Set(["area", "other", "mixed"]);

type Category = "data" | "table";
type ChartType = typeof CHART_TYPES[number]["id"] | "all";
type ChartFigure = {
  id: string;
  paper: string;
  venue: string;
  year: string;
  category: Category;
  chart_types: string[];
  caption: string;
  tags: string[];
  figure: string;
  image: string;
  thumb: string;
  page: string;
};
type RawFigure = { fig_id?: unknown; num?: unknown; caption?: unknown; kind?: unknown; thumb?: unknown; full?: unknown; chart_guess?: unknown; charts?: unknown; vision?: unknown };
type RawPaper = { paper_key?: unknown; meta?: unknown; figures?: unknown };
let catalogPromise: Promise<ChartFigure[]> | null = null;

function trustedUrl(value: string, host: string) {
  try { const url = new URL(value); return url.protocol === "https:" && url.hostname === host ? url.href : ""; }
  catch { return ""; }
}

function normalizeChart(value: unknown) {
  if (value === "violin") return "box";
  if (value === "mixed") return "other";
  return typeof value === "string" ? value : "";
}

function imageUrl(value: unknown) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value, IMAGE_ROOT);
    return url.protocol === "https:" && url.hostname === "img.paperfigure.net" && url.pathname.startsWith("/figs/") ? url.href : "";
  } catch { return ""; }
}

function flattenCatalog(payloads: unknown[]): ChartFigure[] {
  const figures: ChartFigure[] = [];
  for (const payload of payloads) {
    if (!payload || typeof payload !== "object" || !Array.isArray((payload as { papers?: unknown }).papers)) throw new Error("The figure catalogue format has changed.");
    for (const paper of (payload as { papers: RawPaper[] }).papers) {
      if (!paper || typeof paper !== "object" || !Array.isArray(paper.figures)) continue;
      const meta = paper.meta && typeof paper.meta === "object" ? paper.meta as Record<string, unknown> : {};
      for (const raw of paper.figures as RawFigure[]) {
        if (!raw || typeof raw !== "object" || typeof raw.fig_id !== "string") continue;
        const vision = raw.vision && typeof raw.vision === "object" ? raw.vision as Record<string, unknown> : {};
        const sourceCategory = typeof vision.category === "string" ? vision.category
          : raw.kind === "result" ? "data" : raw.kind === "table" ? "table" : "other";
        const category = sourceCategory === "data" || sourceCategory === "table" ? sourceCategory : null;
        if (!category) continue;
        const visionChart = normalizeChart(vision.chart_type);
        const primary = (!visionChart || visionChart === "other") ? normalizeChart(raw.chart_guess) || visionChart : visionChart;
        const chartTypes = Array.isArray(raw.charts) && raw.charts.length > 1
          ? [...new Set(raw.charts.map(normalizeChart))] : [primary];
        const figure: ChartFigure = {
          id: raw.fig_id,
          paper: typeof meta.title === "string" ? meta.title : String(paper.paper_key || raw.fig_id),
          venue: typeof meta.venue === "string" ? meta.venue : "",
          year: typeof meta.year === "string" ? meta.year : "",
          category,
          chart_types: category === "data" ? chartTypes : [],
          caption: typeof raw.caption === "string" ? raw.caption : "",
          tags: Array.isArray(vision.tags) ? vision.tags.filter((tag): tag is string => typeof tag === "string") : [],
          figure: String(raw.num ?? ""),
          image: imageUrl(raw.full),
          thumb: imageUrl(raw.thumb),
          page: `${SOURCE_ROOT}en/#fig=${encodeURIComponent(raw.fig_id)}`,
        };
        if (figure.image && figure.thumb) figures.push(figure);
      }
    }
  }
  return figures.sort((a, b) => Number(b.year || 0) - Number(a.year || 0) || a.paper.localeCompare(b.paper) || a.id.localeCompare(b.id));
}

function loadCatalog(refresh = false) {
  if (refresh) catalogPromise = null;
  if (!catalogPromise) catalogPromise = Promise.all(SHARDS.map(async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Figure catalogue returned HTTP ${response.status}.`);
    return response.json() as Promise<unknown>;
  })).then(flattenCatalog).catch((error: unknown) => { catalogPromise = null; throw error; });
  return catalogPromise;
}

function allowedFigure(figure: ChartFigure, category: Category, chart: ChartType) {
  if (figure.category !== category) return false;
  if (!trustedUrl(figure.thumb, "img.paperfigure.net") || !trustedUrl(figure.image, "img.paperfigure.net")
    || !trustedUrl(figure.page, "paperfigure.net")) return false;
  if (category === "table") return true;
  if (figure.chart_types.some((type) => EXCLUDED_CHARTS.has(type))) return false;
  if (!figure.chart_types.some((type) => ALLOWED_CHARTS.has(type))) return false;
  return chart === "all" || figure.chart_types.includes(chart);
}

function chartLabel(figure: ChartFigure) {
  if (figure.category === "table") return "Table";
  return figure.chart_types.filter((type) => ALLOWED_CHARTS.has(type))
    .map((type) => CHART_TYPES.find((item) => item.id === type)?.label ?? type).join(" · ");
}

function ChartCard({ figure, onOpen }: { figure: ChartFigure; onOpen: () => void }) {
  const [failed, setFailed] = useState(false);
  return <article className="image-creation-card chart-reference-card">
    <button type="button" className="image-creation-card-image chart-reference-preview" onClick={onOpen} aria-label={`View ${figure.paper}, ${chartLabel(figure)}`} title={figure.caption || figure.paper}>
      {failed ? <span className="gallery-image-failed"><ImageOff size={24} />Preview unavailable</span>
        : <img src={figure.thumb} alt={figure.caption || `${chartLabel(figure)} from ${figure.paper}`} loading="lazy" decoding="async" onError={() => setFailed(true)} />}
      <span className="image-creation-card-shade" aria-hidden="true" />
      <span className="image-creation-card-venue">{figure.venue || "Paper"} · {figure.year || "Year unknown"}</span>
      <span className="chart-reference-type">{chartLabel(figure)}</span>
      <span className="image-creation-card-title">{figure.paper}</span>
    </button>
  </article>;
}

function ChartDialog({ figures, index, onClose, onStep }: {
  figures: ChartFigure[]; index: number; onClose: () => void; onStep: (direction: number) => void;
}) {
  const figure = figures[index];
  const dialogRef = useDialogFocus<HTMLElement>(true, onClose);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") onStep(-1);
      if (event.key === "ArrowRight") onStep(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onStep]);
  return createPortal(<div className="gallery-dialog-backdrop" onMouseDown={onClose}>
    <section ref={dialogRef} tabIndex={-1} className="gallery-dialog chart-reference-dialog" role="dialog" aria-modal="true" aria-label={`${chartLabel(figure)} from ${figure.paper}`} onMouseDown={(event) => event.stopPropagation()}>
      <header><span>{index + 1} / {figures.length}</span><button type="button" onClick={onClose} title="Close" aria-label="Close"><X size={20} /></button></header>
      <div className="gallery-dialog-content">
        <button type="button" onClick={() => onStep(-1)} title="Previous" aria-label="Previous figure"><ArrowLeft size={21} /></button>
        <img src={figure.image} alt={figure.caption || figure.paper} />
        <button type="button" onClick={() => onStep(1)} title="Next" aria-label="Next figure"><ArrowRight size={21} /></button>
      </div>
      <footer>
        <div><span className="gallery-dialog-kicker">{figure.venue} {figure.year} · {chartLabel(figure)}{figure.category === "table" ? ` ${figure.figure}` : ` · Figure ${figure.figure}`}</span><h2>{figure.paper}</h2><p className="chart-reference-caption">{figure.caption}</p></div>
        <div className="gallery-dialog-links"><a href={figure.page} target="_blank" rel="noreferrer">Source & paper <ExternalLink size={14} /></a><a href={figure.image} target="_blank" rel="noreferrer">Original image <ExternalLink size={14} /></a></div>
      </footer>
    </section>
  </div>, document.body);
}

export default function DataChartGallery({ active }: { active: boolean }) {
  const [category, setCategory] = useState<Category>("data");
  const [chart, setChart] = useState<ChartType>("all");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [catalog, setCatalog] = useState<ChartFigure[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!active) setSelectedId(null); }, [active]);
  useEffect(() => {
    if (!filterOpen) return;
    function onPointer(event: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) setFilterOpen(false);
    }
    function onKey(event: KeyboardEvent) { if (event.key === "Escape") setFilterOpen(false); }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [filterOpen]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    loadCatalog(retry > 0).then((figures) => {
      if (!cancelled) setCatalog(figures);
    }).catch((failure: unknown) => {
      if (!cancelled) setError(failure instanceof Error ? failure.message : String(failure));
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [retry]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); setSelectedId(null); }, [category, chart, debouncedQuery]);

  const activeFilterCount = Number(category !== "data") + Number(category === "data" && chart !== "all");
  const resetFilters = () => { setCategory("data"); setChart("all"); setQuery(""); };
  const figures = useMemo(() => {
    const words = debouncedQuery.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return catalog.filter((figure) => allowedFigure(figure, category, chart) && words.every((word) =>
      `${figure.paper} ${figure.caption} ${figure.tags.join(" ")} ${figure.venue} ${figure.year}`.toLocaleLowerCase().includes(word)));
  }, [catalog, category, chart, debouncedQuery]);
  const shown = figures.slice(0, visibleCount);
  const selectedIndex = useMemo(() => figures.findIndex((figure) => figure.id === selectedId), [figures, selectedId]);
  const sourceLink = new URL("en/", SOURCE_ROOT);
  sourceLink.searchParams.set("cat", category);
  if (category === "data" && chart !== "all") sourceLink.searchParams.set("chart", chart);
  if (debouncedQuery) sourceLink.searchParams.set("q", debouncedQuery);
  sourceLink.searchParams.set("sort", "year");
  const step = (direction: number) => {
    if (selectedIndex >= 0) setSelectedId(figures[(selectedIndex + direction + figures.length) % figures.length].id);
  };

  return <section className="data-chart-gallery" aria-label="Paper data charts and tables">
    <div className="image-creation-controls data-chart-controls">
      <label className="gallery-search data-chart-search"><Search size={16} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search paper titles, captions, or tags" aria-label="Search charts and tables" /></label>
      <div className="image-creation-filter" ref={filterRef}>
        <button type="button" className={filterOpen ? "image-creation-filter-button active" : "image-creation-filter-button"} onClick={() => setFilterOpen((open) => !open)} aria-haspopup="dialog" aria-expanded={filterOpen} title="Filter data charts">
          <SlidersHorizontal size={14} />Filters{activeFilterCount > 0 && <b>{activeFilterCount}</b>}
        </button>
        {filterOpen && <div className="image-creation-filter-panel data-chart-filter-panel" role="dialog" aria-label="Filter data charts">
          <header><strong>Filter data charts</strong><button type="button" onClick={resetFilters} disabled={!activeFilterCount && !query}>Clear all</button></header>
          <div className="gallery-facet"><span className="gallery-facet-label">Content</span><div className="gallery-facet-options"><button type="button" className={category === "data" ? "selected" : ""} aria-pressed={category === "data"} onClick={() => setCategory("data")}>Data charts</button><button type="button" className={category === "table" ? "selected" : ""} aria-pressed={category === "table"} onClick={() => setCategory("table")}>Tables</button></div></div>
          {category === "data" && <div className="gallery-facet"><span className="gallery-facet-label">Chart type</span><div className="gallery-facet-options"><button type="button" className={chart === "all" ? "selected" : ""} aria-pressed={chart === "all"} onClick={() => setChart("all")}>All</button>{CHART_TYPES.map((item) => <button type="button" key={item.id} className={chart === item.id ? "selected" : ""} aria-pressed={chart === item.id} onClick={() => setChart(item.id)}>{item.label}</button>)}</div></div>}
        </div>}
      </div>
    </div>
    <div className="data-chart-results"><span>{loading ? "Loading full catalogue…" : error ? "Catalogue unavailable" : `Showing ${shown.length.toLocaleString()} of ${figures.length.toLocaleString()} · newest first`}</span><a href={sourceLink.href} target="_blank" rel="noreferrer">Explore more at source <ExternalLink size={13} /></a></div>
    {loading ? <div className="gallery-state"><LoaderCircle className="spin" size={25} /><strong>Loading full figure catalogue…</strong></div>
      : error ? <div className="gallery-state"><ImageOff size={25} /><strong>Could not load data charts</strong><p>{error}</p><button type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button></div>
        : !figures.length ? <div className="gallery-state"><Search size={25} /><strong>No matching references</strong><p>Try another keyword or chart type.</p></div>
          : <><div className="image-creation-grid data-chart-grid">{shown.map((figure) => <ChartCard key={figure.id} figure={figure} onOpen={() => setSelectedId(figure.id)} />)}</div>
            {visibleCount < figures.length && <div className="gallery-load-more"><button type="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>Show more references <span>{shown.length.toLocaleString()} / {figures.length.toLocaleString()}</span></button></div>}</>}
    <p className="data-chart-credit">Image rights remain with the paper authors and publishers. References and images are served by <a href={SOURCE_ROOT} target="_blank" rel="noreferrer">Paper Figure Library</a>; check the paper license before reuse.</p>
    {active && selectedIndex >= 0 && <ChartDialog figures={figures} index={selectedIndex} onClose={() => setSelectedId(null)} onStep={step} />}
  </section>;
}
