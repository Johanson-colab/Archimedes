import type { ReactNode } from "react";
import { Compass, FolderTree, GalleryVerticalEnd, GitCompareArrows, ListTree, Milestone, NotebookPen, SquareTerminal } from "lucide-react";

export type WorkbenchTabId = "journey" | "trajectory" | "files" | "changes" | "artifacts" | "notes" | "terminal" | "browser";

export const WORKBENCH_PREFERENCES_VERSION = 4;

/** Phase 1 keeps the workbench to two panes so every pane stays readable. */
export const MAX_WORKBENCH_PANES = 2;
/** The workbench starts on Trajectory to match the historical default. */
export const DEFAULT_WORKBENCH_ACTIVE_TAB: WorkbenchTabId = "trajectory";
/** Each pane keeps at least a quarter of the workbench so both stay usable. */
export const MIN_WORKBENCH_PANE_PERCENT = 25;

export type WorkbenchPaneOrientation = "row" | "column";
export type WorkbenchDropPlacement = "before" | "after";

export type WorkbenchPane = {
  id: string;
  tabs: WorkbenchTabId[];
  active: WorkbenchTabId;
  /** Share of the workbench along the split axis. Pane sizes add up to 100. */
  size: number;
};

export type WorkbenchLayout = {
  orientation: WorkbenchPaneOrientation;
  focused: string;
  panes: WorkbenchPane[];
};

export type WorkbenchTabPreferences = {
  version: typeof WORKBENCH_PREFERENCES_VERSION;
  order: WorkbenchTabId[];
  hidden: WorkbenchTabId[];
  layout: WorkbenchLayout;
};

export type WorkbenchTabDefinition = {
  id: WorkbenchTabId;
  labelKey: string;
  descriptionKey: string;
  icon: ReactNode;
  /** Optional tabs stay hidden until the user enables them in Settings. */
  optional?: boolean;
};

export const WORKBENCH_TAB_DEFINITIONS: WorkbenchTabDefinition[] = [
  { id: "journey", labelKey: "Journey", descriptionKey: "Research narrative, evidence, and progress.", icon: <Milestone size={13} /> },
  { id: "trajectory", labelKey: "Trajectory", descriptionKey: "Raw agent events and tool calls.", icon: <ListTree size={13} /> },
  { id: "files", labelKey: "Files", descriptionKey: "Browse, preview, and edit workspace files.", icon: <FolderTree size={13} /> },
  { id: "changes", labelKey: "Changes", descriptionKey: "Files changed by the agent in this conversation.", icon: <GitCompareArrows size={13} /> },
  { id: "artifacts", labelKey: "Artifacts", descriptionKey: "Agent outputs collected from this conversation: figures, PDFs, data, Markdown, and web previews.", icon: <GalleryVerticalEnd size={13} />, optional: true },
  { id: "notes", labelKey: "Notes", descriptionKey: "A scratchpad for ideas and prompt drafts.", icon: <NotebookPen size={13} /> },
  { id: "terminal", labelKey: "Terminal", descriptionKey: "An interactive shell in the workspace.", icon: <SquareTerminal size={13} /> },
  { id: "browser", labelKey: "Browser", descriptionKey: "A lightweight browser for reading pages beside your research. Off by default.", icon: <Compass size={13} />, optional: true },
];

export const WORKBENCH_TAB_IDS: WorkbenchTabId[] = WORKBENCH_TAB_DEFINITIONS.map((tab) => tab.id);
export const DEFAULT_WORKBENCH_TAB_ORDER: WorkbenchTabId[] = ["journey", "trajectory", "files", "changes", "artifacts", "notes", "terminal", "browser"];
export const OPTIONAL_WORKBENCH_TAB_IDS: WorkbenchTabId[] = WORKBENCH_TAB_DEFINITIONS.filter((tab) => tab.optional).map((tab) => tab.id);

const TAB_ID_SET = new Set<string>(WORKBENCH_TAB_IDS);

export function isWorkbenchTabId(value: unknown): value is WorkbenchTabId {
  return typeof value === "string" && TAB_ID_SET.has(value);
}

export function workbenchTabDefinition(id: WorkbenchTabId) {
  return WORKBENCH_TAB_DEFINITIONS.find((tab) => tab.id === id) ?? WORKBENCH_TAB_DEFINITIONS[0];
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 50;
  return Math.min(100 - MIN_WORKBENCH_PANE_PERCENT, Math.max(MIN_WORKBENCH_PANE_PERCENT, value));
}

function nextPaneId(used: Set<string>) {
  let index = 1;
  while (used.has(`pane-${index}`)) index += 1;
  return `pane-${index}`;
}

function sortTabs(tabs: WorkbenchTabId[], order: WorkbenchTabId[]) {
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...tabs].sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
}

function defaultActiveTab(tabs: WorkbenchTabId[]): WorkbenchTabId {
  return tabs.includes(DEFAULT_WORKBENCH_ACTIVE_TAB) ? DEFAULT_WORKBENCH_ACTIVE_TAB : tabs[0];
}

/** Pane shares add up to 100 while keeping every pane above the minimum. */
export function normalizePaneSizes(panes: WorkbenchPane[]): WorkbenchPane[] {
  if (panes.length <= 1) return panes.map((pane) => ({ ...pane, size: 100 }));
  if (panes.length === 2) {
    const first = clampPercent(panes[0].size || 50);
    return [{ ...panes[0], size: first }, { ...panes[1], size: 100 - first }];
  }
  const weights = panes.map((pane) => (Number.isFinite(pane.size) && pane.size > 0 ? pane.size : 1));
  const total = weights.reduce((sum, weight) => sum + weight, 0) || panes.length;
  return panes.map((pane, index) => ({ ...pane, size: (weights[index] / total) * 100 }));
}

/** Build the default single-pane layout for an order/hidden pair. */
export function defaultWorkbenchLayout(order: WorkbenchTabId[], hidden: WorkbenchTabId[]): WorkbenchLayout {
  const tabs = order.filter((id) => !hidden.includes(id));
  return {
    orientation: "row",
    focused: "pane-1",
    panes: [{ id: "pane-1", tabs, active: defaultActiveTab(tabs), size: 100 }],
  };
}

export function normalizeWorkbenchLayout(input: unknown, order: WorkbenchTabId[], hidden: WorkbenchTabId[]): WorkbenchLayout {
  const visible = order.filter((id) => !hidden.includes(id));
  const source = input && typeof input === "object" ? input as Partial<WorkbenchLayout> : {};
  const orientation: WorkbenchPaneOrientation = source.orientation === "column" ? "column" : "row";
  const rawPanes = Array.isArray(source.panes) ? source.panes : [];
  const seen = new Set<WorkbenchTabId>();
  const panes: WorkbenchPane[] = [];

  for (const candidate of rawPanes) {
    if (panes.length >= MAX_WORKBENCH_PANES) break;
    if (!candidate || typeof candidate !== "object") continue;
    const tabs: WorkbenchTabId[] = [];
    for (const value of Array.isArray(candidate.tabs) ? candidate.tabs : []) {
      if (!isWorkbenchTabId(value) || seen.has(value) || !visible.includes(value)) continue;
      seen.add(value);
      tabs.push(value);
    }
    if (!tabs.length) continue;
    const active = isWorkbenchTabId(candidate.active) && tabs.includes(candidate.active) ? candidate.active : defaultActiveTab(tabs);
    const size = typeof candidate.size === "number" && Number.isFinite(candidate.size) ? candidate.size : 100 / (panes.length + 1);
    panes.push({ id: typeof candidate.id === "string" && candidate.id ? candidate.id : `pane-${panes.length + 1}`, tabs, active, size });
  }

  if (!panes.length && visible.length) {
    panes.push({ id: "pane-1", tabs: [...visible], active: defaultActiveTab(visible), size: 100 });
    for (const id of visible) seen.add(id);
  }

  // Tabs removed by an older layout, unknown ids, or a third pane are folded
  // back into the first pane instead of being silently dropped.
  const remaining = visible.filter((id) => !seen.has(id));
  if (remaining.length && panes.length) {
    panes[0] = { ...panes[0], tabs: sortTabs([...panes[0].tabs, ...remaining], order) };
    if (!panes[0].tabs.includes(panes[0].active)) panes[0] = { ...panes[0], active: defaultActiveTab(panes[0].tabs) };
  }

  const used = new Set<string>();
  for (const pane of panes) {
    if (!pane.id || used.has(pane.id)) pane.id = nextPaneId(used);
    used.add(pane.id);
  }

  const focused = typeof source.focused === "string" && panes.some((pane) => pane.id === source.focused)
    ? source.focused
    : panes[0]?.id ?? "pane-1";
  return { orientation, focused, panes: normalizePaneSizes(panes) };
}

export const DEFAULT_WORKBENCH_PREFERENCES: WorkbenchTabPreferences = {
  version: WORKBENCH_PREFERENCES_VERSION,
  order: DEFAULT_WORKBENCH_TAB_ORDER,
  hidden: [...OPTIONAL_WORKBENCH_TAB_IDS],
  layout: defaultWorkbenchLayout(DEFAULT_WORKBENCH_TAB_ORDER, OPTIONAL_WORKBENCH_TAB_IDS),
};

export function normalizeWorkbenchPreferences(input: unknown): WorkbenchTabPreferences {
  const source = input && typeof input === "object" ? input as { version?: unknown; order?: unknown; hidden?: unknown; layout?: unknown } : {};
  const version = typeof source.version === "number" ? source.version : 1;
  const order: WorkbenchTabId[] = [];
  const seen = new Set<WorkbenchTabId>();
  const rawOrder = Array.isArray(source.order) ? source.order : [];
  for (const value of rawOrder) {
    if (!isWorkbenchTabId(value) || seen.has(value)) continue;
    seen.add(value);
    order.push(value);
  }
  for (const id of DEFAULT_WORKBENCH_TAB_ORDER) {
    if (seen.has(id)) continue;
    seen.add(id);
    order.push(id);
  }
  const hidden: WorkbenchTabId[] = [];
  const rawHidden = Array.isArray(source.hidden) ? source.hidden : [];
  for (const value of rawHidden) {
    if (!isWorkbenchTabId(value) || !order.includes(value) || hidden.includes(value)) continue;
    hidden.push(value);
  }
  if (version < WORKBENCH_PREFERENCES_VERSION) {
    // v2 added Browser; v3 added Artifacts; v4 only adds the split layout.
    // Migration should hide only newly introduced tabs, never re-hide a tab
    // the user explicitly enabled.
    const newlyHidden = version < 2 ? OPTIONAL_WORKBENCH_TAB_IDS : version < 3 ? (["artifacts"] as WorkbenchTabId[]) : [];
    for (const id of newlyHidden) {
      if (order.includes(id) && !hidden.includes(id)) hidden.push(id);
    }
  }
  if (hidden.length >= order.length) hidden.splice(0, hidden.length, ...order.filter((id) => id !== order[0]));
  const hiddenOrder = order.filter((id) => hidden.includes(id));
  return {
    version: WORKBENCH_PREFERENCES_VERSION,
    order,
    hidden: hiddenOrder,
    layout: normalizeWorkbenchLayout(source.layout, order, hiddenOrder),
  };
}

export function visibleWorkbenchTabs(preferences: WorkbenchTabPreferences): WorkbenchTabId[] {
  return preferences.order.filter((id) => !preferences.hidden.includes(id));
}

export function focusedWorkbenchPane(layout: WorkbenchLayout): WorkbenchPane {
  return layout.panes.find((pane) => pane.id === layout.focused) ?? layout.panes[0];
}

export function workbenchPaneForTab(layout: WorkbenchLayout, tab: WorkbenchTabId): WorkbenchPane | undefined {
  return layout.panes.find((pane) => pane.tabs.includes(tab));
}

/** Tabs currently selected in at least one pane. Used to decide which panels are awake. */
export function activeWorkbenchPaneTabs(layout: WorkbenchLayout): Set<WorkbenchTabId> {
  return new Set(layout.panes.map((pane) => pane.active));
}

function replacePane(layout: WorkbenchLayout, paneId: string, update: (pane: WorkbenchPane) => WorkbenchPane): WorkbenchLayout {
  return { ...layout, panes: layout.panes.map((pane) => (pane.id === paneId ? update(pane) : pane)) };
}

export function selectWorkbenchTab(preferences: WorkbenchTabPreferences, tab: WorkbenchTabId): WorkbenchTabPreferences {
  const next = preferences.hidden.includes(tab) ? setWorkbenchTabVisibility(preferences, tab, true) : preferences;
  const pane = workbenchPaneForTab(next.layout, tab);
  if (!pane) {
    const target = focusedWorkbenchPane(next.layout);
    return {
      ...next,
      layout: replacePane(next.layout, target.id, (current) => ({ ...current, tabs: [...current.tabs, tab], active: tab })),
    };
  }
  return {
    ...next,
    layout: {
      ...next.layout,
      focused: pane.id,
      panes: next.layout.panes.map((entry) => entry.id === pane.id ? { ...entry, active: tab } : entry),
    },
  };
}

export function focusWorkbenchPane(preferences: WorkbenchTabPreferences, paneId: string): WorkbenchTabPreferences {
  if (!preferences.layout.panes.some((pane) => pane.id === paneId)) return preferences;
  return { ...preferences, layout: { ...preferences.layout, focused: paneId } };
}

export function setWorkbenchPaneActive(preferences: WorkbenchTabPreferences, paneId: string, tab: WorkbenchTabId): WorkbenchTabPreferences {
  const pane = preferences.layout.panes.find((entry) => entry.id === paneId);
  if (!pane || !pane.tabs.includes(tab)) return preferences;
  return {
    ...preferences,
    layout: {
      ...preferences.layout,
      focused: paneId,
      panes: preferences.layout.panes.map((entry) => entry.id === paneId ? { ...entry, active: tab } : entry),
    },
  };
}

export function setWorkbenchTabVisibility(preferences: WorkbenchTabPreferences, id: WorkbenchTabId, visible: boolean): WorkbenchTabPreferences {
  const hidden = new Set(preferences.hidden);
  if (visible) hidden.delete(id);
  else {
    if (visibleWorkbenchTabs(preferences).length <= 1) return preferences;
    hidden.add(id);
  }
  const hiddenOrder = preferences.order.filter((tabId) => hidden.has(tabId));
  let panes: WorkbenchPane[] = [];
  for (const pane of preferences.layout.panes) {
    const tabs = pane.tabs.filter((tabId) => !hidden.has(tabId));
    if (!tabs.length) continue;
    panes.push({ ...pane, tabs, active: tabs.includes(pane.active) ? pane.active : defaultActiveTab(tabs) });
  }
  if (visible && !panes.some((pane) => pane.tabs.includes(id))) {
    const target = panes.find((pane) => pane.id === preferences.layout.focused) ?? panes[0];
    if (target) {
      target.tabs = sortTabs([...target.tabs, id], preferences.order);
      target.active = id;
    } else {
      panes = [{ id: "pane-1", tabs: [id], active: id, size: 100 }];
    }
  }
  if (!panes.length) {
    const remaining = preferences.order.filter((tabId) => !hidden.has(tabId));
    panes = [{ id: "pane-1", tabs: remaining, active: defaultActiveTab(remaining), size: 100 }];
  }
  const focused = panes.some((pane) => pane.id === preferences.layout.focused) ? preferences.layout.focused : panes[0].id;
  return {
    ...preferences,
    hidden: hiddenOrder,
    layout: { ...preferences.layout, focused, panes: normalizePaneSizes(panes) },
  };
}

/** Show a hidden tab directly inside a specific pane. */
export function showWorkbenchTab(preferences: WorkbenchTabPreferences, tab: WorkbenchTabId, paneId?: string): WorkbenchTabPreferences {
  let next = preferences.hidden.includes(tab) ? setWorkbenchTabVisibility(preferences, tab, true) : preferences;
  if (paneId && next.layout.panes.some((pane) => pane.id === paneId)) {
    const current = workbenchPaneForTab(next.layout, tab);
    if (current && current.id !== paneId) next = moveWorkbenchTabToPane(next, tab, paneId);
    else next = focusWorkbenchPane(next, paneId);
  }
  return selectWorkbenchTab(next, tab);
}

/** Settings reordering keeps the global order; pane strips keep their own order. */
export function moveWorkbenchTab(preferences: WorkbenchTabPreferences, source: WorkbenchTabId, target: WorkbenchTabId): WorkbenchTabPreferences {
  if (source === target) return preferences;
  const from = preferences.order.indexOf(source);
  const to = preferences.order.indexOf(target);
  if (from < 0 || to < 0) return preferences;
  const next = preferences.order.filter((id) => id !== source);
  const targetIndex = next.indexOf(target);
  next.splice(from < to ? targetIndex + 1 : targetIndex, 0, source);
  return { ...preferences, order: next };
}

export function moveWorkbenchTabByOffset(preferences: WorkbenchTabPreferences, id: WorkbenchTabId, offset: -1 | 1): WorkbenchTabPreferences {
  const visible = visibleWorkbenchTabs(preferences);
  const index = visible.indexOf(id);
  const target = visible[index + offset];
  return target ? moveWorkbenchTab(preferences, id, target) : preferences;
}

/** Reorder a tab inside its pane, following the same before/after rule as the strip. */
export function moveWorkbenchPaneTab(preferences: WorkbenchTabPreferences, paneId: string, source: WorkbenchTabId, target: WorkbenchTabId): WorkbenchTabPreferences {
  if (source === target) return preferences;
  const pane = preferences.layout.panes.find((entry) => entry.id === paneId);
  if (!pane || !pane.tabs.includes(source) || !pane.tabs.includes(target)) return preferences;
  const from = pane.tabs.indexOf(source);
  const to = pane.tabs.indexOf(target);
  const tabs = pane.tabs.filter((id) => id !== source);
  const targetIndex = tabs.indexOf(target);
  tabs.splice(from < to ? targetIndex + 1 : targetIndex, 0, source);
  return { ...preferences, layout: replacePane(preferences.layout, paneId, (current) => ({ ...current, tabs })) };
}

export function moveWorkbenchTabByPaneOffset(preferences: WorkbenchTabPreferences, paneId: string, id: WorkbenchTabId, offset: -1 | 1): WorkbenchTabPreferences {
  const pane = preferences.layout.panes.find((entry) => entry.id === paneId);
  if (!pane) return preferences;
  const target = pane.tabs[pane.tabs.indexOf(id) + offset];
  return target ? moveWorkbenchPaneTab(preferences, paneId, id, target) : preferences;
}

/** Move a tab to another pane. Removing the last tab of the source pane closes it. */
export function moveWorkbenchTabToPane(preferences: WorkbenchTabPreferences, tab: WorkbenchTabId, paneId: string, beforeTab?: WorkbenchTabId): WorkbenchTabPreferences {
  const layout = preferences.layout;
  const source = workbenchPaneForTab(layout, tab);
  const target = layout.panes.find((pane) => pane.id === paneId);
  if (!source || !target) return preferences;
  if (source.id === paneId) return beforeTab ? moveWorkbenchPaneTab(preferences, paneId, tab, beforeTab) : setWorkbenchPaneActive(preferences, paneId, tab);

  let panes = layout.panes
    .map((pane) => pane.id === source.id ? { ...pane, tabs: pane.tabs.filter((id) => id !== tab) } : pane)
    .filter((pane) => pane.tabs.length > 0)
    .map((pane) => {
      if (pane.id !== paneId) return pane;
      const index = beforeTab ? pane.tabs.indexOf(beforeTab) : -1;
      const tabs = [...pane.tabs];
      tabs.splice(index >= 0 ? index : tabs.length, 0, tab);
      return { ...pane, tabs, active: tab };
    });
  panes = normalizePaneSizes(panes);
  const focused = panes.some((pane) => pane.id === paneId) ? paneId : panes[0].id;
  return { ...preferences, layout: { ...layout, focused, panes } };
}

/**
 * Split a tab into a new pane on the requested side. If the workbench already
 * has the maximum number of panes the tab is moved into the target pane instead.
 */
export function splitWorkbenchTab(
  preferences: WorkbenchTabPreferences,
  tab: WorkbenchTabId,
  targetPaneId: string,
  placement: WorkbenchDropPlacement,
  orientation: WorkbenchPaneOrientation,
): WorkbenchTabPreferences {
  const layout = preferences.layout;
  if (layout.panes.length >= MAX_WORKBENCH_PANES) return moveWorkbenchTabToPane(preferences, tab, targetPaneId);
  const source = workbenchPaneForTab(layout, tab);
  const targetIndex = layout.panes.findIndex((pane) => pane.id === targetPaneId);
  if (!source || targetIndex < 0) return preferences;
  if (source.id === targetPaneId && source.tabs.length <= 1) return preferences;

  let panes = layout.panes
    .map((pane) => pane.id === source.id ? { ...pane, tabs: pane.tabs.filter((id) => id !== tab) } : pane)
    .filter((pane) => pane.tabs.length > 0);
  if (!panes.length) return preferences;
  const focusIndex = panes.findIndex((pane) => pane.id === targetPaneId);
  if (focusIndex < 0) return moveWorkbenchTabToPane(preferences, tab, panes[0].id);
  const used = new Set(panes.map((pane) => pane.id));
  const pane: WorkbenchPane = { id: nextPaneId(used), tabs: [tab], active: tab, size: 50 };
  panes.splice(placement === "after" ? focusIndex + 1 : focusIndex, 0, pane);
  // A fresh split starts even; the divider takes over from there.
  panes = normalizePaneSizes(panes.map((entry) => ({ ...entry, size: 100 / panes.length })));
  return { ...preferences, layout: { orientation, focused: pane.id, panes } };
}

export function closeWorkbenchPane(preferences: WorkbenchTabPreferences, paneId: string): WorkbenchTabPreferences {
  const layout = preferences.layout;
  if (layout.panes.length <= 1) return preferences;
  const index = layout.panes.findIndex((pane) => pane.id === paneId);
  if (index < 0) return preferences;
  const closing = layout.panes[index];
  const target = layout.panes[index - 1] ?? layout.panes[index + 1];
  if (!target) return preferences;
  const panes = layout.panes
    .filter((pane) => pane.id !== paneId)
    .map((pane) => pane.id === target.id
      ? { ...pane, tabs: sortTabs([...pane.tabs, ...closing.tabs], preferences.order), active: pane.active }
      : pane);
  return { ...preferences, layout: { ...layout, focused: target.id, panes: normalizePaneSizes(panes) } };
}

export function resizeWorkbenchPanes(preferences: WorkbenchTabPreferences, sizes: number[]): WorkbenchTabPreferences {
  const panes = preferences.layout.panes.map((pane, index) => ({ ...pane, size: sizes[index] ?? pane.size }));
  return { ...preferences, layout: { ...preferences.layout, panes: normalizePaneSizes(panes) } };
}

export function setWorkbenchOrientation(preferences: WorkbenchTabPreferences, orientation: WorkbenchPaneOrientation): WorkbenchTabPreferences {
  if (preferences.layout.orientation === orientation) return preferences;
  return { ...preferences, layout: { ...preferences.layout, orientation } };
}
