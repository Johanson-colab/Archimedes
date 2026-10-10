import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, ExternalLink, ImageOff, Images, LoaderCircle, Search, SlidersHorizontal, X } from "lucide-react";

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

function imageUrl(figure: Figure) { return `${GALLERY_ROOT}${figure.image}`; }
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

function FigureCard({ figure, onOpen }: { figure: Figure; onOpen: () => void }) {
  const [failed, setFailed] = useState(false);
  const source = paperUrl(figure);
  return <article className="gallery-card">
    <button type="button" className="gallery-card-image" onClick={onOpen} aria-label={`View figure: ${figure.title}`}
      style={{ aspectRatio: figure.w && figure.h ? `${figure.w} / ${figure.h}` : "1.6" }}>
      {failed ? <span className="gallery-image-failed"><ImageOff size={22} />Image unavailable</span> :
        <img src={imageUrl(figure)} alt={`Figure from ${figure.title}`} loading="lazy" decoding="async" onError={() => setFailed(true)} />}
      <span className="gallery-image-open">View figure</span>
    </button>
    <div className="gallery-card-body">
      <div className="gallery-card-meta"><span className={`gallery-venue gallery-venue-${figure.venue}`}>{figure.venue.toUpperCase()}</span><span>{figure.year}</span><span>{PATTERNS.find(([id]) => id === figure.pattern)?.[1] || figure.pattern}</span>{tierName(figure) && <span className="gallery-tier">{tierName(figure)}</span>}</div>
      <h2>{figure.title}</h2>
      <p>{figure.authors.slice(0, 4).join(", ")}{figure.authors.length > 4 ? " et al." : ""}</p>
      {source && <a href={source} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>Open paper <ExternalLink size={13} /></a>}
    </div>
  </article>;
}

function FigureDialog({ figure, index, total, onClose, onStep }: {
  figure: Figure; index: number; total: number; onClose: () => void; onStep: (step: number) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") onStep(-1);
      if (event.key === "ArrowRight") onStep(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onStep]);
  const source = paperUrl(figure);
  return createPortal(<div className="gallery-dialog-backdrop" onMouseDown={onClose}>
    <section className="gallery-dialog" role="dialog" aria-modal="true" aria-label={`Figure from ${figure.title}`} onMouseDown={(event) => event.stopPropagation()}>
      <header><span>{index + 1} / {total.toLocaleString()}</span><button ref={closeRef} type="button" title="Close figure" aria-label="Close figure" onClick={onClose}><X size={20} /></button></header>
      <div className="gallery-dialog-content"><button type="button" aria-label="Previous figure" title="Previous figure" onClick={() => onStep(-1)}><ArrowLeft size={21} /></button><img src={imageUrl(figure)} alt={`Figure from ${figure.title}`} /><button type="button" aria-label="Next figure" title="Next figure" onClick={() => onStep(1)}><ArrowRight size={21} /></button></div>
      <footer><div><span className="gallery-dialog-kicker">{figure.venue.toUpperCase()} {figure.year} · {PATTERNS.find(([id]) => id === figure.pattern)?.[1] || figure.pattern}{tierName(figure) ? ` · ${tierName(figure)}` : ""}</span><h2>{figure.title}</h2><p>{figure.authors.join(", ")}</p></div><div className="gallery-dialog-links">{source && <a href={source} target="_blank" rel="noreferrer">Open paper <ExternalLink size={14} /></a>}<a href={imageUrl(figure)} target="_blank" rel="noreferrer">Image source <ExternalLink size={14} /></a></div></footer>
    </section>
  </div>, document.body);
}

export default function GalleryView({ active }: { active: boolean }) {
  const [figures, setFigures] = useState<Figure[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [sort, setSort] = useState("newest");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function refresh(force = false) {
    setLoading(true); setError("");
    try { setFigures(await loadCatalog(force)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);
  useEffect(() => { if (!active) setSelectedId(null); }, [active]);
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
  const updateFilter = (key: keyof Filters, value: string | number) => setFilters((current) => ({ ...current, [key]: value }));
  const step = (direction: number) => { if (selectedIndex >= 0) setSelectedId(result[(selectedIndex + direction + result.length) % result.length].id); };

  return <main className="gallery-page">
    <header className="gallery-header"><div><span className="eyebrow">Visual research index</span><h1>Gallery</h1><p>Figures from peer-reviewed AI conference papers.</p></div><span className="gallery-header-icon"><Images size={23} /></span></header>
    <div className="gallery-controls"><label className="gallery-search"><Search size={17} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search paper title, author, or topic" aria-label="Search gallery" /></label><label className="gallery-sort"><SlidersHorizontal size={15} /><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort gallery"><option value="newest">Newest first</option><option value="venue">Venue / year</option><option value="oldest">Oldest first</option></select></label></div>
    <div className="gallery-filters">
      <Facet label="Venue" value={filters.venue} onChange={(value) => updateFilter("venue", value)} options={[{ value: "all", label: "All" }, ...VENUES.map((venue) => ({ value: venue, label: venue, count: figures.filter((figure) => figure.venue === venue.toLowerCase()).length }))]} />
      <Facet label="Year" value={filters.year} onChange={(value) => updateFilter("year", value)} options={[{ value: "all", label: "All" }, ...YEARS.map((year) => ({ value: year, label: String(year) }))]} />
      <Facet label="Presentation" value={filters.tier} onChange={(value) => updateFilter("tier", value)} options={[{ value: "all", label: "All" }, { value: "best", label: "Awarded" }, { value: "oral", label: "Oral" }, { value: "spotlight", label: "Spotlight" }]} />
      <Facet label="Figure type" value={filters.pattern} onChange={(value) => updateFilter("pattern", value)} options={[{ value: "all", label: "All" }, ...PATTERNS.map(([value, label]) => ({ value, label }))]} />
    </div>
    <div className="gallery-results-bar"><strong>{result.length.toLocaleString()}</strong><span>figures{figures.length && result.length !== figures.length ? ` of ${figures.length.toLocaleString()}` : ""}</span><a href={GALLERY_ROOT} target="_blank" rel="noreferrer">Curated by Top-Conf Figure Gallery <ExternalLink size={13} /></a></div>
    {loading && !figures.length ? <div className="gallery-state"><LoaderCircle className="spin" size={25} /><strong>Loading figures…</strong></div>
      : error && !figures.length ? <div className="gallery-state"><ImageOff size={25} /><strong>Could not load the gallery</strong><p>{error}</p><button type="button" onClick={() => void refresh(true)}>Retry</button></div>
        : !result.length ? <div className="gallery-state"><Search size={25} /><strong>No figures match these filters</strong><button type="button" onClick={() => { setQuery(""); setFilters(INITIAL_FILTERS); }}>Clear filters</button></div>
          : <><div className="gallery-grid">{shown.map((figure) => <FigureCard key={figure.id} figure={figure} onOpen={() => setSelectedId(figure.id)} />)}</div>{visibleCount < result.length && <div className="gallery-load-more"><button type="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>Show more figures <span>{Math.min(visibleCount, result.length).toLocaleString()} / {result.length.toLocaleString()}</span></button></div>}</>}
    <p className="gallery-credit">Figures belong to their paper authors and publishers. Metadata and hosted images: <a href={GALLERY_ROOT} target="_blank" rel="noreferrer">Top-Conf Figure Gallery</a>. Check each paper's license before reuse.</p>
    {active && selectedIndex >= 0 && <FigureDialog figure={result[selectedIndex]} index={selectedIndex} total={result.length} onClose={() => setSelectedId(null)} onStep={step} />}
  </main>;
}
