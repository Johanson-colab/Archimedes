import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { BookOpen, CalendarDays, ClipboardCheck, FilePenLine, FlaskConical, ImagePlus, Newspaper, Puzzle, Radar } from "lucide-react";

export type SidebarSection = "knowledge" | "create" | "evaluate";

/**
 * A sidebar module is one pluggable unit of the left navigation. Every entry
 * in the registry below is a built-in module (`source: "core"`); the field
 * already accepts `plugin:<id>` so runtime-registered modules can join this
 * same projection once they land.
 */
export type SidebarModuleId = "library" | "daily" | "news" | "benchmark-radar" | "extensions" | "reproduce" | "writing" | "image-creation" | "paper-review";

/** Main sections that are not modules: they stay hardcoded in App. */
export type MainSection = "chat" | "files" | SidebarModuleId | `plugin:${string}`;

/** A loaded plugin module contributes one view through its activate() return. */
export type PluginContribution = {
  view: () => ReactNode;
  /** Mutable context handed to activate(); the host wires refresh() on mount. */
  context?: Record<string, unknown>;
};

export type SidebarEntry = {
  id: string;
  commandId: string;
  section: SidebarSection;
  labelKey: string;
  /** Toolbar title while the module is active. */
  titleKey: string;
  /** Declarative icon component; hosts decide the rendering size. */
  icon: LucideIcon;
  order: number;
  destination: { type: "section"; section: MainSection };
  badge?: string;
  disabled?: boolean;
  source?: "core" | `plugin:${string}`;
  /** Keep the view mounted (hidden) while another module is active. */
  keepMounted?: boolean;
  /** Wrapper class used while `keepMounted`. */
  cacheClass?: string;
  /** Mount only when a workspace is ready. */
  requiresWorkspace?: boolean;
  /** Set for runtime-registered plugin modules. */
  plugin?: PluginContribution;
};

/**
 * Core navigation is a projection over this registry. A knowledge source or
 * output type can be added as one entry; it must not introduce a new
 * top-level section or push arbitrary JSX into the sidebar.
 */
export const coreSidebarEntries: SidebarEntry[] = [
  { id: "library", commandId: "open-library", section: "knowledge", labelKey: "Library", titleKey: "Library", icon: BookOpen, order: 10, destination: { type: "section", section: "library" }, source: "core", keepMounted: true, cacheClass: "library-view-cache", requiresWorkspace: true },
  { id: "daily", commandId: "open-daily-papers", section: "knowledge", labelKey: "Daily papers", titleKey: "Daily papers", icon: CalendarDays, order: 20, destination: { type: "section", section: "daily" }, source: "core", requiresWorkspace: true },
  { id: "news", commandId: "open-news", section: "knowledge", labelKey: "News", titleKey: "News", icon: Newspaper, order: 25, destination: { type: "section", section: "news" }, source: "core" },
  { id: "benchmark-radar", commandId: "open-benchmark-radar", section: "knowledge", labelKey: "Benchmark Radar", titleKey: "Benchmark Radar", icon: Radar, order: 30, destination: { type: "section", section: "benchmark-radar" }, source: "core" },
  { id: "extensions", commandId: "open-extensions", section: "knowledge", labelKey: "Extensions", titleKey: "Extensions", icon: Puzzle, order: 40, destination: { type: "section", section: "extensions" }, source: "core" },
  { id: "reproduce", commandId: "open-reproduce", section: "create", labelKey: "Reproduce", titleKey: "Reproduce", icon: FlaskConical, order: 5, destination: { type: "section", section: "reproduce" }, source: "core" },
  { id: "writing", commandId: "open-paper-writing", section: "create", labelKey: "Paper writing", titleKey: "Paper writing", icon: FilePenLine, order: 10, destination: { type: "section", section: "writing" }, source: "core", keepMounted: true, cacheClass: "paper-writing-view-cache", requiresWorkspace: true },
  { id: "image-creation", commandId: "open-image-creation", section: "create", labelKey: "Image creation", titleKey: "Image creation", icon: ImagePlus, order: 20, destination: { type: "section", section: "image-creation" }, source: "core", keepMounted: true, cacheClass: "image-creation-view-cache" },
  { id: "paper-review", commandId: "open-paper-review", section: "evaluate", labelKey: "Paper review", titleKey: "Paper review", icon: ClipboardCheck, order: 10, destination: { type: "section", section: "paper-review" }, source: "core" },
];

/** Runtime plugin modules register here; the projection below merges them. */
const pluginEntriesStore: SidebarEntry[] = [];

export function registerPluginEntries(entries: SidebarEntry[]) {
  pluginEntriesStore.splice(0, pluginEntriesStore.length, ...entries);
}

export function pluginSidebarEntries(): readonly SidebarEntry[] {
  return pluginEntriesStore;
}

export function sidebarEntries(section: SidebarSection) {
  return [...coreSidebarEntries, ...pluginEntriesStore]
    .filter((entry) => entry.section === section)
    .slice()
    .sort((left, right) => left.order - right.order);
}

export function sidebarModule(id: string): SidebarEntry | undefined {
  return coreSidebarEntries.find((entry) => entry.id === id) ?? pluginEntriesStore.find((entry) => entry.id === id);
}
