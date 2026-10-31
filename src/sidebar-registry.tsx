import type { ReactNode } from "react";
import { BookOpen, CalendarDays, FilePenLine, ImagePlus, Puzzle, Radar } from "lucide-react";

export type MainSection = "chat" | "extensions" | "library" | "daily" | "benchmark-radar" | "image-creation" | "files" | "writing";
export type SidebarSection = "knowledge" | "create";

export type SidebarEntry = {
  id: string;
  commandId: string;
  section: SidebarSection;
  labelKey: string;
  icon: ReactNode;
  order: number;
  destination: { type: "section"; section: MainSection };
  badge?: string;
  disabled?: boolean;
  source?: "core" | `plugin:${string}`;
};

/**
 * Core navigation is a projection over this registry. A knowledge source or
 * output type can be added as one entry; it must not introduce a new
 * top-level section or push arbitrary JSX into the sidebar.
 */
export const coreSidebarEntries: SidebarEntry[] = [
  { id: "library", commandId: "open-library", section: "knowledge", labelKey: "Library", icon: <BookOpen size={15} />, order: 10, destination: { type: "section", section: "library" } },
  { id: "daily", commandId: "open-daily-papers", section: "knowledge", labelKey: "Daily papers", icon: <CalendarDays size={15} />, order: 20, destination: { type: "section", section: "daily" } },
  { id: "benchmark-radar", commandId: "open-benchmark-radar", section: "knowledge", labelKey: "Benchmark Radar", icon: <Radar size={15} />, order: 30, destination: { type: "section", section: "benchmark-radar" } },
  { id: "extensions", commandId: "open-extensions", section: "knowledge", labelKey: "Extensions", icon: <Puzzle size={15} />, order: 40, destination: { type: "section", section: "extensions" } },
  { id: "writing", commandId: "open-paper-writing", section: "create", labelKey: "Paper writing", icon: <FilePenLine size={15} />, order: 10, destination: { type: "section", section: "writing" } },
  { id: "image-creation", commandId: "open-image-creation", section: "create", labelKey: "Image creation", icon: <ImagePlus size={15} />, order: 20, destination: { type: "section", section: "image-creation" } },
];

export function sidebarEntries(section: SidebarSection) {
  return coreSidebarEntries
    .filter((entry) => entry.section === section)
    .slice()
    .sort((left, right) => left.order - right.order);
}
