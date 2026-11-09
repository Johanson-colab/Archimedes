import type { ReactNode } from "react";
import { researchAppMetadata, type ResearchAppCategory } from "./research-apps";
import type { LucideIcon } from "lucide-react";
import { BookOpen, Calendar, ChartLine, ClipboardCheck, FilePen, FlaskConical, ImagePlus, Puzzle, Radar, Rss, Table, Presentation } from "lucide-react";

// Legacy plugin sections remain compatible; research categories drive app management.
export type SidebarSection = "knowledge" | "create" | "evaluate";

/**
 * A sidebar module is one pluggable unit of the left navigation. Every entry
 * in the registry below is a built-in module (`source: "core"`); the field
 * already accepts `plugin:<id>` so runtime-registered modules can join this
 * same projection once they land.
 */
export type SidebarModuleId = "library" | "daily" | "news" | "benchmark-radar" | "extensions" | "reproduce" | "writing" | "image-creation" | "data-charts" | "data-analysis" | "paper-review" | "paper-to-slides";

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
  researchCategory?: ResearchAppCategory;
  descriptionKey?: string;
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
export const coreSidebarEntries: SidebarEntry[] = ([
  { id: "library", commandId: "open-library", section: "knowledge", labelKey: "Library", titleKey: "Library", icon: BookOpen, destination: { type: "section", section: "library" }, source: "core", keepMounted: true, cacheClass: "library-view-cache", requiresWorkspace: true },
  { id: "daily", commandId: "open-daily-papers", section: "knowledge", labelKey: "Daily papers", titleKey: "Daily papers", icon: Calendar, destination: { type: "section", section: "daily" }, source: "core", requiresWorkspace: true },
  { id: "news", commandId: "open-news", section: "knowledge", labelKey: "News", titleKey: "News", icon: Rss, destination: { type: "section", section: "news" }, source: "core" },
  { id: "benchmark-radar", commandId: "open-benchmark-radar", section: "knowledge", labelKey: "Benchmark Radar", titleKey: "Benchmark Radar", icon: Radar, destination: { type: "section", section: "benchmark-radar" }, source: "core" },
  { id: "extensions", commandId: "open-extensions", section: "knowledge", labelKey: "Extensions", titleKey: "Extensions", icon: Puzzle, destination: { type: "section", section: "extensions" }, source: "core" },
  { id: "reproduce", commandId: "open-reproduce", section: "create", labelKey: "Reproduce", titleKey: "Reproduce", icon: FlaskConical, destination: { type: "section", section: "reproduce" }, source: "core" },
  { id: "writing", commandId: "open-paper-writing", section: "create", labelKey: "Paper writing", titleKey: "Paper writing", icon: FilePen, destination: { type: "section", section: "writing" }, source: "core", keepMounted: true, cacheClass: "paper-writing-view-cache", requiresWorkspace: true },
  { id: "image-creation", commandId: "open-image-creation", section: "create", labelKey: "Image creation", titleKey: "Image creation", icon: ImagePlus, destination: { type: "section", section: "image-creation" }, source: "core", keepMounted: true, cacheClass: "image-creation-view-cache" },
  { id: "data-charts", commandId: "open-data-charts", section: "create", labelKey: "Data charts", titleKey: "Data charts", icon: ChartLine, destination: { type: "section", section: "data-charts" }, source: "core", keepMounted: true, cacheClass: "data-charts-view-cache" },
  { id: "data-analysis", commandId: "open-data-analysis", section: "create", labelKey: "Data analysis", titleKey: "Data analysis", icon: Table, destination: { type: "section", section: "data-analysis" }, source: "core", keepMounted: true, cacheClass: "data-analysis-view-cache" },
  { id: "paper-to-slides", commandId: "open-paper-to-slides", section: "create", labelKey: "Paper to Slides", titleKey: "Paper to Slides", icon: Presentation, destination: { type: "section", section: "paper-to-slides" }, source: "core" },
  { id: "paper-review", commandId: "open-paper-review", section: "evaluate", labelKey: "Paper review", titleKey: "Paper review", icon: ClipboardCheck, destination: { type: "section", section: "paper-review" }, source: "core" },
] satisfies Omit<SidebarEntry, "order">[]).map((entry) => {
  const metadata = researchAppMetadata[entry.id as keyof typeof researchAppMetadata];
  return { ...entry, researchCategory: metadata.category as ResearchAppCategory, descriptionKey: metadata.description, order: metadata.order };
});

/** Runtime plugin modules register here; the projection below merges them. */
const pluginEntriesStore: SidebarEntry[] = [];

export function registerPluginEntries(entries: SidebarEntry[]) {
  pluginEntriesStore.splice(0, pluginEntriesStore.length, ...entries);
}

export function pluginSidebarEntries(): readonly SidebarEntry[] {
  return pluginEntriesStore;
}

export function sidebarEntries(section?: SidebarSection) {
  return [...coreSidebarEntries, ...pluginEntriesStore]
    .filter((entry) => !section || entry.section === section)
    .slice()
    .sort((left, right) => left.order - right.order);
}

export function sidebarModule(id: string): SidebarEntry | undefined {
  return coreSidebarEntries.find((entry) => entry.id === id) ?? pluginEntriesStore.find((entry) => entry.id === id);
}
