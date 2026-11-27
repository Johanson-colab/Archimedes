export type SidebarSectionId = "apps" | "projects";
export type SidebarSectionCollapse = Record<SidebarSectionId, boolean>;

export const SIDEBAR_SECTION_COLLAPSE_STORAGE_KEY = "archimedes-sidebar-sections-collapsed-v1";
export const LEGACY_SIDEBAR_SECTION_KEYS = [
  "archimedes-sidebar-sections-v3",
  "archimedes-sidebar-sections-v2",
  "archimedes-sidebar-sections-v1",
] as const;
export const DEFAULT_SIDEBAR_SECTION_COLLAPSE: SidebarSectionCollapse = {
  apps: false,
  projects: false,
};

function readCollapsed(value: unknown): SidebarSectionCollapse | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<SidebarSectionCollapse>;
  if (typeof candidate.apps !== "boolean" && typeof candidate.projects !== "boolean") return null;
  return {
    apps: candidate.apps === true,
    projects: candidate.projects === true,
  };
}

export function readSidebarSectionCollapse(storage?: Pick<Storage, "getItem">): SidebarSectionCollapse {
  try {
    const target = storage ?? (typeof window === "undefined" ? undefined : window.localStorage);
    const current = target?.getItem(SIDEBAR_SECTION_COLLAPSE_STORAGE_KEY);
    if (current) {
      const saved = readCollapsed(JSON.parse(current));
      if (saved) return saved;
    }
    for (const key of LEGACY_SIDEBAR_SECTION_KEYS) {
      const raw = target?.getItem(key);
      if (!raw) continue;
      const saved = readCollapsed(JSON.parse(raw)?.collapsed);
      if (saved) return saved;
    }
  } catch { /* Browser storage is optional. */ }
  return DEFAULT_SIDEBAR_SECTION_COLLAPSE;
}

export function writeSidebarSectionCollapse(value: SidebarSectionCollapse, storage?: Pick<Storage, "setItem">) {
  try {
    (storage ?? (typeof window === "undefined" ? undefined : window.localStorage))
      ?.setItem(SIDEBAR_SECTION_COLLAPSE_STORAGE_KEY, JSON.stringify(value));
  } catch { /* Browser storage is optional. */ }
}
