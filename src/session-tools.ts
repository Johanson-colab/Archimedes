export type SessionSnapshotFormat = "md" | "json" | "png";

export type SessionToolPreferences = {
  version: 1;
  showComments: boolean;
  commentsShowResolved: boolean;
  showSnapshots: boolean;
  snapshotFormat: SessionSnapshotFormat;
  snapshotSources: boolean;
  snapshotDiagnostics: boolean;
};

export const SESSION_TOOL_STORAGE_KEY = "archimedes-session-tools-v1";

export const DEFAULT_SESSION_TOOL_PREFERENCES: SessionToolPreferences = {
  version: 1,
  showComments: true,
  commentsShowResolved: false,
  showSnapshots: true,
  snapshotFormat: "md",
  snapshotSources: true,
  snapshotDiagnostics: false,
};

export function normalizeSessionToolPreferences(input: unknown): SessionToolPreferences {
  const source = input && typeof input === "object" ? input as Partial<SessionToolPreferences> : {};
  const format: SessionSnapshotFormat = source.snapshotFormat === "json" || source.snapshotFormat === "png" ? source.snapshotFormat : "md";
  return {
    version: 1,
    showComments: source.showComments !== false,
    commentsShowResolved: source.commentsShowResolved === true,
    showSnapshots: source.showSnapshots !== false,
    snapshotFormat: format,
    snapshotSources: source.snapshotSources !== false,
    snapshotDiagnostics: source.snapshotDiagnostics === true,
  };
}

export function readSessionToolPreferences(storage: Pick<Storage, "getItem"> | undefined = typeof localStorage === "undefined" ? undefined : localStorage): SessionToolPreferences {
  if (!storage) return DEFAULT_SESSION_TOOL_PREFERENCES;
  try {
    const raw = storage.getItem(SESSION_TOOL_STORAGE_KEY);
    return raw ? normalizeSessionToolPreferences(JSON.parse(raw)) : DEFAULT_SESSION_TOOL_PREFERENCES;
  } catch {
    return DEFAULT_SESSION_TOOL_PREFERENCES;
  }
}

export function writeSessionToolPreferences(preferences: SessionToolPreferences, storage: Pick<Storage, "setItem"> | undefined = typeof localStorage === "undefined" ? undefined : localStorage) {
  if (!storage) return;
  try {
    storage.setItem(SESSION_TOOL_STORAGE_KEY, JSON.stringify(normalizeSessionToolPreferences(preferences)));
  } catch {
    // Storage can be unavailable in private or restricted renderer contexts.
  }
}
