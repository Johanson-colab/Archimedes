import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  Download,
  ExternalLink,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
  X,
} from "lucide-react";

export type ExtensionsTab = "installed" | "available" | "updates";

type ExtensionTypeFilter = "all" | ExtensionType;

const TYPE_LABEL: Record<ExtensionType, string> = {
  skill: "Skill",
  mcp: "MCP",
  plugin: "Plugin",
  source: "Source",
  automation: "Automation",
};

const TYPE_ORDER: ExtensionType[] = ["skill", "mcp", "plugin", "source", "automation"];

const SOURCE_TYPE_LABEL: Record<ExtensionSourceType, string> = {
  archimedes: "JSON index",
  json: "JSON index",
  github: "GitHub",
  mcp: "MCP Registry",
  npm: "npm search",
};

interface ExtensionRowModel {
  key: string;
  id: string;
  name: string;
  description: string;
  type: ExtensionType;
  source: string;
  sourceId: string;
  scope: string;
  status: string;
  path: string;
  homepage: string;
  version: string;
  license: string;
  size: number;
  installs: number;
  permissions: string[];
  skill?: ContextAttachment;
  plugin?: ContextAttachment;
  marketplace?: ExtensionMarketplaceItem;
}

interface HoverCardState {
  row: ExtensionRowModel;
  left: number;
  top: number;
}

interface HoverPreviewState {
  loading: boolean;
  filename: string;
  content: string;
  error: string;
}

function formatCount(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(value || 0);
}

function formatBytes(value: number) {
  if (!value) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} MB`;
  if (value >= 1_000) return `${Math.round(value / 1_000)} KB`;
  return `${value} B`;
}

function isWorkspacePath(workspace: string, target: string) {
  if (!workspace || !target) return false;
  const root = workspace.replace(/\/+$/, "");
  return target === root || target.startsWith(`${root}/`);
}

function installedSkillRow(skill: ContextAttachment, workspace: string): ExtensionRowModel {
  const path = skill.path || "";
  return {
    key: `skill:${skill.id}`,
    id: `skill:${skill.id}`,
    name: skill.name,
    description: skill.description || skill.detail || "Reusable research instructions.",
    type: "skill",
    source: skill.detail?.split(" · ")[0] || "Local",
    sourceId: "local",
    scope: isWorkspacePath(workspace, path) ? "Workspace" : "Global",
    status: "Enabled",
    path,
    homepage: "",
    version: "",
    license: "",
    size: 0,
    installs: 0,
    permissions: [],
    skill,
  };
}

function pluginRow(plugin: ContextAttachment): ExtensionRowModel {
  return {
    key: `plugin:${plugin.id}`,
    id: `plugin:${plugin.id}`,
    name: plugin.name,
    description: plugin.detail || "Installed plugin",
    type: "plugin",
    source: "Codex plugin",
    sourceId: "local",
    scope: "Global",
    status: "Enabled",
    path: plugin.path || "",
    homepage: "",
    version: "",
    license: "",
    size: 0,
    installs: 0,
    permissions: [],
    plugin,
  };
}

function marketplaceRow(item: ExtensionMarketplaceItem): ExtensionRowModel {
  return {
    key: `mp:${item.id}`,
    id: item.id,
    name: item.name,
    description: item.description || "No description provided.",
    type: item.type,
    source: item.source,
    sourceId: item.sourceId,
    scope: "",
    status: item.updateAvailable ? "Update" : item.installed ? "Installed" : formatCount(item.installs),
    path: item.installedPath || "",
    homepage: item.homepage || item.sourceUrl,
    version: item.version,
    license: item.license,
    size: item.size,
    installs: item.installs,
    permissions: item.permissions,
    marketplace: item,
  };
}

function rowActionLabel(row: ExtensionRowModel) {
  const item = row.marketplace;
  if (!item) return "";
  if (item.installed && !item.updateAvailable) return "Installed";
  if (item.type === "skill" && item.files?.length) return item.updateAvailable ? "Update" : "Install";
  return "Open source";
}

function rowActionAvailable(row: ExtensionRowModel) {
  const item = row.marketplace;
  if (!item) return false;
  if (item.installed && !item.updateAvailable) return false;
  return Boolean(item.homepage || item.sourceUrl || (item.type === "skill" && item.files?.length));
}

function previewText(row: ExtensionRowModel, preview: HoverPreviewState) {
  if (preview.loading) return "Reading the primary file…";
  if (preview.error) return preview.error;
  if (preview.content) return preview.content;
  if (row.plugin) return row.path ? `Installed at ${row.path}` : "Installed plugin package.";
  return "No preview available.";
}

export default function ExtensionsView({ bridge, workspace, tab, onTabChange, attachedIds, onAttach }: {
  bridge: ResearchDeskBridge;
  workspace: string;
  tab: ExtensionsTab;
  onTabChange: (tab: ExtensionsTab) => void;
  attachedIds: Set<string>;
  onAttach: (item: ContextAttachment) => void;
}) {
  const [skills, setSkills] = useState<ContextAttachment[]>([]);
  const [plugins, setPlugins] = useState<ContextAttachment[]>([]);
  const [installedLoading, setInstalledLoading] = useState(true);
  const [installedError, setInstalledError] = useState("");
  const [feed, setFeed] = useState<ExtensionFeed | null>(null);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState("");
  const [limit, setLimit] = useState(24);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<ExtensionTypeFilter>("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [expanded, setExpanded] = useState("");
  const [hover, setHover] = useState<HoverCardState | null>(null);
  const [hoverPreview, setHoverPreview] = useState<HoverPreviewState>({ loading: false, filename: "", content: "", error: "" });
  const [sourceManagerOpen, setSourceManagerOpen] = useState(false);
  const [installItem, setInstallItem] = useState<ExtensionMarketplaceItem | null>(null);
  const [installScope, setInstallScope] = useState<"workspace" | "global">("workspace");
  const [installBusy, setInstallBusy] = useState(false);
  const [installError, setInstallError] = useState("");
  const [notice, setNotice] = useState("");
  const hoverTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const suppressHover = useRef(false);
  const previewCache = useRef(new Map<string, HoverPreviewState>());

  useEffect(() => {
    let active = true;
    setInstalledLoading(true);
    setInstalledError("");
    bridge.listInstalledExtensions(workspace).then((installed) => {
      if (!active) return;
      setSkills(installed.skills);
      setPlugins(installed.plugins);
    }).catch((reason) => {
      if (active) setInstalledError(String(reason).replace(/^Error:\s*/, ""));
    }).finally(() => {
      if (active) setInstalledLoading(false);
    });
    return () => { active = false; };
  }, [bridge, workspace]);

  useEffect(() => {
    let active = true;
    setMarketLoading(true);
    setMarketError("");
    bridge.listExtensions({ workspace, limit }).then((next) => {
      if (active) setFeed(next);
    }).catch((reason) => {
      if (active) setMarketError(String(reason).replace(/^Error:\s*/, ""));
    }).finally(() => {
      if (active) setMarketLoading(false);
    });
    return () => { active = false; };
  }, [bridge, workspace, limit]);

  useEffect(() => () => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const installedRows = useMemo(() => [
    ...skills.map((skill) => installedSkillRow(skill, workspace)),
    ...plugins.map(pluginRow),
  ].sort((left, right) => left.name.localeCompare(right.name)), [plugins, skills, workspace]);

  const availableRows = useMemo(() => (feed?.items || []).map(marketplaceRow), [feed]);

  const updateRows = useMemo(() => availableRows.filter((row) => row.marketplace?.updateAvailable), [availableRows]);

  const tabRows = tab === "installed" ? installedRows : tab === "updates" ? updateRows : availableRows;

  const filteredRows = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return tabRows.filter((row) => {
      if (typeFilter !== "all" && row.type !== typeFilter) return false;
      if (tab !== "installed" && sourceFilter !== "all" && row.sourceId !== sourceFilter) return false;
      if (!terms.length) return true;
      const haystack = `${row.name} ${row.description} ${row.source} ${TYPE_LABEL[row.type]}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [query, sourceFilter, tab, tabRows, typeFilter]);

  const sourceErrors = feed?.sources.filter((source) => source.error).length || 0;

  function switchTab(next: ExtensionsTab) {
    suppressHover.current = false;
    setExpanded("");
    setHover(null);
    onTabChange(next);
  }

  function refreshFeed() {
    setMarketLoading(true);
    setMarketError("");
    bridge.listExtensions({ workspace, limit, refresh: true }).then(setFeed).catch((reason) => {
      setMarketError(String(reason).replace(/^Error:\s*/, ""));
    }).finally(() => setMarketLoading(false));
  }

  async function refreshInstalled() {
    try {
      const installed = await bridge.listInstalledExtensions(workspace);
      setSkills(installed.skills);
      setPlugins(installed.plugins);
    } catch (reason) {
      setInstalledError(String(reason).replace(/^Error:\s*/, ""));
    }
  }

  function scheduleHover(row: ExtensionRowModel, element: HTMLElement) {
    if (suppressHover.current) return;
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    const rect = element.getBoundingClientRect();
    const left = Math.min(Math.max(12, rect.left + 24), Math.max(12, window.innerWidth - 432));
    const top = Math.min(Math.max(12, rect.top), Math.max(12, window.innerHeight - 430));
    hoverTimer.current = window.setTimeout(() => {
      setHover({ row, left, top });
      const cached = previewCache.current.get(row.key);
      if (cached) {
        setHoverPreview(cached);
        return;
      }
      setHoverPreview({ loading: Boolean(row.marketplace || row.skill), filename: "", content: "", error: "" });
      if (!row.marketplace && !row.skill) {
        const empty = { loading: false, filename: "", content: "", error: "" };
        previewCache.current.set(row.key, empty);
        setHoverPreview(empty);
        return;
      }
      const request: Promise<HoverPreviewState> = row.marketplace
        ? bridge.previewExtension({ id: row.marketplace.id, workspace }).then((result) => ({
          loading: false,
          filename: result.filename,
          content: result.content,
          error: "",
        }))
        : bridge.readExtensionFile(row.path, workspace).then((result) => ({
          loading: false,
          filename: result.filename,
          content: result.content,
          error: "",
        }));
      request.then((next) => {
        previewCache.current.set(row.key, next);
        setHoverPreview(next);
      }).catch((reason) => {
        const next = { loading: false, filename: "", content: "", error: String(reason).replace(/^Error:\s*/, "") };
        previewCache.current.set(row.key, next);
        setHoverPreview(next);
      });
    }, 220);
  }

  function clearHoverSoon() {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setHover(null), 140);
  }

  function keepHover() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
  }

  function openHomepage(row: ExtensionRowModel) {
    if (row.homepage) void bridge.openExternalUrl(row.homepage);
  }

  function addToChat(row: ExtensionRowModel) {
    if (row.skill) {
      onAttach(row.skill);
      return;
    }
    if (row.plugin) onAttach(row.plugin);
  }

  function startInstall(item: ExtensionMarketplaceItem) {
    if (item.installed && !item.updateAvailable) return;
    if (item.type !== "skill" || !item.files?.length) {
      if (item.homepage || item.sourceUrl) void bridge.openExternalUrl(item.homepage || item.sourceUrl);
      return;
    }
    setInstallItem(item);
    setInstallScope(item.installedScope === "global" ? "global" : "workspace");
    setInstallError("");
  }

  async function confirmInstall() {
    if (!installItem) return;
    setInstallBusy(true);
    setInstallError("");
    try {
      const result = await bridge.installExtension({ id: installItem.id, workspace, scope: installScope });
      setInstallItem(null);
      setFeed((current) => current ? {
        ...current,
        items: current.items.map((item) => item.id === result.item.id ? {
          ...item,
          installed: true,
          installedVersion: result.item.version,
          installedPath: result.path,
          installedScope: result.scope,
          updateAvailable: false,
        } : item),
      } : current);
      await refreshInstalled();
      setTabAndNotice(result.item.name);
    } catch (reason) {
      setInstallError(String(reason).replace(/^Error:\s*/, ""));
    } finally {
      setInstallBusy(false);
    }
  }

  function setTabAndNotice(name: string) {
    setNotice(`Installed ${name}.`);
    setExpanded("");
    switchTab("installed");
  }

  const counts = {
    installed: installedRows.length,
    available: feed?.total || 0,
    updates: updateRows.length,
  };

  const tabs: Array<{ id: ExtensionsTab; label: string }> = [
    { id: "installed", label: "Installed" },
    { id: "available", label: "Available" },
    { id: "updates", label: "Updates" },
  ];

  return <section className="skills-page extensions-page">
    <div className="extensions-toolbar">
      <div className="workbench-tabs extensions-tabs" role="tablist" aria-label="Extensions">
        {tabs.map((item) => <button key={item.id} role="tab" aria-selected={tab === item.id} className={tab === item.id ? "workbench-tab active" : "workbench-tab"} onClick={() => switchTab(item.id)}>
          {item.label}
          {counts[item.id] > 0 && <span className="extensions-tab-count">{item.id === "available" && counts.available > 999 ? formatCount(counts.available) : counts[item.id]}</span>}
        </button>)}
      </div>
      <div className="extensions-controls">
        <label className="extensions-search"><Search size={13} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" aria-label="Search extensions" /></label>
        <select className="extensions-select" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as ExtensionTypeFilter)} aria-label="Filter by type">
          <option value="all">All types</option>
          {TYPE_ORDER.map((type) => <option key={type} value={type}>{TYPE_LABEL[type]}</option>)}
        </select>
        {tab !== "installed" && <select className="extensions-select" value={sourceFilter} onChange={(event) => {
          if (event.target.value === "__manage") {
            setSourceManagerOpen(true);
            setSourceFilter("all");
            return;
          }
          setSourceFilter(event.target.value);
        }} aria-label="Filter by source">
          <option value="all">All sources</option>
          {(feed?.sources || []).map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
          <option value="__manage">Manage sources…</option>
        </select>}
        {tab !== "installed" && <button className="extensions-icon-button" onClick={refreshFeed} title="Refresh sources" aria-label="Refresh sources" disabled={marketLoading}><RefreshCw className={marketLoading ? "spin" : ""} size={14} /></button>}
      </div>
    </div>

    {notice && <div className="extensions-notice"><Check size={13} />{notice}</div>}
    {marketError && <div className="extensions-source-alert">{marketError}<button onClick={refreshFeed}>Retry</button></div>}
    {!marketError && sourceErrors > 0 && <div className="extensions-source-alert">{sourceErrors} {sourceErrors === 1 ? "source is" : "sources are"} unavailable.<button onClick={() => setSourceManagerOpen(true)}>Manage sources</button></div>}

    {tab === "installed" && installedLoading && <div className="skills-state"><LoaderCircle className="spin" size={16} />Reading installed extensions…</div>}
    {tab === "installed" && !installedLoading && installedError && <div className="skills-error">{installedError}</div>}
    {(tab === "available" || tab === "updates") && marketLoading && !feed && <div className="skills-state"><LoaderCircle className="spin" size={16} />Syncing extension sources…</div>}

    {!(tab === "installed" && installedLoading) && !(tab !== "installed" && marketLoading && !feed) && !installedError && <>
      <div className="extensions-table-head" aria-hidden="true">
        <span>Name</span>
        <span>Type</span>
        <span>{tab === "installed" ? "Scope" : "Source"}</span>
        <span>{tab === "available" ? "Installs" : "Status"}</span>
        <span />
      </div>

      {!filteredRows.length && <div className="extensions-empty-line">
        {tab === "installed" ? "No installed extensions match this view." : tab === "updates" ? "Everything is up to date." : "No extensions match this view."}
      </div>}

      <div className="extensions-table">
        {filteredRows.map((row) => {
          const isExpanded = expanded === row.key;
          const item = row.marketplace;
          const attached = row.skill ? attachedIds.has(row.skill.id) : row.plugin ? attachedIds.has(row.plugin.id) : false;
          return <div className={isExpanded ? "extensions-entry expanded" : "extensions-entry"} key={row.key}>
            <div className="extensions-entry-row" role="button" tabIndex={0} onClick={() => { suppressHover.current = true; setHover(null); setExpanded(isExpanded ? "" : row.key); }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                suppressHover.current = true;
                setHover(null);
                setExpanded(isExpanded ? "" : row.key);
              }}
              onMouseEnter={(event) => scheduleHover(row, event.currentTarget)}
              onMouseLeave={() => { suppressHover.current = false; clearHoverSoon(); }}>
              <span className="extensions-entry-main"><strong>{row.name}</strong><small>{row.description}</small></span>
              <span className={`extensions-type type-${row.type}`}>{TYPE_LABEL[row.type]}</span>
              <span className="extensions-entry-meta" title={tab === "installed" ? row.scope : row.source}>{tab === "installed" ? row.scope : row.source}</span>
              <span className={item?.updateAvailable ? "extensions-entry-status update" : "extensions-entry-status"}>{row.status}</span>
              <span className="extensions-entry-action">
                {item && rowActionLabel(row) && rowActionAvailable(row) && <button className={item.updateAvailable ? "extensions-row-action update" : "extensions-row-action"} onClick={(event) => {
                  event.stopPropagation();
                  startInstall(item);
                }}>{item.updateAvailable ? "Update" : rowActionLabel(row)}</button>}
                {item && rowActionLabel(row) === "Installed" && <span className="extensions-installed-mark"><Check size={12} />Installed</span>}
                {!item && <button className="extensions-row-action" onClick={(event) => {
                  event.stopPropagation();
                  if (row.skill || row.plugin) addToChat(row);
                }} disabled={attached}>{attached ? "Added" : "Add"}</button>}
              </span>
            </div>

            {isExpanded && <div className="extensions-entry-detail">
              <dl className="extensions-meta-grid">
                {item && <><div><dt>Version</dt><dd>{row.version || "—"}</dd></div><div><dt>License</dt><dd>{row.license || "—"}</dd></div><div><dt>Size</dt><dd>{formatBytes(row.size)}</dd></div><div><dt>Installs</dt><dd>{formatCount(row.installs)}</dd></div></>}
                {!item && <><div><dt>Type</dt><dd>{TYPE_LABEL[row.type]}</dd></div><div><dt>Source</dt><dd>{row.source}</dd></div><div><dt>Scope</dt><dd>{row.scope || "—"}</dd></div><div><dt>Path</dt><dd className="mono">{row.path || "—"}</dd></div></>}
                {item && <div><dt>Source</dt><dd>{row.source}</dd></div>}
                {row.permissions.length > 0 && <div className="extensions-permissions"><dt>Permissions</dt><dd>{row.permissions.join(" · ")}</dd></div>}
              </dl>
              <div className="extensions-detail-actions">
                {row.skill || row.plugin ? <button className={attached ? "secondary-button" : "primary-button"} onClick={() => addToChat(row)} disabled={attached}>{attached ? <Check size={13} /> : <Plus size={13} />}{attached ? "Added to chat" : "Add to chat"}</button> : null}
                {item && item.type === "skill" && item.files?.length && (!item.installed || item.updateAvailable) && <button className="primary-button" onClick={() => startInstall(item)}><Download size={13} />{item.updateAvailable ? "Update" : "Install"}</button>}
                {row.homepage && <button className="secondary-button" onClick={() => openHomepage(row)}><ExternalLink size={13} />Open source</button>}
              </div>
            </div>}
          </div>;
        })}
      </div>

      {tab === "available" && feed && filteredRows.length > 0 && <div className="extensions-showing">
        <span>Showing {filteredRows.length} of {formatCount(feed.total)}</span>
        {feed.total > filteredRows.length && filteredRows.length >= limit && <button onClick={() => setLimit((current) => Math.min(72, current + 24))} disabled={marketLoading}>{marketLoading ? "Loading…" : "Load more"}</button>}
      </div>}
    </>}

    {hover && createPortal(<div className="extensions-hover-card" style={{ left: hover.left, top: hover.top }} onMouseEnter={keepHover} onMouseLeave={clearHoverSoon}>
      <div className="extensions-hover-head">
        <span className="extensions-hover-title"><strong>{hover.row.name}</strong><small>{TYPE_LABEL[hover.row.type]} · {hover.row.source}</small></span>
        <button className="extensions-icon-button" onClick={() => setHover(null)} aria-label="Close preview"><X size={13} /></button>
      </div>
      <dl className="extensions-hover-meta">
        <div><dt>Version</dt><dd>{hover.row.version || "—"}</dd></div>
        <div><dt>License</dt><dd>{hover.row.license || "—"}</dd></div>
        <div><dt>Size</dt><dd>{formatBytes(hover.row.size)}</dd></div>
        <div><dt>{hover.row.marketplace ? "Installs" : "Scope"}</dt><dd>{hover.row.marketplace ? formatCount(hover.row.installs) : hover.row.scope || "—"}</dd></div>
      </dl>
      {hover.row.permissions.length > 0 && <div className="extensions-hover-permissions">{hover.row.permissions.join(" · ")}</div>}
      <div className="extensions-hover-file-head">{hoverPreview.filename || "Primary file"}</div>
      <pre className="extensions-hover-file">{previewText(hover.row, hoverPreview)}</pre>
      <div className="extensions-hover-actions">
        {hover.row.marketplace && hover.row.marketplace.type === "skill" && hover.row.marketplace.files?.length && (!hover.row.marketplace.installed || hover.row.marketplace.updateAvailable) && <button className="primary-button" onClick={() => { setHover(null); startInstall(hover.row.marketplace!); }}><Download size={13} />{hover.row.marketplace.updateAvailable ? "Update" : "Install"}</button>}
        {hover.row.homepage && <button className="secondary-button" onClick={() => openHomepage(hover.row)}><ExternalLink size={13} />Open source</button>}
        {(hover.row.skill || hover.row.plugin) && <button className="secondary-button" onClick={() => addToChat(hover.row)}><Plus size={13} />Add to chat</button>}
      </div>
    </div>, document.body)}

    {sourceManagerOpen && <SourceManager bridge={bridge} sources={feed?.sources || []} onClose={() => setSourceManagerOpen(false)} onSaved={(sources) => {
      setSourceManagerOpen(false);
      setFeed((current) => current ? { ...current, sources } : current);
      refreshFeed();
    }} />}

    {installItem && <div className="extensions-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setInstallItem(null); }}>
      <section className="extensions-modal" role="dialog" aria-modal="true" aria-labelledby="extensions-install-title">
        <header><div><span className="page-kicker">Install extension</span><h2 id="extensions-install-title">{installItem.name}</h2></div><button className="extensions-icon-button" onClick={() => setInstallItem(null)} aria-label="Close"><X size={15} /></button></header>
        <p>{installItem.description}</p>
        <dl className="extensions-install-meta">
          <div><dt>Source</dt><dd>{installItem.source}</dd></div>
          <div><dt>Version</dt><dd>{installItem.version}</dd></div>
          <div><dt>License</dt><dd>{installItem.license}</dd></div>
          <div><dt>Size</dt><dd>{formatBytes(installItem.size)}</dd></div>
        </dl>
        <div className="extensions-install-permissions"><strong>Permissions</strong><span>{installItem.permissions.length ? installItem.permissions.join(" · ") : "No special permissions declared."}</span></div>
        <fieldset className="extensions-scope-field"><legend>Install for</legend>
          <label><input type="radio" name="extension-scope" checked={installScope === "workspace"} onChange={() => setInstallScope("workspace")} /><span>Workspace</span><small>.agents/skills</small></label>
          <label><input type="radio" name="extension-scope" checked={installScope === "global"} onChange={() => setInstallScope("global")} /><span>Global</span><small>~/.agents/skills</small></label>
        </fieldset>
        {installError && <div className="skills-error">{installError}</div>}
        <footer><button className="secondary-button" onClick={() => setInstallItem(null)}>Cancel</button><button className="primary-button" onClick={() => void confirmInstall()} disabled={installBusy}>{installBusy ? <LoaderCircle className="spin" size={13} /> : <Download size={13} />}{installItem.updateAvailable ? "Update" : "Install"}</button></footer>
      </section>
    </div>}
  </section>;
}

function SourceManager({ bridge, sources, onClose, onSaved }: {
  bridge: ResearchDeskBridge;
  sources: ExtensionSource[];
  onClose: () => void;
  onSaved: (sources: ExtensionSource[]) => void;
}) {
  const [draft, setDraft] = useState<ExtensionSource[]>(sources);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [newSource, setNewSource] = useState({ name: "", type: "json" as ExtensionSourceType, url: "", token: "" });
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (sources.length) {
      setDraft(sources);
      return;
    }
    let active = true;
    bridge.listExtensionSources().then((items) => {
      if (active) setDraft(items);
    }).catch((reason) => {
      if (active) setError(String(reason).replace(/^Error:\s*/, ""));
    });
    return () => { active = false; };
  }, [bridge, sources]);

  function updateSource(id: string, patch: Partial<ExtensionSource>) {
    setDraft((current) => current.map((source) => source.id === id ? { ...source, ...patch } : source));
  }

  function addSource() {
    const name = newSource.name.trim();
    if (!name) {
      setError("Give the source a name.");
      return;
    }
    const id = `custom-${Date.now().toString(36)}`;
    setDraft((current) => [...current, {
      id,
      name,
      type: newSource.type,
      url: newSource.url.trim(),
      token: newSource.token.trim(),
      enabled: true,
      builtin: false,
    }]);
    setNewSource({ name: "", type: "json", url: "", token: "" });
    setAdding(false);
    setError("");
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const next = await bridge.saveExtensionSources(draft);
      onSaved(next);
    } catch (reason) {
      setError(String(reason).replace(/^Error:\s*/, ""));
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    setSaving(true);
    setError("");
    try {
      const next = await bridge.resetExtensionSources();
      setDraft(next);
      onSaved(next);
    } catch (reason) {
      setError(String(reason).replace(/^Error:\s*/, ""));
    } finally {
      setSaving(false);
    }
  }

  return <div className="extensions-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="extensions-modal extensions-source-modal" role="dialog" aria-modal="true" aria-labelledby="extensions-sources-title">
      <header><div><span className="page-kicker">Marketplace</span><h2 id="extensions-sources-title">Sources</h2></div><button className="extensions-icon-button" onClick={onClose} aria-label="Close"><X size={15} /></button></header>
      <p>Enable public registries or add a JSON index. Results are deduplicated across sources.</p>
      <div className="extensions-source-list">
        {draft.map((source) => <div className="extensions-source-row" key={source.id}>
          <label className="extensions-source-toggle"><input type="checkbox" checked={source.enabled} onChange={(event) => updateSource(source.id, { enabled: event.target.checked })} /><span>{source.name}</span></label>
          <span className="extensions-source-kind">{SOURCE_TYPE_LABEL[source.type]}</span>
          <span className="extensions-source-state">{source.error ? <span className="error">{source.error}</span> : source.count ? `${source.count} results` : "Not synced"}</span>
          {!source.builtin && <button className="extensions-icon-button" onClick={() => setDraft((current) => current.filter((candidate) => candidate.id !== source.id))} aria-label={`Remove ${source.name}`}><Trash2 size={13} /></button>}
        </div>)}
      </div>
      {adding ? <div className="extensions-new-source">
        <div className="extensions-form-row"><label>Name<input value={newSource.name} onChange={(event) => setNewSource({ ...newSource, name: event.target.value })} placeholder="Lab index" /></label><label>Type<select value={newSource.type} onChange={(event) => setNewSource({ ...newSource, type: event.target.value as ExtensionSourceType })}><option value="json">JSON index</option><option value="github">GitHub</option><option value="mcp">MCP Registry</option><option value="npm">npm search</option></select></label></div>
        <label>URL<input value={newSource.url} onChange={(event) => setNewSource({ ...newSource, url: event.target.value })} placeholder="https://example.org/extensions.json" /></label>
        <label>Token <small>Optional, sent as Bearer</small><input type="password" value={newSource.token} onChange={(event) => setNewSource({ ...newSource, token: event.target.value })} /></label>
        <div className="extensions-form-actions"><button className="secondary-button" onClick={() => setAdding(false)}>Cancel</button><button className="primary-button" onClick={addSource}>Add source</button></div>
      </div> : <button className="extensions-add-source" onClick={() => setAdding(true)}><Plus size={13} />Add source</button>}
      {error && <div className="skills-error">{error}</div>}
      <footer><button className="extensions-reset" onClick={() => void reset()} disabled={saving}>Reset defaults</button><span /><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={() => void save()} disabled={saving}>{saving ? <LoaderCircle className="spin" size={13} /> : <Settings2 size={13} />}Save sources</button></footer>
    </section>
  </div>;
}
