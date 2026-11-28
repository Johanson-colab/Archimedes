export function discoveryStorageKey(dataRoot: string, projectId?: string | null) {
  return `archimedes-discovery-v1:${JSON.stringify([dataRoot, projectId || "local"])}`;
}

// Persist controls only. The desktop cache owns the paper lists and freshness.
export function readDiscoveryControls<T extends Record<string, string | number>>(key: string, defaults: T): T {
  try {
    const saved = JSON.parse(window.localStorage.getItem(key) || "{}");
    return Object.fromEntries(Object.entries(defaults).map(([name, fallback]) => [
      name, typeof saved?.[name] === typeof fallback ? saved[name] : fallback,
    ])) as T;
  } catch {
    return defaults;
  }
}

export function writeDiscoveryControls(key: string, controls: Record<string, string | number>) {
  try {
    window.localStorage.setItem(key, JSON.stringify(controls));
  } catch (error) {
    console.warn("Could not persist discovery controls", error);
  }
}
