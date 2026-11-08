import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, Book, Bookmark, BookmarkCheck, ExternalLink, LoaderCircle, RefreshCw, Rss, Search, Settings2, Sparkle } from "lucide-react";
import { FilterButton, Tab, Tabs } from "./Tabs";
import { StateView } from "./StateView";
import { Dialog } from "./Dialog";
import { SettingsRow, SettingsSection, SettingsSwitch } from "./SettingsPrimitives";
import { useUISettings } from "./i18n";

const SOURCE_ORDER = ["hn", "github", "arxiv", "lobsters", "reddit", "rss", "x"] as const;

const SOURCE_LABELS: Record<string, string> = {
  hn: "Hacker News",
  github: "GitHub",
  arxiv: "arXiv",
  lobsters: "Lobste.rs",
  reddit: "Reddit",
  rss: "RSS",
  x: "X",
};

const LANGUAGE_CLASSES: Record<string, string> = {
  TypeScript: "typescript",
  JavaScript: "javascript",
  Python: "python",
  Rust: "rust",
  Go: "go",
};

type NativeRecord = Record<string, unknown>;
type TFunction = (key: string, values?: Record<string, string | number>) => string;

function nativeOf(item: NewsItem): NativeRecord {
  return item.native && typeof item.native === "object" ? item.native : {};
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry || "")).filter(Boolean) : [];
}

function relativeTime(value: string, t: (key: string, values?: Record<string, string | number>) => string) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
  if (minutes < 1) return t("Just now");
  if (minutes < 60) return t("{count} min ago", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("{count} h ago", { count: hours });
  const days = Math.floor(hours / 24);
  return t("{count} d ago", { count: days });
}

function initials(value: string) {
  return String(value || "?").replace(/^@/, "").slice(0, 2).toUpperCase();
}

function splitKeywords(value: string) {
  return [...new Set(value.split(",").map((entry) => entry.trim()).filter(Boolean))];
}

function parseFeeds(value: string) {
  return value.split("\n").map((line) => {
    const text = line.trim();
    if (!text) return null;
    const [first, ...rest] = text.split("|");
    const url = (rest.length ? rest.join("|") : first).trim();
    if (!/^https?:\/\//i.test(url)) return null;
    const label = rest.length ? first.trim() : "";
    return { id: url, label, url };
  }).filter(Boolean) as Array<{ id: string; label: string; url: string }>;
}

function MediaGallery({ media }: { media: NewsMedia[] }) {
  const visible = (media || []).filter((entry) => /^https?:\/\//i.test(entry.url)).slice(0, 4);
  if (!visible.length) return null;
  return <div className={visible.length === 1 ? "news-media one" : "news-media"}>
    {visible.map((entry) => <img
      key={entry.url}
      src={entry.url}
      alt={entry.alt || ""}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={(event) => { event.currentTarget.style.display = "none"; }}
    />)}
  </div>;
}

function ClusterBadge({ count }: { count: number }) {
  if (count < 2) return null;
  return <span className="news-cluster-badge" title={`${count} sources`}>◎ {count}</span>;
}

function HackerNewsCard({ item, t }: { item: NewsItem; t: TFunction }) {
  const native = nativeOf(item);
  return <div className="news-hn">
    <h3 className="news-hn-title">{item.title}{asText(native.domain) && <span className="news-hn-domain"> ({asText(native.domain)})</span>}</h3>
    <div className="news-hn-meta">
      <b>{item.score.toLocaleString()} points</b>
      {item.author ? <> · {item.author}</> : null}
      {item.publishedAt ? <> · {relativeTime(item.publishedAt, t)}</> : null}
      {item.comments ? <> · <b>{item.comments.toLocaleString()} comments</b></> : null}
    </div>
  </div>;
}

function XCard({ item, t }: { item: NewsItem; t: TFunction }) {
  const native = nativeOf(item);
  const metrics = native.metrics && typeof native.metrics === "object" ? native.metrics as NativeRecord : {};
  const avatar = asText(native.avatar);
  return <div className="news-x">
    <div className="news-x-head">
      {avatar
        ? <img className="news-x-avatar-image" src={avatar} alt="" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.style.display = "none"; }} />
        : <span className="news-x-avatar">{initials(asText(native.name) || item.author)}</span>}
      <div className="news-x-id">
        <span className="news-x-name">{asText(native.name) || item.author}</span>
        <BadgeCheck size={13} className="news-x-verified" aria-hidden />
        <span className="news-x-handle">{asText(native.handle) || item.author}{item.publishedAt ? ` · ${relativeTime(item.publishedAt, t)}` : ""}</span>
      </div>
      <span className="news-x-logo" aria-hidden>𝕏</span>
    </div>
    <p className="news-x-text">{item.summary || item.title}</p>
    <MediaGallery media={item.media} />
    <div className="news-x-metrics">
      <span>{asNumber(metrics.replies).toLocaleString()} replies</span>
      <span>{asNumber(metrics.reposts).toLocaleString()} reposts</span>
      <span>{asNumber(metrics.likes).toLocaleString()} likes</span>
      <span>{asNumber(metrics.views).toLocaleString()} views</span>
    </div>
  </div>;
}

function RedditCard({ item, t }: { item: NewsItem; t: TFunction }) {
  const native = nativeOf(item);
  return <div className="news-rd">
    <div className="news-rd-head">
      <span className="news-rd-avatar">r/</span>
      <span className="news-rd-sub">{asText(native.subreddit) || "Reddit"}</span>
      {asText(native.author) ? <span className="news-rd-muted">{asText(native.author)}</span> : null}
      {item.publishedAt ? <span className="news-rd-muted">{relativeTime(item.publishedAt, t)}</span> : null}
      {asText(native.flair) ? <span className="news-rd-flair">{asText(native.flair)}</span> : null}
    </div>
    <h3 className="news-rd-title">{item.title}</h3>
    {item.summary ? <p className="news-rd-body">{item.summary}</p> : null}
    <MediaGallery media={item.media} />
    <div className="news-rd-bar">
      <span className="news-rd-vote">▲ {item.score.toLocaleString()}</span>
      <span>{item.comments.toLocaleString()} comments</span>
      {asNumber(native.upvoteRatio) ? <span>{Math.round(asNumber(native.upvoteRatio) * 100)}% upvoted</span> : null}
    </div>
  </div>;
}

function GitHubCard({ item }: { item: NewsItem }) {
  const native = nativeOf(item);
  const language = asText(native.language);
  return <div className="news-gh">
    <div className="news-gh-head">
      <Book size={14} className="news-gh-icon" aria-hidden />
      <span className="news-gh-owner">{asText(native.owner)}</span>
      <span className="news-gh-path">/</span>
      <span className="news-gh-name">{asText(native.name) || item.title}</span>
      <span className="news-gh-public">Public</span>
    </div>
    {item.summary ? <p className="news-gh-desc">{item.summary}</p> : null}
    {item.tags.length ? <div className="news-gh-topics">{item.tags.slice(0, 6).map((tag) => <span className="news-gh-topic" key={tag}>{tag}</span>)}</div> : null}
    <div className="news-gh-meta">
      {language ? <span><span className={`news-lang-dot ${LANGUAGE_CLASSES[language] || "other"}`} />{language}</span> : null}
      <span>★ {asNumber(native.stars).toLocaleString()}</span>
      <span>{asNumber(native.forks).toLocaleString()} forks</span>
      <span>{asNumber(native.issues).toLocaleString()} issues</span>
      {asNumber(native.trendingRank) ? <span className="news-gh-trend">◎ #{asNumber(native.trendingRank)} today</span> : null}
    </div>
  </div>;
}

function ArxivCard({ item, t }: { item: NewsItem; t: TFunction }) {
  const native = nativeOf(item);
  const categories = asStringArray(native.categories);
  const authors = asStringArray(native.authors);
  return <div className="news-ax">
    <div className="news-ax-badge">arXiv:{asText(native.arxivId)} {categories[0] ? `[${categories[0]}]` : ""}</div>
    <h3 className="news-ax-title">{item.title}</h3>
    {authors.length ? <div className="news-ax-authors">{authors.slice(0, 4).join(", ")}{authors.length > 4 ? ` +${authors.length - 4}` : ""}</div> : null}
    {item.summary ? <p className="news-ax-abstract">{item.summary}</p> : null}
    <div className="news-ax-meta">
      {item.publishedAt ? <>{relativeTime(item.publishedAt, t)} · </> : null}
      {categories.length ? <b>{categories.slice(0, 3).join(", ")}</b> : null}
      {asText(native.pdfUrl) ? <a className="news-inline-link" href={asText(native.pdfUrl)} target="_blank" rel="noreferrer">PDF</a> : null}
    </div>
  </div>;
}

function LobstersCard({ item, t }: { item: NewsItem; t: TFunction }) {
  return <div className="news-lb">
    <h3 className="news-lb-title">{item.title}</h3>
    <div className="news-lb-meta">
      {item.score} points · {item.comments} comments
      {item.publishedAt ? ` · ${relativeTime(item.publishedAt, t)}` : ""}
    </div>
    {item.tags.length ? <div className="news-lb-tags">{item.tags.slice(0, 5).map((tag) => <span className="news-tag" key={tag}>{tag}</span>)}</div> : null}
  </div>;
}

function RssCard({ item, t }: { item: NewsItem; t: TFunction }) {
  const native = nativeOf(item);
  const feedLabel = asText(native.feedLabel) || item.tags[0] || item.sourceLabel;
  return <div className="news-rss">
    <div className="news-rss-src">{feedLabel}</div>
    <h3 className="news-rss-title">{item.title}</h3>
    {item.summary ? <p className="news-rss-excerpt">{item.summary}</p> : null}
    <MediaGallery media={item.media} />
    <div className="news-rss-meta">{item.publishedAt ? relativeTime(item.publishedAt, t) : ""}{item.author ? ` · ${item.author}` : ""}</div>
  </div>;
}

function GenericCard({ item }: { item: NewsItem }) {
  return <div className="news-generic">
    <h3 className="news-generic-title">{item.title}</h3>
    {item.summary ? <p className="news-generic-summary">{item.summary}</p> : null}
    <MediaGallery media={item.media} />
  </div>;
}

function nativeCard(item: NewsItem, t: TFunction) {
  switch (item.source) {
    case "hn": return <HackerNewsCard item={item} t={t} />;
    case "x": return <XCard item={item} t={t} />;
    case "reddit": return <RedditCard item={item} t={t} />;
    case "github": return <GitHubCard item={item} />;
    case "arxiv": return <ArxivCard item={item} t={t} />;
    case "lobsters": return <LobstersCard item={item} t={t} />;
    case "rss": return <RssCard item={item} t={t} />;
    default: return <GenericCard item={item} />;
  }
}

export default function NewsView({ bridge, projectId, active, onSendToChat }: {
  bridge: ResearchDeskBridge;
  projectId: string | null;
  active: boolean;
  onSendToChat: (text: string, mode: "append" | "replace") => void;
}) {
  const { t } = useUISettings();
  const [feed, setFeed] = useState<NewsFeedPayload | null>(null);
  const [settings, setSettings] = useState<NewsSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<"feed" | "board">("feed");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [sort, setSort] = useState<"new" | "hot">("new");
  const [query, setQuery] = useState("");
  const [savedOnly, setSavedOnly] = useState(false);
  const [sinceHours, setSinceHours] = useState(24);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState<NewsSettings | null>(null);
  const [watchText, setWatchText] = useState("");
  const [muteText, setMuteText] = useState("");
  const [rssText, setRssText] = useState("");
  const [subredditText, setSubredditText] = useState("");
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    try {
      const payload = await bridge.listNews({ source: sourceFilter, sort, query, savedOnly, sinceHours, limit: 400 });
      if (request !== requestRef.current) return;
      setFeed(payload);
      setSettings((current) => current ?? payload.settings);
      setError("");
    } catch (cause) {
      if (request === requestRef.current) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [bridge, query, savedOnly, sinceHours, sort, sourceFilter]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try { await bridge.refreshNews({ force: false }); } catch { /* offline is a normal state */ }
      if (cancelled) return;
      await load();
    }, query ? 280 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [active, bridge, load, query]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(async () => {
      try {
        const result = await bridge.refreshNews({ force: false });
        if (!result?.skipped) await load();
      } catch { /* ignore */ }
    }, 60000);
    return () => window.clearInterval(timer);
  }, [active, bridge, load]);

  useEffect(() => {
    if (!settings) return;
    setView(settings.view === "board" ? "board" : "feed");
    setSinceHours(settings.sinceHours);
  }, [settings?.view, settings?.sinceHours]);

  async function refresh(force = true) {
    setRefreshing(true);
    setNotice("");
    try {
      const result = await bridge.refreshNews({ force });
      await load();
      const failed = result?.results?.filter((entry) => entry.status === "error") || [];
      if (failed.length) setNotice(t("Some sources are offline: {sources}", { sources: failed.map((entry) => SOURCE_LABELS[entry.source] || entry.source).join(", ") }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRefreshing(false);
    }
  }

  function changeView(next: "feed" | "board") {
    setView(next);
    void bridge.setNewsSettings({ view: next }).then(setSettings).catch(() => undefined);
  }

  function changeSince(hours: number) {
    setSinceHours(hours);
    void bridge.setNewsSettings({ sinceHours: hours }).then(setSettings).catch(() => undefined);
  }

  async function toggleSaved(item: NewsItem) {
    const next = !item.saved;
    try {
      await bridge.setNewsSaved(item.id, next);
      setFeed((current) => current ? { ...current, items: current.items.map((entry) => entry.id === item.id ? { ...entry, saved: next } : entry) } : current);
      if (next) {
        try {
          await saveToLibrary(item);
          setNotice(t("Saved to Library."));
        } catch (cause) {
          setNotice(t("Saved in News. Library import failed: {message}", { message: cause instanceof Error ? cause.message : String(cause) }));
        }
      }
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function saveToLibrary(item: NewsItem) {
    const libraries = await bridge.listLibraries(projectId ?? undefined);
    const existing = libraries.find((library) => library.name === t("Saved news"));
    const library = existing || await bridge.createLibrary({ projectId: projectId ?? undefined, name: t("Saved news"), description: t("Stories saved from News") });
    const native = nativeOf(item);
    const paper = {
      external_id: item.id,
      s2_id: "",
      arxiv_id: item.source === "arxiv" ? asText(native.arxivId) : "",
      doi: "",
      title: item.title,
      authors: item.author ? [item.author] : [item.sourceLabel],
      year: item.publishedAt ? new Date(item.publishedAt).getFullYear() : null,
      venue: item.sourceLabel,
      abstract: item.summary,
      url: item.url,
      pdf_url: asText(native.pdfUrl),
      citation_count: 0,
      source: `news:${item.source}`,
    } as AcademicSearchResult & { canonical_key: string };
    paper.canonical_key = `news:${item.id}`;
    await bridge.addLibraryPaper(library.id, paper);
  }

  function markRead(item: NewsItem) {
    if (item.read) return;
    void bridge.markNewsRead(item.id, true).catch(() => undefined);
    setFeed((current) => current ? { ...current, items: current.items.map((entry) => entry.id === item.id ? { ...entry, read: true } : entry) } : current);
  }

  function openItem(item: NewsItem) {
    markRead(item);
    void bridge.openExternalUrl(item.url).catch(() => undefined);
  }

  function askAbout(item: NewsItem) {
    markRead(item);
    onSendToChat(t("I am looking at this {source} item: “{title}” ({url}).\n\n{summary}\n\nWhat matters here, and what should I read next?", {
      source: item.sourceLabel,
      title: item.title,
      url: item.url,
      summary: item.summary || t("No summary is available; open the original item."),
    }), "append");
  }

  function openSettings() {
    if (!settings) return;
    setDraft(structuredClone(settings));
    setWatchText(settings.watch.join(", "));
    setMuteText(settings.mute.join(", "));
    setRssText(settings.rssFeeds.map((feedEntry) => feedEntry.label ? `${feedEntry.label} | ${feedEntry.url}` : feedEntry.url).join("\n"));
    setSubredditText(settings.reddit.subreddits.join(", "));
    setSettingsOpen(true);
  }

  async function saveSettings() {
    if (!draft) return;
    try {
      const next = await bridge.setNewsSettings({
        ...draft,
        watch: splitKeywords(watchText),
        mute: splitKeywords(muteText),
        rssFeeds: parseFeeds(rssText),
        reddit: { ...draft.reddit, subreddits: splitKeywords(subredditText) },
      });
      setSettings(next);
      setSettingsOpen(false);
      await load();
      void refresh(false);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause));
    }
  }

  const items = feed?.items ?? [];
  const sources = feed?.sources ?? [];
  const watch = settings?.watch ?? [];
  const clusterCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) if (item.clusterId) counts.set(item.clusterId, (counts.get(item.clusterId) || 0) + 1);
    return counts;
  }, [items]);
  const watchedItem = useCallback((item: NewsItem) => {
    if (!watch.length) return false;
    const haystack = `${item.title} ${item.summary}`.toLowerCase();
    return watch.some((keyword) => haystack.includes(keyword.toLowerCase()));
  }, [watch]);

  const updatedLabel = feed?.updatedAt
    ? t("Updated {time}", { time: relativeTime(feed.updatedAt, (key, values) => t(key, values)) })
    : t("Not synced yet");

  const renderCard = (item: NewsItem) => {
    const native = nativeOf(item);
    const provenance = item.source === "rss" && asText(native.feedLabel) ? asText(native.feedLabel) : item.sourceLabel;
    return <article
      key={item.id}
      className={`news-card${watchedItem(item) ? " watched" : ""}${item.read ? " read" : ""}`}
      data-source={item.source}
    >
      {nativeCard(item, t)}
      <div className="news-card-actions">
        <span className="news-card-via">{t("via")} <b>{provenance}</b></span>
        <ClusterBadge count={clusterCounts.get(item.clusterId) || 0} />
        <span className="news-card-spacer" />
        <button type="button" className={item.saved ? "news-action saved" : "news-action"} onClick={() => void toggleSaved(item)} title={t("Save to Library")}>
          {item.saved ? <BookmarkCheck size={12} /> : <Bookmark size={12} />}{item.saved ? t("Saved") : t("Save")}
        </button>
        <button type="button" className="news-action" onClick={() => askAbout(item)} title={t("Ask AI")}>
          <Sparkle size={12} />{t("Ask AI")}
        </button>
        <button type="button" className="news-action" onClick={() => openItem(item)} title={t("Open original")}>
          <ExternalLink size={12} />{t("Open link")}
        </button>
      </div>
    </article>;
  };

  return <div className="news-page">
    <div className="news-page-head">
      <Tabs value={view} onChange={(value) => changeView(value as "feed" | "board")} label={t("News view")} variant="segmented" className="news-view-tabs">
        <Tab value="feed">{t("Feed")}</Tab>
        <Tab value="board">{t("Board")}</Tab>
      </Tabs>
      <span className="news-updated">{updatedLabel}</span>
      <span className="news-head-spacer" />
      <button className="quiet-icon-button" onClick={() => void refresh()} title={t("Refresh")} aria-label={t("Refresh")} disabled={refreshing}>
        {refreshing ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}
      </button>
      <button className="quiet-icon-button" onClick={openSettings} title={t("News settings")} aria-label={t("News settings")}>
        <Settings2 size={15} />
      </button>
    </div>

    <div className="news-filters">
      <div className="news-search">
        <Search size={13} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Search news")} aria-label={t("Search news")} />
      </div>
      <div className="news-sort">
        <button type="button" className={sort === "hot" ? "active" : ""} onClick={() => setSort("hot")}>{t("Hot")}</button>
        <button type="button" className={sort === "new" ? "active" : ""} onClick={() => setSort("new")}>{t("Newest")}</button>
      </div>
      <span className="news-watch">{watch.length ? <>{t("Watching")} <b>{watch.join(" · ")}</b></> : null}</span>
      <select className="news-range" value={sinceHours} onChange={(event) => changeSince(Number(event.target.value))} aria-label={t("Time range")}>
        <option value={24}>{t("Past 24 hours")}</option>
        <option value={72}>{t("Past 3 days")}</option>
        <option value={168}>{t("Past 7 days")}</option>
      </select>
    </div>

    <div className="news-chips">
      <FilterButton active={sourceFilter === "all"} onClick={() => setSourceFilter("all")}>{t("All sources")} <span className="news-chip-count">{items.length}</span></FilterButton>
      {sources.map((source) => <FilterButton key={source.id} active={sourceFilter === source.id} onClick={() => setSourceFilter(source.id)}>
        <span className={`news-src-dot ${source.id}`} />
        {source.label}
        {source.unread > 0 ? <span className="news-chip-unread">{source.unread}</span> : null}
        {source.status === "error" ? <span className="news-src-offline" title={source.message || t("Source offline")}>!</span> : null}
      </FilterButton>)}
      <FilterButton active={savedOnly} onClick={() => setSavedOnly((value) => !value)}>
        <Bookmark size={11} /> {t("Saved")}
      </FilterButton>
    </div>

    {error ? <div className="news-notice error">{error}</div> : null}
    {notice ? <div className="news-notice">{notice}</div> : null}

    {loading && !feed
      ? <StateView tone="loading" icon={<LoaderCircle className="spin" size={18} />} title={t("Loading news…")} />
      : items.length === 0
        ? <StateView
          tone="empty"
          icon={<Rss size={18} />}
          title={t("No news yet")}
          description={t("Enable sources or add a feed to start collecting stories.")}
          action={<button type="button" className="secondary-button" onClick={() => void refresh()}>{t("Refresh now")}</button>}
        />
        : view === "board"
          ? <div className="news-board">{items.map(renderCard)}</div>
          : <div className="news-feed">{items.map(renderCard)}</div>}

    <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} size="md" ariaLabel={t("News settings")} className="news-settings-dialog">
      {draft ? <div className="news-settings-body">
        <h2 className="news-settings-title">{t("News settings")}</h2>

        <SettingsSection title={t("Sources")}>
          {SOURCE_ORDER.map((id) => <SettingsRow key={id} title={SOURCE_LABELS[id]}>
            <SettingsSwitch checked={Boolean(draft.sources[id])} onChange={(checked) => setDraft({ ...draft, sources: { ...draft.sources, [id]: checked } })} label={SOURCE_LABELS[id]} />
          </SettingsRow>)}
        </SettingsSection>

        <SettingsSection title={t("Keywords")}>
          <SettingsRow title={t("Watch keywords")} description={t("Comma separated; matches are highlighted.")} stacked>
            <input className="settings-text-input" value={watchText} onChange={(event) => setWatchText(event.target.value)} placeholder="agents, RAG, inference" />
          </SettingsRow>
          <SettingsRow title={t("Mute keywords")} description={t("Comma separated; matching stories are hidden.")} stacked>
            <input className="settings-text-input" value={muteText} onChange={(event) => setMuteText(event.target.value)} placeholder="crypto, mobile" />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title={t("Reddit (OAuth)")}>
          <SettingsRow title={t("Subreddits")} description={t("Comma separated, up to five.")} stacked>
            <input className="settings-text-input" value={subredditText} onChange={(event) => setSubredditText(event.target.value)} placeholder="LocalLLaMA, MachineLearning" />
          </SettingsRow>
          <SettingsRow title={t("Client ID")} stacked>
            <input className="settings-text-input" value={draft.reddit.clientId} onChange={(event) => setDraft({ ...draft, reddit: { ...draft.reddit, clientId: event.target.value } })} />
          </SettingsRow>
          <SettingsRow title={t("Client secret")} description={draft.reddit.configured && !draft.reddit.clientSecret ? t("Configured — leave blank to keep the saved secret.") : undefined} stacked>
            <input className="settings-text-input" type="password" value={draft.reddit.clientSecret} onChange={(event) => setDraft({ ...draft, reddit: { ...draft.reddit, clientSecret: event.target.value } })} />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title={t("GitHub (optional)")}>
          <SettingsRow
            title={t("Access token")}
            description={draft.github.configured && !draft.github.token ? t("Configured — leave blank to keep the saved token.") : t("Raises the unauthenticated search limit.")}
            stacked
          >
            <input className="settings-text-input" type="password" value={draft.github.token} onChange={(event) => setDraft({ ...draft, github: { ...draft.github, token: event.target.value } })} />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title={t("X (optional)")}>
          <SettingsRow title={t("Bearer token")} description={draft.x.configured && !draft.x.bearerToken ? t("Configured — leave blank to keep the saved token.") : undefined} stacked>
            <input className="settings-text-input" type="password" value={draft.x.bearerToken} onChange={(event) => setDraft({ ...draft, x: { ...draft.x, bearerToken: event.target.value } })} />
          </SettingsRow>
          <SettingsRow title={t("Search query")} stacked>
            <input className="settings-text-input" value={draft.x.query} onChange={(event) => setDraft({ ...draft, x: { ...draft.x, query: event.target.value } })} placeholder="(AI OR LLM OR agents) -is:retweet lang:en" />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title={t("RSS feeds")}>
          <SettingsRow title={t("Feeds")} description={t("One per line: Label | URL")} stacked>
            <textarea className="news-settings-textarea" value={rssText} onChange={(event) => setRssText(event.target.value)} rows={4} placeholder={"The Register | https://www.theregister.com/headlines.atom"} />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title={t("Refresh")}>
          <SettingsRow title={t("Refresh cadence")} description={t("Minutes between conditional refresh requests.")}>
            <input className="settings-text-input news-cadence-input" type="number" min={5} max={60} value={draft.cadenceMinutes} onChange={(event) => setDraft({ ...draft, cadenceMinutes: Number(event.target.value) })} />
          </SettingsRow>
          <SettingsRow title={t("Cluster stories")} description={t("Group the same story across sources.")}>
            <SettingsSwitch checked={draft.clustering} onChange={(checked) => setDraft({ ...draft, clustering: checked })} label={t("Cluster stories")} />
          </SettingsRow>
        </SettingsSection>

        <div className="news-settings-actions">
          <button type="button" className="secondary-button" onClick={() => setSettingsOpen(false)}>{t("Cancel")}</button>
          <button type="button" className="primary-button" onClick={() => void saveSettings()}>{t("Save settings")}</button>
        </div>
      </div> : null}
    </Dialog>
  </div>;
}
