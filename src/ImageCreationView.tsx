import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUp, ChevronDown, ExternalLink, GraduationCap, ImageOff, ImagePlus, LoaderCircle, Plus, Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { MenuSurface } from "./Menu";
import DataChartGallery from "./DataChartGallery";
import { Tabs, Tab } from "./Tabs";

import { Dialog } from "./Dialog";
import { InlineNotice } from "./InlineNotice";
import { StateView } from "./StateView";
import { useUISettings } from "./i18n";
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
  const { t } = useUISettings();
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
  const [forgeOpen, setForgeOpen] = useState(false);
  const [paperTitle, setPaperTitle] = useState("");
  const [paperContent, setPaperContent] = useState("");
  const [figureType, setFigureType] = useState("framework");
  const [figurePlan, setFigurePlan] = useState("");
  const [planConfirmed, setPlanConfirmed] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [aspect, setAspect] = useState<Aspect>("1:1");
  const composerRef = useRef<HTMLInputElement>(null);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);

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
  function useAsTemplate(figure: Figure) {
    setReferences((current) => current.some((item) => item.id === figure.id) || current.length >= 6 ? current : [...current, figure]);
    setPlanConfirmed(false);
    setForgeOpen(true);
  }

  return <main className={tab === "charts" ? "image-creation-page data-chart-page" : "image-creation-page"}>
    <div className="image-creation-tabs">
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
      </div>
    </div>

    {tab === "gallery" ? <div className="image-creation-panel" role="tabpanel" id="image-creation-panel-gallery" aria-labelledby="image-creation-tab-gallery">
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
    </div> : <div className="image-creation-panel" role="tabpanel" id="image-creation-panel-charts" aria-labelledby="image-creation-tab-charts"><DataChartGallery active={active} sort={chartSort} /></div>}

    {tab === "gallery" && <><div className="image-creation-fade" aria-hidden="true" />
    <div className="image-creation-composer-dock">
      <div className="image-creation-composer">
        {references.length > 0 && <button type="button" className="image-creation-reference" onClick={() => setForgeOpen(true)}>{t("Selected references: {count}", { count: references.length })}</button>}
        <div className="image-creation-composer-box">
          <button type="button" className="image-creation-attach" disabled title="Attaching a reference image is coming soon" aria-label="Attach a reference image"><Plus size={16} /></button>
          <input ref={composerRef} className="image-creation-composer-input" value={composerText} onChange={(event) => { setComposerText(event.target.value); setPlanConfirmed(false); }} placeholder={t("Describe a figure to plan…")} aria-label={t("Describe a figure to plan…")} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) setForgeOpen(true); }} />
          <label className="image-creation-aspect">
            <select value={aspect} onChange={(event) => setAspect(event.target.value as Aspect)} aria-label="Aspect ratio">
              {ASPECTS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            <ChevronDown size={10} aria-hidden="true" />
          </label>
          <span className="image-creation-model" title="Image generation will arrive with the image model backend"><ImagePlus size={12} />Image model · Soon</span>
          <button type="button" className="image-creation-send" onClick={() => setForgeOpen(true)} title={t("Open FigureForge")} aria-label={t("Open FigureForge")}><ArrowUp size={15} /></button>
        </div>
        <p className="image-creation-composer-note">{t("Plan your figure now; AI generation is coming later.")}</p>
      </div>
    </div></>}

    {active && selectedIndex >= 0 && <FigureDialog figure={result[selectedIndex]} index={selectedIndex} total={result.length} onClose={() => setSelectedId(null)} onStep={step} />}
    {active && <Dialog open={forgeOpen} onClose={() => setForgeOpen(false)} size="lg" className="figure-forge-dialog" ariaLabel={t("FigureForge planning workspace")}>
      <header className="figure-forge-header"><div><strong>FigureForge</strong><p>{t("Plan a paper figure with references")}</p></div><button type="button" onClick={() => setForgeOpen(false)} aria-label={t("Close")}><X size={18} /></button></header>
      <div className="figure-forge-body">
        <p className="figure-forge-notice">{t("This is a manual planning draft. AI analysis, PDF import and image generation are not available yet. Nothing here is saved after leaving this view.")}</p>
        <label>{t("Paper title")}<input value={paperTitle} onChange={(event) => { setPaperTitle(event.target.value); setPlanConfirmed(false); }} /></label>
        <label>{t("Abstract or paper content")}<textarea rows={4} value={paperContent} onChange={(event) => { setPaperContent(event.target.value); setPlanConfirmed(false); }} /></label>
        <label>{t("Figure type")}<select value={figureType} onChange={(event) => { setFigureType(event.target.value); setPlanConfirmed(false); }}>{[["framework", "Framework"], ["architecture", "Architecture"], ["pipeline", "Pipeline"], ["conceptual", "Concept"], ["custom", "Custom"]].map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label>
        <label>{t("Drawing requirements")}<textarea rows={2} value={composerText} onChange={(event) => { setComposerText(event.target.value); setPlanConfirmed(false); }} /></label>
        <section className="figure-forge-references"><div className="figure-forge-section-heading"><strong>{t("References ({count}/6)", { count: references.length })}</strong><button type="button" onClick={() => setForgeOpen(false)}>{t("Browse references")}</button></div>
          {references.length === 0 ? <p>{t("Choose Use as template on a gallery image to add a reference.")}</p> : references.map((figure) => <div className="figure-forge-reference" key={figure.id}><img src={imageUrl(figure)} alt="" /><div><strong>{figure.title}</strong><span>{figure.venue.toUpperCase()} · {figure.year}</span><a href={paperUrl(figure)} target="_blank" rel="noreferrer">{t("Open paper")}</a></div><button type="button" onClick={() => { setReferences((current) => current.filter((item) => item.id !== figure.id)); setPlanConfirmed(false); }} aria-label={t("Remove reference")}> <X size={16} /></button></div>)}
          {references.length >= 6 && <p>{t("Maximum of 6 references. Remove one before adding another.")}</p>}
        </section>
        <label>{t("Figure plan")}<textarea rows={5} value={figurePlan} onChange={(event) => { setFigurePlan(event.target.value); setPlanConfirmed(false); }} placeholder={t("Describe the layout, modules, connections and visual style.")} /></label>
        <p>{t("References belong to their authors. Check each paper's license before reuse.")}</p>
        <div className="figure-forge-footer"><button type="button" disabled={!figurePlan.trim()} onClick={() => setPlanConfirmed(true)}>{t("Confirm plan")}</button>{planConfirmed && <span role="status">{t("Plan confirmed for this session. Image generation is not available yet.")}</span>}</div>
      </div>
    </Dialog>}
  </main>;
}
