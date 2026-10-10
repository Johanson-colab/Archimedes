import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { BookOpen, Check, ChevronLeft, ChevronRight, ExternalLink, FileText, GraduationCap, LoaderCircle, Plus, RefreshCw, Search } from "lucide-react";
import conferenceCatalog from "../shared/conferences.json";

const PRESENTATIONS: Array<{ id: ConferencePresentation | "all"; label: string }> = [
  { id: "all", label: "All" }, { id: "oral", label: "Oral" }, { id: "spotlight", label: "Spotlight" },
  { id: "poster", label: "Poster" }, { id: "unknown", label: "Unclassified" },
];
const PAGE_SIZE = 40;
function errorMessage(error: unknown) {
  return String(error).replace(/^Error:\s*/, "").replace(/^Error invoking remote method '[^']+':\s*Error:\s*/, "");
}

export default function ConferenceDiscovery({ bridge, targetLibraryId, topic, onImported }: {
  bridge: ResearchDeskBridge; targetLibraryId: string; topic: DailyDiscoveryTopic; onImported: () => Promise<void>;
}) {
  const [conference, setConference] = useState<ConferenceId>("icml");
  const [year, setYear] = useState(2026);
  const [presentation, setPresentation] = useState<ConferencePresentation | "all">("all");
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [response, setResponse] = useState<ConferenceSearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const requestRef = useRef(0);
  const selected = conferenceCatalog.find((entry) => entry.id === conference)!;
  const load = useCallback(async (forceRefresh = false) => {
    const request = ++requestRef.current;
    setLoading(true); setError(""); setResponse(null);
    try {
      const next = await bridge.searchConferencePapers({ conference, year, presentation, topic, query: submittedQuery, offset, limit: PAGE_SIZE, forceRefresh });
      if (request === requestRef.current) setResponse(next);
    } catch (failure) {
      if (request === requestRef.current) setError(errorMessage(failure));
    } finally { if (request === requestRef.current) setLoading(false); }
  }, [bridge, conference, year, presentation, topic, submittedQuery, offset]);
  useEffect(() => { void load(); return () => { requestRef.current += 1; }; }, [load]);
  useEffect(() => { setOffset(0); }, [topic]);
  function search() {
    setOffset(0);
    if (submittedQuery === query.trim() && offset === 0) void load();
    else setSubmittedQuery(query.trim());
  }
  async function save(paper: DailyPaper) {
    if (!targetLibraryId || adding) return;
    const key = `${targetLibraryId}:${paper.external_id}`;
    setAdding(key);
    try {
      await bridge.addLibraryPaper(targetLibraryId, paper);
      setAdded((current) => new Set(current).add(key));
      await onImported();
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setAdding(null); }
  }
  return <div className="conference-discovery">
    <div className="conference-filter-row">
      <label>Conference<select aria-label="Conference" value={conference} onChange={(event) => { setConference(event.target.value as ConferenceId); setOffset(0); }}>
        {conferenceCatalog.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select></label>
      <label>Year<select aria-label="Conference year" value={year} onChange={(event) => { setYear(Number(event.target.value)); setOffset(0); }}>
        {[2026, 2025, 2024, 2023].map((item) => <option key={item} value={item}>{item}</option>)}
      </select></label>
      <div className="conference-presentation-tabs" role="tablist" aria-label="Presentation format">
        {PRESENTATIONS.map((item) => <button key={item.id} role="tab" aria-selected={presentation === item.id} className={presentation === item.id ? "active" : ""} onClick={() => { setPresentation(item.id); setOffset(0); }}>
          {item.label}{response && <small>{item.id === "all" ? response.catalog_total : response.presentation_counts[item.id]}</small>}
        </button>)}
      </div>
      <button className="secondary-button conference-refresh" title="Refresh official catalog" disabled={loading} onClick={() => void load(true)}><RefreshCw size={14} />Refresh</button>
    </div>
    <div className="daily-search-row">
      <div className="external-search-box"><Search size={16} /><input aria-label="Search conference papers" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && search()} placeholder="Search by title, author, abstract, or keyword" /><button className="primary-button" disabled={loading} onClick={search}><Search size={14} />Search</button></div>
      <span>{response ? `${response.total.toLocaleString()} papers` : `${selected.label} ${year}`}</span>
    </div>
    {error && <div className="library-error" role="alert">{error}</div>}
    {response && <div className="conference-catalog-status">
      <span><GraduationCap size={14} />{selected.label} {year} · {response.catalog_total.toLocaleString()} papers · {response.status === "not_held" ? "No edition" : response.status === "not_published" ? "Awaiting official publication" : response.stale ? "Cached, refresh pending" : response.cached ? "Cached" : "Official catalog"}</span>
      <details><summary>Sources and updated time</summary><time>{new Date(response.fetched_at).toLocaleString()}</time>{response.sources.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer">{new URL(url).hostname}<ExternalLink size={11} /></a>)}</details>
    </div>}
    {response?.warnings.map((warning) => <div className="conference-notice" key={warning}>{warning}</div>)}
    {loading ? <div className="library-loading"><LoaderCircle className="spin" size={18} />Loading the official {selected.label} {year} catalog…</div>
      : !response ? <div className="daily-empty"><RefreshCw size={24} /><strong>The official catalog is temporarily unavailable</strong><button className="secondary-button" onClick={() => void load(true)}>Retry</button></div>
      : !response.papers.length ? <div className="daily-empty"><BookOpen size={24} /><strong>{response.status === "not_held" ? "No edition was held that year" : response.status === "not_published" ? "The official paper catalog is not public yet" : "No papers match these filters"}</strong><span>{response.status === "not_published" ? `The official ${selected.label} ${year} accepted-paper catalog is not available yet. Choose another year or try again later.` : "Try another conference, year, or presentation format."}</span></div>
      : <div className="daily-paper-list">{response.papers.map((paper) => {
        const metadata = paper.conference!;
        const key = `${targetLibraryId}:${paper.external_id}`;
        const saved = added.has(key);
        const presentationLabel = PRESENTATIONS.find((item) => item.id === metadata.presentation)?.label || "Unclassified";
        return <article className="daily-paper-row conference-paper-row" key={paper.external_id}>
          <div className="daily-paper-date"><strong>{selected.label}</strong><span>{year}</span></div>
          <div className="daily-paper-content">
            <div className="daily-paper-title"><h2><ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]} components={{ p: ({ children }) => <>{children}</> }}>{paper.title}</ReactMarkdown></h2><a href={paper.url} target="_blank" rel="noreferrer" title="Open official paper record"><ExternalLink size={13} /></a></div>
            <p>{paper.authors.slice(0, 5).join(", ")}{paper.authors.length > 5 ? " et al." : ""}</p>
            {paper.abstract && <small>{paper.abstract}</small>}
            <div className="daily-paper-signals"><a className={`conference-badge ${metadata.presentation}`} href={metadata.presentation_source_url || metadata.source_url} title={metadata.decision} target="_blank" rel="noreferrer">{presentationLabel}</a><span>{metadata.track}</span>
              <a href={metadata.source_url} target="_blank" rel="noreferrer"><Check size={11} />Official catalog</a>
              {paper.pdf_url && <a href={paper.pdf_url} target="_blank" rel="noreferrer"><FileText size={11} />PDF</a>}
            </div>
          </div>
          <button className={saved ? "secondary-button imported" : "outline-button"} disabled={saved || Boolean(adding) || !targetLibraryId} onClick={() => void save(paper)}>
            {saved ? <Check size={14} /> : adding === key ? <LoaderCircle className="spin" size={14} /> : <Plus size={14} />}{saved ? "Saved" : "Save"}
          </button>
        </article>;
      })}</div>}
    {response && response.total > PAGE_SIZE && <nav className="conference-pagination" aria-label="Conference result pages">
      <button className="secondary-button" disabled={offset === 0 || loading} onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}><ChevronLeft size={14} /></button>
      <span>{offset + 1}–{Math.min(offset + PAGE_SIZE, response.total)} / {response.total.toLocaleString()}</span>
      <button className="secondary-button" disabled={!response.has_more || loading} onClick={() => setOffset((value) => value + PAGE_SIZE)}><ChevronRight size={14} /></button>
    </nav>}
  </div>;
}
