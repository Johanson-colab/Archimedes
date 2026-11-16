import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { BookOpen, Check, ChevronLeft, ChevronRight, ExternalLink, FileText, GraduationCap, LoaderCircle, Plus, RefreshCw, Search } from "lucide-react";
import conferenceCatalog from "../shared/conferences.json";
import { FilterGroup, FilterButton } from "./Tabs";

import { InlineNotice } from "./InlineNotice";
import { StateView } from "./StateView";
import { useUISettings } from "./i18n";
import { discoveryPaperKey, discoveryPaperFields } from "./discovery-state";
const PRESENTATIONS: Array<{ id: ConferencePresentation | "all"; label: string }> = [
  { id: "all", label: "All" }, { id: "oral", label: "Oral" }, { id: "spotlight", label: "Spotlight" },
  { id: "poster", label: "Poster" }, { id: "unknown", label: "Unclassified" },
];
const PAGE_SIZE = 40;
function errorMessage(error: unknown) {
  return String(error).replace(/^Error:\s*/, "").replace(/^Error invoking remote method '[^']+':\s*Error:\s*/, "");
}
function feedKey(value: { conference: ConferenceId; year: number; presentation: ConferencePresentation | "all"; topic: DailyDiscoveryTopic; submittedQuery: string; offset: number }) {
  return JSON.stringify([value.conference, value.year, value.presentation, value.topic, value.submittedQuery, value.offset]);
}
type ConferenceFeed = { key: string; response: ConferenceSearchResponse | null; error: string; loading: boolean };

export default function ConferenceDiscovery({ storageKey, bridge, targetLibraryId, topic, onImported }: {
  storageKey?: string; bridge: ResearchDeskBridge; targetLibraryId: string; topic: DailyDiscoveryTopic; onImported: () => Promise<void>;
}) {
  const { t } = useUISettings();
  const [saved] = useState(() => {
    try {
      const value = JSON.parse(window.localStorage.getItem(storageKey || "") || "null");
      return value && conferenceCatalog.some((item) => item.id === value.conference) && Array.isArray(value.response?.papers) ? value : null;
    } catch { return null; }
  });
  const [conference, setConference] = useState<ConferenceId>(saved?.conference ?? "icml");
  const [year, setYear] = useState<number>(saved?.year ?? 2026);
  const [presentation, setPresentation] = useState<ConferencePresentation | "all">(saved?.presentation ?? "all");
  const [query, setQuery] = useState(saved?.query ?? "");
  const [submittedQuery, setSubmittedQuery] = useState(saved?.submittedQuery ?? "");
  const [offset, setOffset] = useState<number>(saved?.offset ?? 0);
  const savedKey = saved?.response ? feedKey(saved) : "";
  const responseCache = useRef(new Map<string, ConferenceSearchResponse>());
  const [feed, setFeed] = useState<ConferenceFeed>(() => {
    if (savedKey && saved?.response) responseCache.current.set(savedKey, saved.response);
    return { key: savedKey, response: saved?.response ?? null, error: "", loading: !saved?.response };
  });
  const currentKey = feedKey({ conference, year, presentation, topic, submittedQuery, offset });
  const visibleFeed = feed.key === currentKey ? feed : null;
  const response = visibleFeed?.response ?? null;
  const loadError = visibleFeed?.error ?? "";
  const loading = visibleFeed ? visibleFeed.loading : true;
  const [error, setError] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [storageError, setStorageError] = useState("");
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const requestRef = useRef(0);
  useEffect(() => {
    let active = true;
    setAdded(new Set());
    if (targetLibraryId && bridge.listLibraryPapers) void bridge.listLibraryPapers(targetLibraryId).then((papers) => {
      if (active) setAdded(new Set(papers.map((paper) => `${targetLibraryId}:${discoveryPaperKey(paper)}`)));
    }).catch((cause) => { if (active) setError(errorMessage(cause)); });
    return () => { active = false; };
  }, [bridge, targetLibraryId]);
  useEffect(() => {
    if (!storageKey) return;
    try { window.localStorage.setItem(storageKey, JSON.stringify({ conference, year, presentation, topic, query, submittedQuery, offset, response: response && { ...response, papers: response.papers.map((paper) => ({ ...discoveryPaperFields(paper), published_at: paper.published_at, discovered_at: paper.discovered_at, categories: paper.categories, upvotes: paper.upvotes, github_url: paper.github_url, github_stars: paper.github_stars, conference: paper.conference })) } })); setStorageError(""); }
    catch { setStorageError(t("Discovery could not be saved on this device. Keep this page open or free storage before leaving.")); }
  }, [storageKey, conference, year, presentation, topic, query, submittedQuery, offset, response, t]);
  const selected = conferenceCatalog.find((entry) => entry.id === conference)!;
  const load = useCallback(async (forceRefresh = false) => {
    const key = feedKey({ conference, year, presentation, topic, submittedQuery, offset });
    const cached = responseCache.current.get(key);
    if (!forceRefresh && cached) { setFeed({ key, response: cached, error: "", loading: false }); return; }
    const request = ++requestRef.current;
    setFeed({ key, response: null, error: "", loading: true });
    try {
      const next = await bridge.searchConferencePapers({ conference, year, presentation, topic, query: submittedQuery, offset, limit: PAGE_SIZE, forceRefresh });
      if (request !== requestRef.current) return;
      responseCache.current.set(key, next);
      setFeed({ key, response: next, error: "", loading: false });
    } catch (failure) {
      if (request !== requestRef.current) return;
      setFeed({ key, response: null, error: errorMessage(failure), loading: false });
    }
  }, [bridge, conference, year, presentation, topic, submittedQuery, offset]);
  useEffect(() => { void load(); return () => { requestRef.current += 1; }; }, [load]);
  const previousTopic = useRef(topic);
  useEffect(() => { if (previousTopic.current !== topic) setOffset(0); previousTopic.current = topic; }, [topic]);
  function search() {
    setOffset(0);
    if (submittedQuery === query.trim() && offset === 0) void load();
    else setSubmittedQuery(query.trim());
  }
  async function save(paper: DailyPaper) {
    if (!targetLibraryId || adding) return;
    const key = `${targetLibraryId}:${discoveryPaperKey(paper)}`;
    setAdding(key);
    try {
      await bridge.addLibraryPaper(targetLibraryId, paper);
      if (!alive.current) return;
      setAdded((current) => new Set(current).add(key));
      await onImported();
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setAdding(null); }
  }
  return <div className="conference-discovery">
    {storageError && <InlineNotice tone="warning">{storageError}</InlineNotice>}
    <div className="conference-filter-row">
      <label>Conference<select aria-label="Conference" value={conference} onChange={(event) => { setConference(event.target.value as ConferenceId); setOffset(0); }}>
        {conferenceCatalog.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select></label>
      <label>Year<select aria-label="Conference year" value={year} onChange={(event) => { setYear(Number(event.target.value)); setOffset(0); }}>
        {[2026, 2025, 2024, 2023].map((item) => <option key={item} value={item}>{item}</option>)}
      </select></label>
      <FilterGroup label="Presentation format" className="conference-presentation-tabs">
        {PRESENTATIONS.map((item) => <FilterButton key={item.id} active={presentation === item.id} onClick={() => { setPresentation(item.id); setOffset(0); }}>
          {item.label}{response && <small>{item.id === "all" ? response.catalog_total : response.presentation_counts[item.id]}</small>}
        </FilterButton>)}
      </FilterGroup>
      <button className="secondary-button conference-refresh" title="Refresh official catalog" disabled={loading} onClick={() => void load(true)}><RefreshCw size={14} />Refresh</button>
    </div>
    <div className="daily-search-row">
      <div className="external-search-box"><Search size={16} /><input aria-label="Search conference papers" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && search()} placeholder="Search by title, author, abstract, or keyword" /><button className="primary-button" disabled={loading} onClick={search}><Search size={14} />Search</button></div>
      <span>{response ? `${response.total.toLocaleString()} papers` : `${selected.label} ${year}`}</span>
    </div>
    {loadError && <InlineNotice tone="danger" className="library-error">{loadError}</InlineNotice>}
    {error && <InlineNotice tone="danger" className="library-error">{error}</InlineNotice>}
    {response && <div className="conference-catalog-status">
      <span><GraduationCap size={14} />{selected.label} {year} · {response.catalog_total.toLocaleString()} papers · {response.status === "not_held" ? "No edition" : response.status === "not_published" ? "Awaiting official publication" : response.stale ? "Cached, refresh pending" : response.cached ? "Cached" : "Official catalog"}</span>
      <details><summary>Sources and updated time</summary><time>{new Date(response.fetched_at).toLocaleString()}</time>{response.sources.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer">{new URL(url).hostname}<ExternalLink size={11} /></a>)}</details>
    </div>}
    {response?.warnings.map((warning) => <InlineNotice tone="warning" className="conference-notice" key={warning}>{warning}</InlineNotice>)}
    {loading ? <StateView tone="loading" className="library-loading" icon={<LoaderCircle className="spin" size={18} />} title={`Loading the official ${selected.label} ${year} catalog…`} />
      : !response ? <StateView tone="error" className="daily-empty" icon={<RefreshCw size={24} />} title="The official catalog is temporarily unavailable" action={<button className="secondary-button" onClick={() => void load(true)}>Retry</button>} />
      : !response.papers.length ? <StateView className="daily-empty" icon={<BookOpen size={24} />} title={response.status === "not_held" ? "No edition was held that year" : response.status === "not_published" ? "The official paper catalog is not public yet" : "No papers match these filters"} description={response.status === "not_published" ? `The official ${selected.label} ${year} accepted-paper catalog is not available yet. Choose another year or try again later.` : "Try another conference, year, or presentation format."} />
      : <div className="daily-paper-list">{response.papers.map((paper) => {
        const metadata = paper.conference!;
        const key = `${targetLibraryId}:${discoveryPaperKey(paper)}`;
        const saved = added.has(key);
        const presentationLabel = PRESENTATIONS.find((item) => item.id === metadata.presentation)?.label || "Unclassified";
        const authors = `${paper.authors.slice(0, 5).join(", ")}${paper.authors.length > 5 ? " et al." : ""}`;
        return <article className="daily-paper-row conference-paper-row" key={paper.external_id}>
          <div className="daily-paper-content">
            <div className="daily-paper-title">
              <h2><ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]} components={{ p: ({ children }) => <>{children}</> }}>{paper.title}</ReactMarkdown></h2>
              <a href={paper.url} target="_blank" rel="noreferrer" title="Open official paper record"><ExternalLink size={13} /></a>
              <button className={saved ? "secondary-button imported" : "outline-button"} disabled={saved || Boolean(adding) || !targetLibraryId} onClick={() => void save(paper)}>
                {saved ? <Check size={14} /> : adding === key ? <LoaderCircle className="spin" size={14} /> : <Plus size={14} />}{saved ? "Saved" : "Save"}
              </button>
            </div>
            <p className="daily-paper-meta"><span className="daily-paper-date">{selected.label} {year}</span><span className="daily-paper-authors">{authors}</span></p>
            {paper.abstract && <small>{paper.abstract}</small>}
            <div className="daily-paper-signals">
              <a className={`conference-badge ${metadata.presentation}`} href={metadata.presentation_source_url || metadata.source_url} title={metadata.decision} target="_blank" rel="noreferrer">{presentationLabel}</a>
              <span>{metadata.track}</span>
              <a href={metadata.source_url} target="_blank" rel="noreferrer"><Check size={11} />Official catalog</a>
              {paper.pdf_url && <a href={paper.pdf_url} target="_blank" rel="noreferrer"><FileText size={11} />PDF</a>}
            </div>
          </div>
        </article>;
      })}</div>}
    {response && response.total > PAGE_SIZE && <nav className="conference-pagination" aria-label="Conference result pages">
      <button className="secondary-button" disabled={offset === 0 || loading} onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}><ChevronLeft size={14} /></button>
      <span>{offset + 1}–{Math.min(offset + PAGE_SIZE, response.total)} / {response.total.toLocaleString()}</span>
      <button className="secondary-button" disabled={!response.has_more || loading} onClick={() => setOffset((value) => value + PAGE_SIZE)}><ChevronRight size={14} /></button>
    </nav>}
  </div>;
}
