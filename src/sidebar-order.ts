export type SidebarOrder = {
  version: 1;
  apps: string[];
  projects: string[];
  archivedProjects: string[];
  workspaces: Record<string, string[]>;
};

export type SidebarOrderGroup = "apps" | "projects" | "archivedProjects" | "workspaces";
export const SIDEBAR_ORDER_STORAGE_KEY = "archimedes-sidebar-order-v1";
export const EMPTY_SIDEBAR_ORDER: SidebarOrder = { version: 1, apps: [], projects: [], archivedProjects: [], workspaces: {} };

export function orderSidebarIds<T extends { id: string }>(items: T[], saved: string[] = []) {
  const present = new Map(items.map((item) => [item.id, item]));
  const result: T[] = [];
  for (const id of saved) {
    const item = present.get(id);
    if (item) { result.push(item); present.delete(id); }
  }
  result.push(...items.filter((item) => present.has(item.id)));
  return result;
}

export function moveSidebarId(ids: string[], sourceId: string, targetId: string, after = false): string[] {
  if (sourceId === targetId || !ids.includes(sourceId) || !ids.includes(targetId)) return ids;
  const next = ids.filter((id) => id !== sourceId);
  const targetIndex = next.indexOf(targetId);
  next.splice(targetIndex + (after ? 1 : 0), 0, sourceId);
  return next;
}

export function readSidebarOrder(storage?: Pick<Storage, "getItem">): SidebarOrder {
  try {
    const raw = (storage ?? (typeof window === "undefined" ? undefined : window.localStorage))?.getItem(SIDEBAR_ORDER_STORAGE_KEY);
    if (!raw) return EMPTY_SIDEBAR_ORDER;
    const value = JSON.parse(raw) as Partial<SidebarOrder>;
    const strings = (input: unknown) => Array.isArray(input) ? input.filter((id): id is string => typeof id === "string") : [];
    const workspaces = value.workspaces && typeof value.workspaces === "object" ? Object.fromEntries(Object.entries(value.workspaces).map(([id, order]) => [id, strings(order)])) : {};
    return { version: 1, apps: strings(value.apps), projects: strings(value.projects), archivedProjects: strings(value.archivedProjects), workspaces };
  } catch { return EMPTY_SIDEBAR_ORDER; }
}

export function writeSidebarOrder(order: SidebarOrder, storage?: Pick<Storage, "setItem">) {
  try { (storage ?? (typeof window === "undefined" ? undefined : window.localStorage))?.setItem(SIDEBAR_ORDER_STORAGE_KEY, JSON.stringify({ ...order, version: 1 })); } catch { /* Browser storage is optional. */ }
}

export function moveSidebarOrder(order: SidebarOrder, group: SidebarOrderGroup, sourceId: string, targetId: string, after = false, parentId?: string): SidebarOrder {
  if (group === "workspaces") {
    if (!parentId) return order;
    const current = order.workspaces[parentId] ?? [];
    const next = moveSidebarId(current, sourceId, targetId, after);
    return next === current ? order : { ...order, workspaces: { ...order.workspaces, [parentId]: next } };
  }
  const current = order[group];
  const next = moveSidebarId(current, sourceId, targetId, after);
  return next === current ? order : { ...order, [group]: next };
}

export function reconcileSidebarOrder(order: SidebarOrder, available: { apps: string[]; projects: string[]; archivedProjects: string[]; workspaces: Record<string, string[]> }): SidebarOrder {
  const reconcile = (saved: string[], ids: string[]) => orderSidebarIds(ids.map((id) => ({ id })), saved).map((entry) => entry.id);
  const workspaces = Object.fromEntries(Object.entries(available.workspaces).map(([projectId, ids]) => [projectId, reconcile(order.workspaces[projectId] ?? [], ids)]));
  return {
    version: 1,
    apps: reconcile(order.apps, available.apps),
    projects: reconcile(order.projects, available.projects),
    archivedProjects: reconcile(order.archivedProjects, available.archivedProjects),
    workspaces,
  };
}
