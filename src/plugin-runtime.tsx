import { createElement, useEffect, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Calendar,
  FilePen,
  FlaskConical,
  ImagePlus,
  Puzzle,
  Radar,
  Sparkle,
  Table,
  Timer,
} from "lucide-react";
import { researchAppCategory } from "./research-apps";
import { registerPluginEntries, type PluginContribution, type SidebarEntry } from "./sidebar-registry";

/**
 * Runtime sidebar plugins (route A+ in #244): an installed plugin is a folder
 * with manifest.json plus a bundled ESM entry, loaded same-context through the
 * archimedes-plugin:// scheme. The manifest declares one sidebar view in a
 * fixed section; there is no sandbox — safety comes from the official catalog,
 * checksums, and the engine gate enforced at install time.
 */

const PLUGIN_ICONS: Record<string, LucideIcon> = {
  "book-open": BookOpen,
  "calendar-days": Calendar,
  "file-pen-line": FilePen,
  "flask-conical": FlaskConical,
  "image-plus": ImagePlus,
  puzzle: Puzzle,
  radar: Radar,
  sparkles: Sparkle,
  table: Table,
  timer: Timer,
};

export function PluginModuleView({ entry }: { entry: SidebarEntry }) {
  const [failed, setFailed] = useState(false);
  const [, refreshTick] = useState(0);
  const contribution = entry.plugin;
  useEffect(() => {
    if (!contribution) return undefined;
    contribution.context = contribution.context || {};
    contribution.context.refresh = () => refreshTick((tick) => tick + 1);
    return () => {
      contribution.context = contribution.context || {};
      contribution.context.refresh = () => undefined;
    };
  }, [contribution]);
  if (failed || !contribution) return null;
  try {
    return <div className="plugin-module-host">{contribution.view()}</div>;
  } catch {
    setFailed(true);
    return null;
  }
}

async function activatePlugin(record: SidebarPluginRecord, order: number): Promise<SidebarEntry> {
  const entryFile = record.entry || "main.mjs";
  const moduleUrl = `archimedes-plugin://${record.id}/${entryFile}`;
  const mod = await import(/* @vite-ignore */ moduleUrl);
  const candidate = mod as { activate?: unknown; default?: { activate?: unknown } };
  const activate = typeof candidate.activate === "function" ? candidate.activate : candidate.default?.activate;
  if (typeof activate !== "function") throw new Error("The plugin module does not export activate().");
  const context: Record<string, unknown> = { h: createElement, pluginId: record.id, version: record.version, refresh: () => undefined };
  const contribution = (activate as (context: Record<string, unknown>) => PluginContribution | undefined)(context);
  if (!contribution || typeof contribution.view !== "function") throw new Error("activate() must return an object with a view() function.");
  contribution.context = context;
  return {
    id: `plugin:${record.id}`,
    commandId: `open-plugin-${record.id}`,
    section: record.section === "create" ? "create" : "knowledge",
    researchCategory: researchAppCategory(record),
    labelKey: record.name,
    titleKey: record.title || record.name,
    icon: PLUGIN_ICONS[record.icon] ?? Puzzle,
    order,
    destination: { type: "section", section: `plugin:${record.id}` },
    source: `plugin:${record.id}`,
    plugin: contribution,
  };
}

/** Load installed plugins, activate the enabled ones, and register their entries. */
export async function loadSidebarPlugins(bridge: { listSidebarPlugins: () => Promise<SidebarPluginRecord[]> }): Promise<SidebarEntry[]> {
  const records = await bridge.listSidebarPlugins();
  const entries: SidebarEntry[] = [];
  let order = 1000;
  for (const record of records) {
    if (!record.enabled || record.error) continue;
    try {
      entries.push(await activatePlugin(record, order));
      order += 10;
    } catch (error) {
      console.warn(`Sidebar plugin ${record.id} failed to load.`, error);
    }
  }
  registerPluginEntries(entries);
  return entries;
}
