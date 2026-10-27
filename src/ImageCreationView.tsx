import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, ArrowUp, ChevronDown, ExternalLink, GraduationCap, ImageOff, ImagePlus, LoaderCircle, Plus, Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { GALLERY_CATALOG_ADDITIONS, GALLERY_CATALOG_VERSION, GALLERY_COVERAGE } from "./gallery-catalog";
import { useDialogFocus } from "./useDialogFocus";

const GALLERY_ROOT = "https://qwdwqfwq.github.io/topconf-paper-figure-gallery/";
const CATALOG_URL = `${GALLERY_ROOT}data/figures.json`;
const PAGE_SIZE = 48;
const VENUES = ["ICLR", "ICML", "NeurIPS", "CVPR", "ICCV", "ECCV", "ACL", "EMNLP", "AAAI"] as const;
const YEARS = [2026, 2025, 2024, 2023] as const;
const PATTERNS = [
  ["conceptual", "Concept"], ["framework", "Framework"], ["pipeline", "Pipeline"],
  ["architecture", "Architecture"], ["teaser", "Teaser"], ["taxonomy", "Taxonomy"],
  ["results", "Results"], ["comparison", "Comparison"],
] as const;
const TEMPLATE_NOTES: Record<string, string> = {
  conceptual: "Explain one idea with a minimal diagram.",
  framework: "Show the components of a method and how they connect.",
  pipeline: "Walk through stages, inputs, and data flow.",
  architecture: "Lay out modules, tensors, and training flow.",
  teaser: "Lead with the problem and the headline result.",
  taxonomy: "Organize related work into a tree or map.",
  results: "Compare methods across benchmarks.",
  comparison: "Put qualitative examples side by side.",
};
const ASPECTS = ["1:1", "4:3", "16:9"] as const;
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
let catalogVersion = GALLERY_CATALOG_VERSION;

function isFigure(value: unknown): value is Figure {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && typeof row.title === "string" && typeof row.venue === "string"
    && typeof row.year === "number" && Array.isArray(row.authors) && typeof row.paper === "string"
    && typeof row.pattern === "string" && typeof row.image === "string"
    && /^images\/(?:iclr|icml|neurips|cvpr|acl|aaai)\/final\/[a-zA-Z0-9_.-]+\.jpg$/.test(row.image);
}

function loadCatalog(refresh = false) {
  if (catalogVersion !== GALLERY_CATALOG_VERSION) {
    catalogPromise = null;
    catalogVersion = GALLERY_CATALOG_VERSION;
  }
  if (refresh) catalogPromise = null;
  if (!catalogPromise) {
    catalogPromise = fetch(CATALOG_URL).then(async (response) => {
      if (!response.ok) throw new Error(`Gallery catalog returned HTTP ${response.status}.`);
      const payload: unknown = await response.json();
      if (!Array.isArray(payload)) throw new Error("The gallery catalog format has changed.");
      const figures = payload.filter(isFigure);
      if (!figures.length) throw new Error("No valid figures were found in the gallery catalog.");
      return [...figures, ...GALLERY_CATALOG_ADDITIONS];
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
      <Sparkles size={12} />Use as template
    </button>
  </article>;
}

function TemplateCard({ label, note, count, preview, onUse }: {
  label: string; note: string; count: number; preview?: Figure; onUse: () => void;
}) {
  return <button type="button" className="image-creation-template" onClick={onUse}>
    <span className="image-creation-template-image">
      {preview ? <img src={imageUrl(preview)} alt="" loading="lazy" decoding="async" /> : <ImageOff size={20} />}
      <span className="image-creation-template-count">{count.toLocaleString()} figures</span>
    </span>
    <span className="image-creation-template-copy">
      <strong>{label}</strong>
      <span>{note}</span>
      <small>Browse examples <ArrowRight size={12} /></small>
    </span>
  </button>;
}

function FigureDialog({ figure, index, total, onClose, onStep }: {
  figure: Figure; index: number; total: number; onClose: () => void; onStep: (step: number) => void;
}) {
  const dialogRef = useDialogFocus<HTMLElement>(true, onClose);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") onStep(-1);
      if (event.key === "ArrowRight") onStep(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onStep]);
  const source = paperUrl(figure);
  return createPortal(<div className="gallery-dialog-backdrop" onMouseDown={onClose}>
    <section ref={dialogRef} tabIndex={-1} className="gallery-dialog" role="dialog" aria-modal="true" aria-label={`Figure from ${figure.title}`} onMouseDown={(event) => event.stopPropagation()}>
      <header><span>{index + 1} / {total.toLocaleString()}</span><button type="button" title="Close figure" aria-label="Close figure" onClick={onClose}><X size={20} /></button></header>
      <div className="gallery-dialog-content"><button type="button" aria-label="Previous figure" title="Previous figure" onClick={() => onStep(-1)}><ArrowLeft size={21} /></button><img src={imageUrl(figure)} alt={`Figure from ${figure.title}`} /><button type="button" aria-label="Next figure" title="Next figure" onClick={() => onStep(1)}><ArrowRight size={21} /></button></div>
      <footer><div><span className="gallery-dialog-kicker">{figure.venue.toUpperCase()} {figure.year} · {patternLabel(figure.pattern)}{tierName(figure) ? ` · ${tierName(figure)}` : ""}</span><h2>{figure.title}</h2><p>{figure.authors.join(", ")}</p></div><div className="gallery-dialog-links">{source && <a href={source} target="_blank" rel="noreferrer">Open paper <ExternalLink size={14} /></a>}<a href={imageUrl(figure)} target="_blank" rel="noreferrer">Image source <ExternalLink size={14} /></a></div></footer>
    </section>
  </div>, document.body);
}

export default function ImageCreationView({ active, onBrowseProceedings }: { active: boolean; onBrowseProceedings: () => void }) {
  const [figures, setFigures] = useState<Figure[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [sort, setSort] = useState("newest");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"gallery" | "templates">("gallery");
  const [filterOpen, setFilterOpen] = useState(false);
  const [reference, setReference] = useState<Figure | null>(null);
  const [composerText, setComposerText] = useState("");
  const [aspect, setAspect] = useState<Aspect>("1:1");
  const composerRef = useRef<HTMLInputElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  async function refresh(force = false) {
    setLoading(true); setError("");
    try { setFigures(await loadCatalog(force)); }
    catch (failure) {
      setFigures(GALLERY_CATALOG_ADDITIONS);
      setError(failure instanceof Error ? failure.message : String(failure));
    }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, [GALLERY_CATALOG_VERSION]);
  useEffect(() => { if (!active) setSelectedId(null); }, [active]);
  useEffect(() => { setSelectedId(null); }, [tab]);
  useEffect(() => { setVisibleCount(PAGE_SIZE); setSelectedId(null); }, [filters, query, sort]);
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
  useEffect(() => { if (reference) composerRef.current?.focus(); }, [reference]);

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
  const templates = useMemo(() => PATTERNS.map(([id, label]) => {
    const matched = figures.filter((figure) => figure.pattern === id);
    return { id, label, note: TEMPLATE_NOTES[id] ?? "", count: matched.length, preview: matched[0] };
  }), [figures]);
  const updateFilter = (key: keyof Filters, value: string | number) => setFilters((current) => ({ ...current, [key]: value }));
  const step = (direction: number) => { if (selectedIndex >= 0) setSelectedId(result[(selectedIndex + direction + result.length) % result.length].id); };
  const resetFilters = () => { setQuery(""); setFilters(INITIAL_FILTERS); };
  const emnlp2026 = GALLERY_COVERAGE.find((row) => row.venue === "emnlp" && row.year === 2026);

  function useAsTemplate(figure: Figure) {
    setReference(figure);
    setComposerText("Adapt this figure for ");
  }
  function browsePattern(pattern: string) {
    setFilters((current) => ({ ...current, pattern }));
    setQuery("");
    setTab("gallery");
  }

  return <main className="image-creation-page">
    <div className="image-creation-tabs" role="tablist" aria-label="Image creation views">
      <button type="button" role="tab" id="image-creation-tab-gallery" aria-selected={tab === "gallery"} aria-controls="image-creation-panel-gallery" tabIndex={tab === "gallery" ? 0 : -1} className={tab === "gallery" ? "image-creation-tab active" : "image-creation-tab"} onClick={() => setTab("gallery")}>
        Gallery <small>{loading && !figures.length ? "…" : result.length.toLocaleString()}</small>
      </button>
      <button type="button" role="tab" id="image-creation-tab-templates" aria-selected={tab === "templates"} aria-controls="image-creation-panel-templates" tabIndex={tab === "templates" ? 0 : -1} className={tab === "templates" ? "image-creation-tab active" : "image-creation-tab"} onClick={() => setTab("templates")}>
        Templates <small>{PATTERNS.length}</small>
      </button>
      <div className="image-creation-actions">
        {tab === "gallery" && <label className="image-creation-sort">
          <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort gallery">
            <option value="newest">Sort: Newest</option>
            <option value="venue">Sort: Venue / year</option>
            <option value="oldest">Sort: Oldest</option>
          </select>
          <ChevronDown size={12} aria-hidden="true" />
        </label>}
        <button type="button" className="image-creation-proceedings" onClick={onBrowseProceedings}><GraduationCap size={14} />Browse full proceedings</button>
      </div>
    </div>

    {tab === "gallery" ? <div className="image-creation-panel" role="tabpanel" id="image-creation-panel-gallery" aria-labelledby="image-creation-tab-gallery">
      <div className="image-creation-controls">
        <label className="gallery-search image-creation-search"><Search size={17} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a published figure, author, or topic" aria-label="Search gallery" /></label>
        <div className="image-creation-filter" ref={filterRef}>
          <button type="button" className={filterOpen ? "image-creation-filter-button active" : "image-creation-filter-button"} onClick={() => setFilterOpen((open) => !open)} aria-haspopup="dialog" aria-expanded={filterOpen} title="Filter gallery">
            <SlidersHorizontal size={14} />Filters{activeFilterCount > 0 && <b>{activeFilterCount}</b>}
          </button>
          {filterOpen && <div className="image-creation-filter-panel" role="dialog" aria-label="Filter gallery">
            <header><strong>Filter gallery</strong><button type="button" onClick={resetFilters} disabled={!activeFilterCount && !query}>Clear all</button></header>
            <Facet label="Venue" value={filters.venue} onChange={(value) => updateFilter("venue", value)} options={[{ value: "all", label: "All" }, ...VENUES.map((venue) => ({ value: venue, label: venue, count: figures.filter((figure) => figure.venue === venue.toLowerCase()).length }))]} />
            <Facet label="Year" value={filters.year} onChange={(value) => updateFilter("year", value)} options={[{ value: "all", label: "All" }, ...YEARS.map((year) => ({ value: year, label: String(year) }))]} />
            <Facet label="Presentation" value={filters.tier} onChange={(value) => updateFilter("tier", value)} options={[{ value: "all", label: "All" }, { value: "best", label: "Awarded" }, { value: "oral", label: "Oral" }, { value: "spotlight", label: "Spotlight" }]} />
            <Facet label="Figure type" value={filters.pattern} onChange={(value) => updateFilter("pattern", value)} options={[{ value: "all", label: "All" }, ...PATTERNS.map(([value, label]) => ({ value, label }))]} />
          </div>}
        </div>
      </div>
      {filters.venue === "EMNLP" && (filters.year === "all" || filters.year === 2026) &&
        <p className="gallery-availability-note">All {emnlp2026?.accepted.toLocaleString() ?? "2,710"} EMNLP 2026 accepted papers are indexed. Figure cards will appear when ACL Anthology publishes the official proceedings.</p>}
      {error && figures.length > 0 && <div className="gallery-notice">The Top-Conf catalogue is temporarily unavailable. Showing verified official-proceedings additions.</div>}
      {loading && !figures.length ? <div className="gallery-state"><LoaderCircle className="spin" size={25} /><strong>Loading figures…</strong></div>
        : error && !figures.length ? <div className="gallery-state"><ImageOff size={25} /><strong>Could not load the gallery</strong><p>{error}</p><button type="button" onClick={() => void refresh(true)}>Retry</button></div>
          : !result.length ? <div className="gallery-state"><Search size={25} /><strong>No figures match these filters</strong><button type="button" onClick={resetFilters}>Clear filters</button></div>
            : <>
              <div className="image-creation-grid">{shown.map((figure) => <FigureCard key={figure.id} figure={figure} onOpen={() => setSelectedId(figure.id)} onUseTemplate={() => useAsTemplate(figure)} />)}</div>
              {visibleCount < result.length && <div className="gallery-load-more"><button type="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>Show more figures <span>{Math.min(visibleCount, result.length).toLocaleString()} / {result.length.toLocaleString()}</span></button></div>}
            </>}
      <p className="gallery-credit">Figures belong to their paper authors and publishers. The base catalogue is from <a href={GALLERY_ROOT} target="_blank" rel="noreferrer">Top-Conf Figure Gallery</a>; ICCV, ECCV, and EMNLP additions are validated Figure 1 crops from the linked official proceedings. Check each paper's license before reuse.</p>
    </div> : <div className="image-creation-panel" role="tabpanel" id="image-creation-panel-templates" aria-labelledby="image-creation-tab-templates">
      <p className="image-creation-templates-intro">Start from a figure pattern, then make it yours. Each template opens the gallery filtered to real examples from accepted papers.</p>
      {loading && !figures.length ? <div className="gallery-state"><LoaderCircle className="spin" size={25} /><strong>Loading templates…</strong></div>
        : <div className="image-creation-template-grid">{templates.map((template) => <TemplateCard key={template.id} label={template.label} note={template.note} count={template.count} preview={template.preview} onUse={() => browsePattern(template.id)} />)}</div>}
    </div>}

    <div className="image-creation-fade" aria-hidden="true" />
    <div className="image-creation-composer-dock">
      <div className="image-creation-composer">
        {reference && <div className="image-creation-reference">
          <img src={imageUrl(reference)} alt="" />
          <span><b>{reference.venue.toUpperCase()} {reference.year}</b><em>{reference.title}</em></span>
          <button type="button" onClick={() => setReference(null)} title="Remove reference figure" aria-label="Remove reference figure"><X size={13} /></button>
        </div>}
        <div className="image-creation-composer-box">
          <button type="button" className="image-creation-attach" disabled title="Attaching a reference image is coming soon" aria-label="Attach a reference image"><Plus size={16} /></button>
          <input ref={composerRef} className="image-creation-composer-input" value={composerText} onChange={(event) => setComposerText(event.target.value)} placeholder={reference ? "Describe how to adapt this figure…" : "Describe an image, or start from a published figure…"} aria-label="Describe an image" />
          <label className="image-creation-aspect">
            <select value={aspect} onChange={(event) => setAspect(event.target.value as Aspect)} aria-label="Aspect ratio">
              {ASPECTS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            <ChevronDown size={10} aria-hidden="true" />
          </label>
          <span className="image-creation-model" title="Image generation will arrive with the image model backend"><ImagePlus size={12} />Image model · Soon</span>
          <button type="button" className="image-creation-send" disabled title="Image generation is coming soon" aria-label="Generate image"><ArrowUp size={15} /></button>
        </div>
        <p className="image-creation-composer-note">Generated images will be saved to <b>Gallery</b>. Check each paper's license before reuse.</p>
      </div>
    </div>

    {active && selectedIndex >= 0 && <FigureDialog figure={result[selectedIndex]} index={selectedIndex} total={result.length} onClose={() => setSelectedId(null)} onStep={step} />}
  </main>;
}
