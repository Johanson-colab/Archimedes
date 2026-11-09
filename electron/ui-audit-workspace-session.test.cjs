const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { readLocale } = require("./locale-source.cjs");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const app = read("src/App.tsx");
const switcher = read("src/SessionSwitcher.tsx");
const store = read("electron/store.cjs");
const preload = read("electron/preload.cjs");
const main = read("electron/main.cjs");
const types = read("src/vite-env.d.ts");
const css = read("src/styles.css");
const i18n = readLocale();

test("projects, environments, workspaces and sessions share one local database", () => {
  assert.match(store, /CREATE TABLE IF NOT EXISTS project_environments/);
  assert.match(store, /CREATE TABLE IF NOT EXISTS project_workspaces/);
  assert.match(store, /kind TEXT NOT NULL DEFAULT 'shared'/);
  assert.match(store, /ensureColumn\(db, "research_projects", "git_state"/);
  assert.match(store, /ensureColumn\(db, "research_threads", "workspace_id"/);
  assert.match(store, /ensureColumn\(db, "research_threads", "pinned"/);
  assert.match(store, /ensureColumn\(db, "research_threads", "last_viewed_at"/);
  assert.match(store, /ensureColumn\(db, "research_artifacts", "project_id"/);
  assert.match(store, /ensureColumn\(db, "research_artifacts", "sha256"/);
  assert.match(store, /function migrateProjectWorkspaces/);
  assert.match(store, /function ensureProjectSharedWorkspace/);
  assert.match(store, /function listProjectWorkspaces/);
  assert.match(store, /workspaces: listProjectWorkspaces\(\)/);
  assert.match(store, /function createProjectWorkspace/);
  assert.match(store, /function deleteProjectWorkspace/);
  assert.match(store, /function pinResearchThread/);
  assert.match(store, /function markResearchThreadViewed/);
});

test("git state is detected without making git a project requirement", () => {
  const probe = read("electron/git-state.cjs");
  assert.match(probe, /function detectGitState/);
  assert.match(store, /GIT_STATES = new Set\(\["none", "empty", "ready", "nested", "suspicious"\]\)/);
  assert.match(probe, /rev-parse", "--show-toplevel"/);
  assert.match(probe, /gitdir:/);
  assert.match(store, /detectGitState/);
  assert.match(store, /git_state = \?/);
});

test("workspace and session actions cross the desktop bridge", () => {
  assert.match(preload, /listResearchWorkspaces: \(projectId = null\)/);
  assert.match(preload, /createResearchWorkspace: \(projectId, kind = "shared"\)/);
  assert.match(preload, /deleteResearchWorkspace: \(id\)/);
  assert.match(preload, /pinResearchThread: \(id, pinned = true\)/);
  assert.match(preload, /markResearchThreadViewed: \(id\)/);
  assert.match(main, /ipcMain\.handle\("research-workspace:list"/);
  assert.match(main, /ipcMain\.handle\("research-workspace:create"/);
  assert.match(main, /ipcMain\.handle\("research-workspace:delete"/);
  assert.match(main, /ipcMain\.handle\("research-thread:pin"/);
  assert.match(main, /ipcMain\.handle\("research-thread:mark-viewed"/);
  assert.match(types, /listResearchWorkspaces: \(projectId\?: string \| null\)/);
  assert.match(types, /workspaceId\?: string/);
  assert.match(types, /interface ProjectWorkspace/);
  assert.match(types, /workspaces: ProjectWorkspace\[\]/);
});

test("the main toolbar carries a breadcrumb and one session chip instead of tabs", () => {
  assert.match(app, /<SessionSwitcher/);
  assert.doesNotMatch(app, /conversation-title/);
  assert.match(switcher, /className="toolbar-breadcrumb"/);
  assert.match(switcher, /className=\{sessionOpen \? "session-chip open" : "session-chip"\}/);
  assert.match(switcher, /session-chip-title/);
  assert.match(switcher, /aria-haspopup="dialog"/);
  assert.match(switcher, /onOpenSession\(session\)/);
  assert.match(switcher, /onNewSession\(\)/);
});

test("session search, filters, pinning, archiving and status are exposed", () => {
  assert.match(switcher, /placeholder=\{t\("Search sessions"\)\}/);
  assert.match(switcher, /FILTERS: SessionFilter\[\] = \["all", "mine", "shared", "archived"\]/);
  assert.match(switcher, /pinned\.length > 0 && rest\.length > 0 && <MenuDivider \/>/);
  assert.match(switcher, /onPinSession\(session, !pinnedNow\)/);
  assert.match(switcher, /onArchiveSession\(session, filter !== "archived"\)/);
  assert.match(switcher, /session-status \$\{status\}/);
  assert.match(switcher, /sessionStatus\(session, runningThreadId\)/);
  assert.match(switcher, /pending_actions/);
  assert.match(switcher, /unread_count/);
  assert.match(switcher, /className="session-new-link"/);
  assert.doesNotMatch(switcher, /session-switcher-head|session-new-button|session-open-search|workspace-option-icon|workspace-git-note|session-row-state|session-group-label/);
});

test("the switcher only sees the active workspace and preserves sessions across switches", () => {
  assert.match(app, /const workspaceSessions = useMemo/);
  assert.match(app, /threads\.filter\(\(thread\) => thread\.workspace_id === activeWorkspace\.id\)/);
  assert.match(app, /sessions=\{workspaceSessions\}/);
  assert.match(app, /archivedSessions=\{archivedWorkspaceSessions\}/);
  assert.match(app, /markResearchThreadViewed\?\.\(threadSummary\.id\)/);
  assert.match(app, /Alt\+↑\/↓|BracketLeft|BracketRight/);
  assert.match(app, /conversationScrollPositionsRef = useRef\(new Map/);
  assert.match(app, /initialScrollTop=\{conversationScrollPositionsRef\.current\.get/);
  assert.match(app, /onScrollTop=\{\(top\) => conversationScrollPositionsRef\.current\.set/);
});

test("workspace switching and isolated workspace creation are wired in the renderer", () => {
  assert.match(app, /async function selectWorkspace/);
  assert.match(app, /async function createWorkspace/);
  assert.match(app, /async function deleteWorkspace/);
  assert.match(app, /const resolvedKind = kind \?\? \(project\?\.git_state === "ready" \? "worktree" : "sandbox"\)/);
  assert.match(app, /createResearchWorkspace\(projectId, resolvedKind\)/);
  assert.match(app, /onNewWorkspace=\{\(projectId\) => void createWorkspaceForProject\(projectId\)\}/);
  assert.match(app, /deleteResearchWorkspace\(workspaceToDelete\.id\)/);
  assert.match(switcher, /onCreateWorkspace\("worktree"\)/);
  assert.match(switcher, /onCreateWorkspace\("sandbox"\)/);
  assert.match(switcher, /project\?\.git_state === "ready"/);
  assert.match(switcher, /\{canWorktree && <MenuItem/);
});

test("the switcher adapts to narrow screens as a full-height sheet", () => {
  assert.match(css, /\.menu-surface\.session-switcher-popover \{ padding: 0; overflow: hidden; \}/);
  assert.match(css, /@media \(max-width: 720px\) \{[\s\S]*?\.menu-surface\.session-switcher-popover/);
  assert.match(css, /\.session-status \{\s*width: 2px;\s*height: 12px;[^}]*border-radius: 1px/);
  assert.match(css, /\.session-status\.running \{ background: var\(--accent\); animation: sidebar-running-sheen/);
  assert.match(css, /\.session-chip \{[^}]*border: 0/);
  assert.match(css, /\.session-row\.active \{ background: var\(--menu-selected-bg\); \}/);
  assert.match(css, /\.workspace-option-copy small \{/);
});

test("workspace and session strings are translated", () => {
  for (const key of [
    "Search sessions",
    "New session",
    "New worktree",
    "New sandbox",
    "Pin session",
    "Archive session",
    "Main workspace",
    "Git repository",
    "No Git repository · shared workspace",
    "Workspaces",
    "Session filters",
    "{count} sessions",
  ]) {
    assert.match(i18n, new RegExp(`"${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`), `missing ${key}`);
  }
});
