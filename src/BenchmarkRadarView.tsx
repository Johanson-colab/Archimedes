import { useEffect, useMemo, useState } from "react";
import { Bookmark, BookmarkCheck, ExternalLink, LibraryBig, LoaderCircle, Radar, Search } from "lucide-react";

type RadarTab = "radar" | "library";
type TimeWindow = "latest" | "30d" | "90d";
type Sort = "attention" | "newest" | "growing";

const SAVED_KEY = "archimedes:benchmark-radar:saved";

function loadSaved() {
  try { return new Set<string>(JSON.parse(window.localStorage.getItem(SAVED_KEY) || "[]")); }
  catch { return new Set<string>(); }
}

function dateValue(value: string) {
  const parsed = new Date(`${value}T00:00:00Z`).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function attentionValue(record: BenchmarkRadarRecord) {
  return (record.attentionScore ?? 0) * 1000 + (record.attention.githubStars ?? 0) * 3 + (record.attention.hfPaperUpvotes ?? 0);
}

function formatDate(value: string) {
  if (!value) return "Date unavailable";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function signalText(record: BenchmarkRadarRecord) {
  const signals: string[] = [];
  if (record.attention.hfPaperUpvotes != null) signals.push(`${record.attention.hfPaperUpvotes.toLocaleString()} HF votes`);
  if (record.attention.githubStars != null) signals.push(`${record.attention.githubStars.toLocaleString()} GitHub stars`);
  if (record.attentionScore != null) signals.push(`Attention ${record.attentionScore}`);
  if (record.forecast != null) signals.push(`Forecast ${record.forecast}`);
  return signals.join(" · ") || "Attention not measured yet";
}

function ResourceLinks({ record }: { record: BenchmarkRadarRecord }) {
  const links = [["Paper", record.links.paper || record.links.report], ["Project", record.links.project], ["Code", record.links.code], ["Data", record.links.data]]
    .filter(([, url]) => Boolean(url)) as Array<[string, string]>;
  return links.length ? <div className="benchmark-resource-links">{links.map(([label, url]) => <a key={`${label}:${url}`} href={url} target="_blank" rel="noreferrer">{label}<ExternalLink size={12} /></a>)}</div> : null;
}

function SaveButton({ record, saved, onToggle }: { record: BenchmarkRadarRecord; saved: boolean; onToggle: () => void }) {
  return <button className={saved ? "benchmark-save saved" : "benchmark-save"} onClick={onToggle} aria-pressed={saved} title={saved ? "Remove from saved benchmarks" : "Save benchmark"}>
    {saved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}{saved ? "Saved" : "Save"}
  </button>;
}

function BenchmarkRow({ record, saved, onToggle, radar = false }: { record: BenchmarkRadarRecord; saved: boolean; onToggle: () => void; radar?: boolean }) {
  const labels = (record.directions.length ? record.directions : [...record.capabilityGroups, ...record.topics]).slice(0, 3);
  return <article className={radar ? "benchmark-row radar" : "benchmark-row"}>
    {radar && <div className="benchmark-date"><small>Released</small><strong>{formatDate(record.releasedAt)}</strong></div>}
    <div className="benchmark-row-main">
      <div className="benchmark-row-heading"><h2>{record.name}</h2>{record.publication.venue && <span>{record.publication.venue}</span>}</div>
      <p>{record.description || record.oneLine || "No benchmark summary is available."}</p>
      {labels.length > 0 && <div className="benchmark-tags">{labels.map((label) => <span key={label}>{label}</span>)}</div>}
      <div className="benchmark-signal">{record.readiness && <b>{record.readiness}</b>}<span>{signalText(record)}</span></div>
      <ResourceLinks record={record} />
    </div>
    <SaveButton record={record} saved={saved} onToggle={onToggle} />
  </article>;
}

export default function BenchmarkRadarView() {
  const [data, setData] = useState<BenchmarkRadarData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<RadarTab>("radar");
  const [windowName, setWindowName] = useState<TimeWindow>("latest");
  const [sort, setSort] = useState<Sort>("attention");
  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState("");
  const [saved, setSaved] = useState<Set<string>>(loadSaved);

  useEffect(() => {
    let active = true;
    void window.researchDesk.getBenchmarkRadarData().then((payload) => {
      if (!active) return;
      setData(payload);
      setError("");
    }).catch((failure: unknown) => {
      if (active) setError(failure instanceof Error ? failure.message : String(failure));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function toggleSaved(id: string) {
    setSaved((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      window.localStorage.setItem(SAVED_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  const radarRecords = useMemo(() => {
    if (!data) return [];
    const newestDate = data.radar.reduce((latest, record) => dateValue(record.releasedAt) > dateValue(latest) ? record.releasedAt : latest, "");
    const cutoff = dateValue(data.updatedAt) - (windowName === "30d" ? 30 : windowName === "90d" ? 90 : 0) * 86_400_000;
    return data.radar.filter((record) => windowName === "latest" ? record.releasedAt === newestDate : dateValue(record.releasedAt) >= cutoff)
      .sort((a, b) => sort === "newest" ? dateValue(b.releasedAt) - dateValue(a.releasedAt) || a.name.localeCompare(b.name) : attentionValue(b) - attentionValue(a) || dateValue(b.releasedAt) - dateValue(a.releasedAt));
  }, [data, sort, windowName]);

  const libraryRecords = useMemo(() => {
    if (!data) return [];
    const term = query.trim().toLocaleLowerCase();
    return data.library.filter((record) => {
      if (direction && !record.directions.includes(direction)) return false;
      if (!term) return true;
      return [record.name, record.title, record.description, record.area, ...record.topics, ...record.directions].join(" ").toLocaleLowerCase().includes(term);
    }).sort((a, b) => sort === "newest" ? dateValue(b.releasedAt) - dateValue(a.releasedAt) : sort === "growing" ? (b.attention.githubStars ?? 0) - (a.attention.githubStars ?? 0) : attentionValue(b) - attentionValue(a));
  }, [data, direction, query, sort]);

  const directionsBySection = useMemo(() => {
    const groups = new Map<string, BenchmarkRadarDirection[]>();
    for (const item of data?.directions ?? []) groups.set(item.section || "Research directions", [...(groups.get(item.section || "Research directions") ?? []), item]);
    return [...groups.entries()];
  }, [data]);

  if (loading) return <main className="benchmark-radar-page benchmark-loading"><LoaderCircle className="spin" size={25} /><strong>Loading Benchmark Radar…</strong></main>;
  if (!data) return <main className="benchmark-radar-page benchmark-loading error"><Radar size={26} /><strong>Benchmark Radar is unavailable</strong><p>{error || "The local Benchmark Radar dataset could not be opened."}</p></main>;

  return <main className="benchmark-radar-page">
    <header className="benchmark-header">
      <div><span className="eyebrow">Benchmark intelligence</span><h1>Benchmark Radar</h1><p>Track emerging public evaluations and search the Benchmark Radar library inside Archimedes.</p></div>
      <div className="benchmark-source"><Radar size={18} /><span>Updated {data.updatedAt || "locally"}</span><small>{data.library.length.toLocaleString()} indexed</small></div>
    </header>

    <nav className="benchmark-tabs" aria-label="Benchmark Radar view">
      <button className={tab === "radar" ? "active" : ""} onClick={() => setTab("radar")}><Radar size={16} />Radar</button>
      <button className={tab === "library" ? "active" : ""} onClick={() => setTab("library")}><LibraryBig size={16} />Library</button>
      <span>{saved.size} saved</span>
    </nav>

    {tab === "radar" ? <section className="benchmark-radar-content">
      <div className="benchmark-intro"><div><h2>Emerging AI benchmarks</h2><p>New public evaluations from the latest Benchmark Radar release feed, ranked by observable attention where signals are available.</p></div><strong>{radarRecords.length}<small> latest releases</small></strong></div>
      <div className="benchmark-controls"><div><span>Time window</span><div className="benchmark-segmented">{(["latest", "30d", "90d"] as TimeWindow[]).map((item) => <button key={item} className={windowName === item ? "active" : ""} onClick={() => setWindowName(item)}>{item === "latest" ? "Latest" : item.replace("d", " days")}</button>)}</div></div><div><span>Sort by</span><div className="benchmark-segmented">{(["attention", "newest"] as Sort[]).map((item) => <button key={item} className={sort === item ? "active" : ""} onClick={() => setSort(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div></div></div>
      <div className="benchmark-results-heading"><h2>Rising benchmarks <small>{radarRecords.length} results</small></h2></div>
      <div className="benchmark-list">{radarRecords.map((record) => <BenchmarkRow key={record.id} record={record} saved={saved.has(record.id)} onToggle={() => toggleSaved(record.id)} radar />)}</div>
    </section> : <section className="benchmark-library-layout">
      <aside className="benchmark-directions"><div className="benchmark-direction-head"><span>Research directions</span><p>Browse the Benchmark Radar taxonomy or search every public benchmark.</p></div><button className={!direction ? "active" : ""} onClick={() => setDirection("")}>All benchmarks <small>{data.library.length.toLocaleString()}</small></button>{directionsBySection.map(([section, items]) => <section key={section}><h2>{section}</h2>{items.map((item) => <button key={item.id} className={direction === item.id ? "active" : ""} onClick={() => setDirection(item.id)}><span>{item.name}</span><small>{item.count.toLocaleString()}</small></button>)}</section>)}</aside>
      <div className="benchmark-library-content"><div className="benchmark-library-toolbar"><label><span>Search</span><div><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search benchmarks, tasks, or research directions" /></div></label><label><span>Sort by</span><div className="benchmark-segmented">{(["newest", "attention", "growing"] as Sort[]).map((item) => <button key={item} className={sort === item ? "active" : ""} onClick={() => setSort(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div></label></div><div className="benchmark-results-heading"><h2>{direction ? data.directions.find((item) => item.id === direction)?.name || "Benchmarks" : "All benchmarks"} <small>{libraryRecords.length.toLocaleString()} entries · public attention</small></h2></div><div className="benchmark-list">{libraryRecords.slice(0, 150).map((record) => <BenchmarkRow key={record.id} record={record} saved={saved.has(record.id)} onToggle={() => toggleSaved(record.id)} />)}{libraryRecords.length > 150 && <p className="benchmark-limit">Showing the first 150 matching benchmarks. Refine the search or choose a research direction.</p>}</div></div>
    </section>}
  </main>;
}
