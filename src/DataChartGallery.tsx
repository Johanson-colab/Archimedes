import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, ExternalLink, ImageOff, LoaderCircle, Search, SlidersHorizontal, X } from "lucide-react";
import { useDialogFocus } from "./useDialogFocus";

const SOURCE_ROOT = "https://paperfigure.net/";
const SEARCH_URL = `${SOURCE_ROOT}api/search`;
const MAX_RESULTS = 50;
const AREAS = [
  { id: "ml", label: "Machine learning", venues: ["NeurIPS", "ICML", "ICLR", "COLM", "JMLR", "KDD", "MLSys", "TMLR"] },
  { id: "ai", label: "Artificial intelligence", venues: ["AAAI", "IJCAI"] },
  { id: "vision", label: "Computer vision", venues: ["CVPR", "ICCV", "ECCV"] },
  { id: "nlp", label: "Natural language", venues: ["ACL", "EMNLP", "NAACL", "TACL"] },
] as const;
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
type Area = typeof AREAS[number]["id"];
type ChartType = typeof CHART_TYPES[number]["id"] | "all";
type ChartFigure = {
  id: string;
  paper: string;
  venue: string;
  year: string;
  area: Area;
  category: Category;
  chart_types: string[];
  caption: string;
  tags: string[];
  figure: string;
  image: string;
  thumb: string;
  page: string;
};
type SearchResponse = { results: ChartFigure[]; total: number };

function isChartFigure(value: unknown): value is ChartFigure {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && typeof row.paper === "string"
    && typeof row.venue === "string" && typeof row.year === "string"
    && typeof row.area === "string" && typeof row.category === "string"
    && Array.isArray(row.chart_types) && row.chart_types.every((type) => typeof type === "string")
    && typeof row.caption === "string" && Array.isArray(row.tags)
    && typeof row.figure === "string" && typeof row.image === "string"
    && typeof row.thumb === "string" && typeof row.page === "string";
}

function trustedUrl(value: string, host: string) {
  try { const url = new URL(value); return url.protocol === "https:" && url.hostname === host ? url.href : ""; }
  catch { return ""; }
}

function allowedFigure(figure: ChartFigure, area: Area, category: Category, venue: string, chart: ChartType) {
  const areaConfig = AREAS.find((item) => item.id === area);
  const allowedVenues: readonly string[] = areaConfig?.venues ?? [];
  if (figure.area !== area || figure.category !== category || !allowedVenues.includes(figure.venue)) return false;
  if (venue !== "all" && figure.venue !== venue) return false;
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
  return <article className="chart-reference-card">
    <button type="button" className="chart-reference-preview" onClick={onOpen} aria-label={`View ${figure.paper}, ${chartLabel(figure)}`}>
      {failed ? <span className="gallery-image-failed"><ImageOff size={24} />Preview unavailable</span>
        : <img src={figure.thumb} alt={figure.caption || `${chartLabel(figure)} from ${figure.paper}`} loading="lazy" decoding="async" onError={() => setFailed(true)} />}
    </button>
    <div className="chart-reference-info">
      <div className="chart-reference-meta"><span>{chartLabel(figure)}</span><span>{figure.venue} · {figure.year}</span></div>
      <h3>{figure.paper}</h3>
      <p>{figure.caption}</p>
      <button type="button" onClick={onOpen}>Inspect figure <ArrowRight size={13} /></button>
    </div>
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
  const [area, setArea] = useState<Area>("ml");
  const [venue, setVenue] = useState("all");
  const [chart, setChart] = useState<ChartType>("all");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [figures, setFigures] = useState<ChartFigure[]>([]);
  const [sourceTotal, setSourceTotal] = useState(0);
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
    const controller = new AbortController();
    const url = new URL(SEARCH_URL);
    url.searchParams.set("cat", category);
    url.searchParams.set("area", area);
    url.searchParams.set("n", String(MAX_RESULTS));
    if (venue !== "all") url.searchParams.set("venue", venue);
    if (category === "data" && chart !== "all") url.searchParams.set("chart", chart);
    if (debouncedQuery) url.searchParams.set("q", debouncedQuery);
    setLoading(true);
    setError("");
    setSelectedId(null);
    setFigures([]);
    fetch(url.href, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error(`Search returned HTTP ${response.status}.`);
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== "object" || !Array.isArray((payload as SearchResponse).results)) throw new Error("The chart search format has changed.");
      const data = payload as SearchResponse;
      setSourceTotal(typeof data.total === "number" ? data.total : 0);
      setFigures(data.results.filter(isChartFigure).filter((figure) => allowedFigure(figure, area, category, venue, chart)));
    }).catch((failure: unknown) => {
      if (controller.signal.aborted) return;
      setError(failure instanceof Error ? failure.message : String(failure));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [area, category, chart, debouncedQuery, retry, venue]);

  const areaConfig = AREAS.find((item) => item.id === area)!;
  const activeFilterCount = Number(area !== "ml") + Number(venue !== "all") + Number(category !== "data") + Number(category === "data" && chart !== "all");
  const resetFilters = () => { setArea("ml"); setVenue("all"); setCategory("data"); setChart("all"); setQuery(""); };
  const selectedIndex = useMemo(() => figures.findIndex((figure) => figure.id === selectedId), [figures, selectedId]);
  const sourceLink = new URL("en/", SOURCE_ROOT);
  sourceLink.searchParams.set("cat", category);
  sourceLink.searchParams.set("area", area);
  if (venue !== "all") sourceLink.searchParams.set("venue", venue);
  if (category === "data" && chart !== "all") sourceLink.searchParams.set("chart", chart);
  if (debouncedQuery) sourceLink.searchParams.set("q", debouncedQuery);
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
          <div className="gallery-facet"><span className="gallery-facet-label">Field</span><div className="gallery-facet-options">{AREAS.map((item) => <button type="button" key={item.id} className={area === item.id ? "selected" : ""} aria-pressed={area === item.id} onClick={() => { setArea(item.id); setVenue("all"); }}>{item.label}</button>)}</div></div>
          <div className="gallery-facet"><span className="gallery-facet-label">Content</span><div className="gallery-facet-options"><button type="button" className={category === "data" ? "selected" : ""} aria-pressed={category === "data"} onClick={() => setCategory("data")}>Data charts</button><button type="button" className={category === "table" ? "selected" : ""} aria-pressed={category === "table"} onClick={() => setCategory("table")}>Tables</button></div></div>
          <label className="gallery-facet"><span className="gallery-facet-label">Venue</span><select className="data-chart-filter-select" value={venue} onChange={(event) => setVenue(event.target.value)} aria-label="Filter by venue"><option value="all">All {areaConfig.label}</option>{areaConfig.venues.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          {category === "data" && <div className="gallery-facet"><span className="gallery-facet-label">Chart type</span><div className="gallery-facet-options"><button type="button" className={chart === "all" ? "selected" : ""} aria-pressed={chart === "all"} onClick={() => setChart("all")}>All</button>{CHART_TYPES.map((item) => <button type="button" key={item.id} className={chart === item.id ? "selected" : ""} aria-pressed={chart === item.id} onClick={() => setChart(item.id)}>{item.label}</button>)}</div></div>}
        </div>}
      </div>
    </div>
    <div className="data-chart-results"><span>{loading ? "Searching…" : error ? "Search unavailable" : `${figures.length} references shown${sourceTotal > MAX_RESULTS ? ` · ${sourceTotal.toLocaleString()} source matches; first 50 checked` : ""}`}</span><a href={sourceLink.href} target="_blank" rel="noreferrer">Explore more at source <ExternalLink size={13} /></a></div>
    {loading ? <div className="gallery-state"><LoaderCircle className="spin" size={25} /><strong>Loading references…</strong></div>
      : error ? <div className="gallery-state"><ImageOff size={25} /><strong>Could not load data charts</strong><p>{error}</p><button type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button></div>
        : !figures.length ? <div className="gallery-state"><Search size={25} /><strong>No matching references in this batch</strong><p>Try another keyword, venue, or chart type. The source returns at most 50 results per search.</p></div>
          : <div className="data-chart-grid">{figures.map((figure) => <ChartCard key={figure.id} figure={figure} onOpen={() => setSelectedId(figure.id)} />)}</div>}
    <p className="data-chart-credit">Image rights remain with the paper authors and publishers. References and images are served by <a href={SOURCE_ROOT} target="_blank" rel="noreferrer">Paper Figure Library</a>; check the paper license before reuse.</p>
    {active && selectedIndex >= 0 && <ChartDialog figures={figures} index={selectedIndex} onClose={() => setSelectedId(null)} onStep={step} />}
  </section>;
}
