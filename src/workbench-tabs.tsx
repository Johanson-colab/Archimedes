import type { ReactNode } from "react";
import { FolderTree, GitCompareArrows, ListTree, Milestone, NotebookPen, SquareTerminal } from "lucide-react";

export type WorkbenchTabId = "journey" | "trajectory" | "files" | "changes" | "notes" | "terminal";

export type WorkbenchTabPreferences = {
  version: 1;
  order: WorkbenchTabId[];
  hidden: WorkbenchTabId[];
};

export type WorkbenchTabDefinition = {
  id: WorkbenchTabId;
  labelKey: string;
  descriptionKey: string;
  icon: ReactNode;
};

export const WORKBENCH_TAB_DEFINITIONS: WorkbenchTabDefinition[] = [
  { id: "journey", labelKey: "Journey", descriptionKey: "Research narrative, evidence, and progress.", icon: <Milestone size={13} /> },
  { id: "trajectory", labelKey: "Trajectory", descriptionKey: "Raw agent events and tool calls.", icon: <ListTree size={13} /> },
  { id: "files", labelKey: "Files", descriptionKey: "Browse, preview, and edit workspace files.", icon: <FolderTree size={13} /> },
  { id: "changes", labelKey: "Changes", descriptionKey: "Files changed by the agent in this conversation.", icon: <GitCompareArrows size={13} /> },
  { id: "notes", labelKey: "Notes", descriptionKey: "A scratchpad for ideas and prompt drafts.", icon: <NotebookPen size={13} /> },
  { id: "terminal", labelKey: "Terminal", descriptionKey: "An interactive shell in the workspace.", icon: <SquareTerminal size={13} /> },
];

export const WORKBENCH_TAB_IDS: WorkbenchTabId[] = WORKBENCH_TAB_DEFINITIONS.map((tab) => tab.id);
export const DEFAULT_WORKBENCH_TAB_ORDER: WorkbenchTabId[] = ["journey", "trajectory", "files", "changes", "notes", "terminal"];
export const DEFAULT_WORKBENCH_PREFERENCES: WorkbenchTabPreferences = {
  version: 1,
  order: DEFAULT_WORKBENCH_TAB_ORDER,
  hidden: [],
};

const TAB_ID_SET = new Set<string>(WORKBENCH_TAB_IDS);

export function isWorkbenchTabId(value: unknown): value is WorkbenchTabId {
  return typeof value === "string" && TAB_ID_SET.has(value);
}

export function workbenchTabDefinition(id: WorkbenchTabId) {
  return WORKBENCH_TAB_DEFINITIONS.find((tab) => tab.id === id) ?? WORKBENCH_TAB_DEFINITIONS[0];
}

export function normalizeWorkbenchPreferences(input: unknown): WorkbenchTabPreferences {
  const source = input && typeof input === "object" ? input as { order?: unknown; hidden?: unknown } : {};
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
  if (hidden.length >= order.length) hidden.splice(0, hidden.length, ...order.filter((id) => id !== order[0]));
  return { version: 1, order, hidden };
}

export function visibleWorkbenchTabs(preferences: WorkbenchTabPreferences): WorkbenchTabId[] {
  return preferences.order.filter((id) => !preferences.hidden.includes(id));
}

export function setWorkbenchTabVisibility(preferences: WorkbenchTabPreferences, id: WorkbenchTabId, visible: boolean): WorkbenchTabPreferences {
  const hidden = new Set(preferences.hidden);
  if (visible) hidden.delete(id);
  else {
    if (visibleWorkbenchTabs(preferences).length <= 1) return preferences;
    hidden.add(id);
  }
  return { ...preferences, hidden: preferences.order.filter((tabId) => hidden.has(tabId)) };
}

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
