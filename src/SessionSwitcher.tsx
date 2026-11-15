import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Box,
  ChevronDown,
  GitBranch,
  Lock,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash,
} from "lucide-react";
import { MenuDivider, MenuItem, MenuSurface } from "./Menu";
import { useUISettings } from "./i18n";
import { workspaceName } from "./workspace-name";
import WorkspaceMenuActions from "./WorkspaceMenuActions";

type SessionFilter = "all" | "mine" | "shared" | "archived";
type SessionStatus = "idle" | "running" | "review" | "failed" | "unread";

type SessionSwitcherProps = {
  project: ResearchProject | null;
  workspace: ProjectWorkspace | null;
  workspaces: ProjectWorkspace[];
  sessions: ResearchThread[];
  archivedSessions: ResearchThread[];
  activeSessionId: string | null;
  runningThreadId: string | null;
  currentUserId: string;
  creatingWorkspace: boolean;
  onOpenSession: (session: ResearchThread) => void;
  onNewSession: () => void;
  onPinSession: (session: ResearchThread, pinned: boolean) => void;
  onArchiveSession: (session: ResearchThread, archived: boolean) => void;
  onDeleteSession: (session: ResearchThread) => void;
  onSelectWorkspace: (workspace: ProjectWorkspace) => void;
  onCreateWorkspace: (kind: ProjectWorkspaceKind) => void;
  onRenameWorkspace: (workspace: ProjectWorkspace) => void;
  onDeleteWorkspace: (workspace: ProjectWorkspace) => void;
  openSignal: number;
};

const FILTERS: SessionFilter[] = ["all", "mine", "shared", "archived"];

function sessionStatus(session: ResearchThread, runningThreadId: string | null): SessionStatus {
  if (session.status === "running" || session.id === runningThreadId) return "running";
  if ((session.pending_actions ?? 0) > 0) return "review";
  if (session.status === "error") return "failed";
  if ((session.unread_count ?? 0) > 0) return "unread";
  return "idle";
}

function isPinned(session: ResearchThread) {
  return Boolean(Number(session.pinned ?? 0));
}

function relativeTime(value: string | null | undefined, language: "en" | "zh") {
  if (!value) return "";
  const elapsed = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(elapsed)) return "";
  const formatter = new Intl.RelativeTimeFormat(language === "zh" ? "zh-CN" : "en", { numeric: "auto" });
  const minutes = Math.round(elapsed / 60_000);
  if (Math.abs(minutes) < 60) return formatter.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(-hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return formatter.format(-days, "day");
  const months = Math.round(days / 30);
  return formatter.format(-months, "month");
}

function gitStateLabel(project: ResearchProject | null, workspace: ProjectWorkspace | null, t: (key: string, values?: Record<string, string | number>) => string) {
  if (workspace?.kind === "sandbox") return t("Isolated copy · edits stay in this workspace");
  if (workspace?.kind === "worktree") return t("Isolated Git worktree · base {ref}", { ref: workspace.base_ref || "HEAD" });
  switch (project?.git_state) {
    case "ready":
      return project.git_branch ? t("Git repository · {branch}", { branch: project.git_branch }) : t("Git repository");
    case "empty":
      return t("Git repository with no commits");
    case "nested":
      return t("Nested Git folder");
    case "suspicious":
      return t("Git folder needs attention");
    default:
      return t("No Git repository · shared workspace");
  }
}

function statusLabel(status: SessionStatus, t: (key: string) => string) {
  switch (status) {
    case "running": return t("Running");
    case "review": return t("Needs review");
    case "failed": return t("Failed");
    case "unread": return t("New output");
    default: return t("Idle");
  }
}

export default function SessionSwitcher({
  project,
  workspace,
  workspaces,
  sessions,
  archivedSessions,
  activeSessionId,
  runningThreadId,
  currentUserId,
  creatingWorkspace,
  onOpenSession,
  onNewSession,
  onPinSession,
  onArchiveSession,
  onDeleteSession,
  onSelectWorkspace,
  onCreateWorkspace,
  onRenameWorkspace,
  onDeleteWorkspace,
  openSignal,
}: SessionSwitcherProps) {
  const { t, language } = useUISettings();
  const sessionButtonRef = useRef<HTMLButtonElement | null>(null);
  const workspaceButtonRef = useRef<HTMLButtonElement | null>(null);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaceFocus, setWorkspaceFocus] = useState<"first" | "none">("none");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SessionFilter>("all");
  const activeSession = sessions.find((session) => session.id === activeSessionId) ?? null;

  useEffect(() => {
    if (openSignal > 0) {
      setWorkspaceOpen(false);
      setSessionOpen(true);
    }
  }, [openSignal]);

  useEffect(() => {
    if (!sessionOpen) {
      setQuery("");
      setFilter("all");
    }
  }, [sessionOpen]);

  const filtered = useMemo(() => {
    const source = filter === "archived"
      ? archivedSessions
      : sessions.filter((session) => filter === "all"
        || (filter === "mine" ? session.owner_id === currentUserId : session.owner_id !== currentUserId));
    const normalized = query.trim().toLowerCase();
    if (!normalized) return source;
    return source.filter((session) => session.title.toLowerCase().includes(normalized));
  }, [archivedSessions, currentUserId, filter, query, sessions]);

  const pinned = filter === "archived" ? [] : filtered.filter(isPinned);
  const rest = filtered.filter((session) => !pinned.includes(session));
  const activeStatus = activeSession ? sessionStatus(activeSession, runningThreadId) : "idle";
  const canWorktree = project?.git_state === "ready";
  const gitState = gitStateLabel(project, workspace, t);

  function chooseSession(session: ResearchThread) {
    setSessionOpen(false);
    onOpenSession(session);
  }

  function navigateRows(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target as HTMLElement;
    if (!target.matches(".session-row-open, .workspace-option-main")) return;
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const rows = [...event.currentTarget.querySelectorAll<HTMLButtonElement>(".session-row-open, .workspace-option-main")];
    const index = rows.indexOf(target as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length;
    event.preventDefault();
    rows[next]?.focus();
  }

  function renderSessionRow(session: ResearchThread) {
    const status = sessionStatus(session, runningThreadId);
    const pinnedNow = isPinned(session);
    return <div className={`session-row${session.id === activeSessionId ? " active" : ""}`} key={session.id}>
      <button
        className="session-row-open"
        onClick={() => chooseSession(session)}
        aria-current={session.id === activeSessionId ? "true" : undefined}
        title={`${session.title} · ${statusLabel(status, t)}`}
      >
        <span className={`session-status ${status}`} aria-label={statusLabel(status, t)} />
        <span className="session-row-copy">
          <span className="session-row-title">
            {session.visibility === "private" && <Lock size={11} aria-hidden="true" />}
            {session.title}
          </span>
          <span className="session-row-meta">
            <span>{relativeTime(session.last_turn_at || session.updated_at, language)}</span>
            {session.owner_id === currentUserId && <span>{t("Mine")}</span>}
          </span>
        </span>
      </button>
      <span className="session-row-actions">
        {filter !== "archived" && <button
          className={`session-row-action${pinnedNow ? " active" : ""}`}
          onClick={() => onPinSession(session, !pinnedNow)}
          title={pinnedNow ? t("Unpin session") : t("Pin session")}
          aria-label={pinnedNow ? t("Unpin session") : t("Pin session")}
          aria-pressed={pinnedNow}
        >{pinnedNow ? <PinOff size={13} /> : <Pin size={13} />}</button>}
        <button
          className="session-row-action"
          onClick={() => onArchiveSession(session, filter !== "archived")}
          title={filter === "archived" ? t("Restore session") : t("Archive session")}
          aria-label={filter === "archived" ? t("Restore session") : t("Archive session")}
        >{filter === "archived" ? <ArchiveRestore size={13} /> : <Archive size={13} />}</button>
        {filter === "archived" && <button
          className="session-row-action danger"
          onClick={() => onDeleteSession(session)}
          title={t("Delete session")}
          aria-label={t("Delete session")}
        ><Trash size={13} /></button>}
      </span>
    </div>;
  }

  return <>
    <div className="toolbar-context">
      <div className="toolbar-breadcrumb" aria-label={t("Project and workspace")}>
        <span className="toolbar-project" title={project?.workspace_path || project?.name || ""}>{project?.name || t("No project")}</span>
        <span className="toolbar-breadcrumb-divider" aria-hidden="true">/</span>
        <button
          ref={workspaceButtonRef}
          className={workspaceOpen ? "toolbar-workspace open" : "toolbar-workspace"}
          onClick={(event) => { setSessionOpen(false); setWorkspaceFocus(event.detail === 0 ? "first" : "none"); setWorkspaceOpen((open) => !open); }}
          title={`${workspace?.root || ""} · ${gitState}`}
          aria-haspopup="dialog"
          aria-expanded={workspaceOpen}
        >
          <span>{workspaceName(workspace, t)}</span>
          <ChevronDown size={12} />
        </button>
      </div>

      <button
        ref={sessionButtonRef}
        className={sessionOpen ? "session-chip open" : "session-chip"}
        onClick={() => { setWorkspaceOpen(false); setSessionOpen((open) => !open); }}
        title={t("Switch session")}
        aria-haspopup="dialog"
        aria-expanded={sessionOpen}
      >
        <span className={`session-status ${activeStatus}`} aria-hidden="true" />
        <span className="session-chip-title">{activeSession?.title || t("New session")}</span>
        <ChevronDown size={13} />
      </button>
    </div>

    <MenuSurface
      open={workspaceOpen}
      onClose={() => setWorkspaceOpen(false)}
      anchorRef={workspaceButtonRef}
      placement="bottom-start"
      width={380}
      minWidth={300}
      maxHeight={520}
      role="dialog"
      focus={workspaceFocus}
      ariaLabel={t("Workspaces")}
      className="workspace-switcher-popover"
    >
      <div className="workspace-list" onKeyDown={navigateRows}>
        {workspaces.map((entry) => {
          const isCurrentWorkspace = entry.id === workspace?.id;
          return <div className={isCurrentWorkspace ? "workspace-option active" : "workspace-option"} key={entry.id}>
          <button
            className="workspace-option-main"
            onClick={() => { setWorkspaceOpen(false); onSelectWorkspace(entry); }}
            aria-current={isCurrentWorkspace ? "true" : undefined}
            title={entry.root}
          >
            <span className="workspace-option-copy">
              <span>{workspaceName(entry, t)}</span>
              <small>{entry.root}</small>
            </span>
            <span className="workspace-option-count">{entry.session_count}</span>
          </button>
          <span className="workspace-option-actions">
            <WorkspaceMenuActions compact workspace={entry} canWorktree={canWorktree} disabled={creatingWorkspace}
              onRename={() => { setWorkspaceOpen(false); onRenameWorkspace(entry); }}
              onDelete={() => { setWorkspaceOpen(false); onDeleteWorkspace(entry); }}
            />
          </span>
        </div>;
        })}
      </div>
      <MenuDivider />
      {canWorktree && <MenuItem
        icon={<GitBranch size={16} />}
        disabled={creatingWorkspace}
        onClick={() => { setWorkspaceOpen(false); onCreateWorkspace("worktree"); }}
      >{t("New worktree")}</MenuItem>}
      <MenuItem
        icon={<Box size={16} />}
        disabled={creatingWorkspace}
        onClick={() => { setWorkspaceOpen(false); onCreateWorkspace("sandbox"); }}
      >{t("New sandbox")}</MenuItem>
    </MenuSurface>

    <MenuSurface
      open={sessionOpen}
      onClose={() => setSessionOpen(false)}
      anchorRef={sessionButtonRef}
      placement="bottom-end"
      width={420}
      minWidth={320}
      maxHeight={560}
      role="dialog"
      ariaLabel={t("Sessions")}
      className="session-switcher-popover"
    >
      <div className="session-menu-heading">
        <div><strong>{t("Sessions")}</strong><span title={workspace?.root}>{workspaceName(workspace, t)}</span></div>
        <small>{filtered.length}</small>
      </div>
      <label className="session-search">
        <Search size={14} aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("Search sessions")}
          aria-label={t("Search sessions")}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              (event.currentTarget.closest(".menu-surface")?.querySelector<HTMLElement>(".session-row-open"))?.focus();
            }
          }}
        />
      </label>
      <div className="session-filters" role="group" aria-label={t("Session filters")}>
        {FILTERS.map((id) => <button
          key={id}
          className={filter === id ? "active" : ""}
          onClick={() => setFilter(id)}
          aria-pressed={filter === id}
        >{id === "all" ? t("All") : id === "mine" ? t("Mine") : id === "shared" ? t("Shared") : t("Archived")}</button>)}
      </div>
      <div className="session-list" onKeyDown={navigateRows}>
        {pinned.length > 0 && <div className="session-list-label">{t("Pinned")}</div>}
        {pinned.map(renderSessionRow)}
        {pinned.length > 0 && rest.length > 0 && <div className="session-list-label">{t("Recent")}</div>}
        {rest.map(renderSessionRow)}
        {!filtered.length && <div className="session-empty">
          <strong>{filter === "archived" ? t("No archived sessions") : query ? t("No sessions match") : t("No sessions here yet")}</strong>
          <span>{t("Sessions stay inside their workspace, so switching does not move files.")}</span>
        </div>}
      </div>
      <div className="session-switcher-foot">
        <span>{t("Alt+↑/↓ switches sessions")}</span>
        <button className="session-new-link" onClick={() => { setSessionOpen(false); onNewSession(); }}><Plus size={13} />{t("New session")}</button>
      </div>
    </MenuSurface>
  </>;
}
