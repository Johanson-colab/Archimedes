import metadata from "../shared/research-apps.json";

export type ResearchAppCategory = "discovery" | "evidence" | "experiments" | "analysis" | "writing";
export const researchAppCategories = metadata.categories as Array<{ id: ResearchAppCategory; label: string; description: string }>;
export const researchAppMetadata = metadata.apps;
export const defaultDisabledResearchApps = Object.entries(metadata.apps).filter(([, app]) => !app.defaultEnabled).map(([id]) => id);

/** Explicit app metadata wins; legacy plugins remain discoverable without new manifests. */
export function researchAppCategory(app: { id: string; researchCategory?: string; section?: string }): ResearchAppCategory {
  if (researchAppCategories.some((category) => category.id === app.researchCategory)) return app.researchCategory as ResearchAppCategory;
  const id = app.id.split("/").pop()?.replace(/^plugin:/, "") ?? app.id;
  const known = metadata.legacyAppCategories as Record<string, ResearchAppCategory>;
  const sections = metadata.legacySectionCategories as Record<string, ResearchAppCategory>;
  return (Object.hasOwn(known, id) ? known[id] : undefined)
    ?? (app.section && Object.hasOwn(sections, app.section) ? sections[app.section] : undefined)
    ?? "evidence";
}
