export type ArtifactSource = "agent" | "run" | "change-set";
export type ArtifactKind = "image" | "pdf" | "csv" | "json" | "markdown" | "html" | "svg" | "text" | "other";
export type ArtifactFilter = "all" | "images" | "pdf" | "data" | "docs" | "web";

export type ArtifactItem = {
  id: string;
  path: string;
  title: string;
  kind: ArtifactKind;
  size: number | null;
  modifiedAt: string;
  createdAt: string;
  turnId: string | null;
  version: number;
  source: ArtifactSource;
  status?: "created" | "modified" | "deleted";
  seen: boolean;
};

type ArtifactRecord = {
  id: string;
  thread_id: string;
  turn_id?: string | null;
  path: string;
  title: string;
  kind: ArtifactKind;
  size_bytes: number;
  modified_at: string;
  version: number;
  source: ArtifactSource;
  created_at: string;
  updated_at: string;
  seen: number | boolean;
};

type ChangeSetLike = {
  id: string;
  threadId?: string | null;
  turnId?: string;
  createdAt: string;
  changes: Array<{ path: string; status?: "created" | "modified" | "deleted"; additions?: number; deletions?: number }>;
};

const ARTIFACT_EXTENSIONS = new Map<string, ArtifactKind>([
  ["png", "image"], ["jpg", "image"], ["jpeg", "image"], ["webp", "image"], ["gif", "image"], ["bmp", "image"],
  ["pdf", "pdf"],
  ["csv", "csv"], ["tsv", "csv"],
  ["json", "json"],
  ["md", "markdown"], ["markdown", "markdown"], ["mdx", "markdown"],
  ["svg", "svg"],
  ["html", "html"], ["htm", "html"],
  ["txt", "text"], ["log", "text"],
]);

export function artifactKind(filePath: string): ArtifactKind {
  const extension = filePath.split(".").at(-1)?.toLowerCase() ?? "";
  return ARTIFACT_EXTENSIONS.get(extension) ?? "other";
}

export function isArtifactPath(filePath: string): boolean {
  return artifactKind(filePath) !== "other";
}

export function artifactTitle(filePath: string): string {
  return filePath.split("/").at(-1) || filePath;
}

export function artifactTypeLabel(kind: ArtifactKind): string {
  switch (kind) {
    case "image": return "PNG";
    case "svg": return "SVG";
    case "pdf": return "PDF";
    case "csv": return "CSV";
    case "json": return "JSON";
    case "markdown": return "MD";
    case "html": return "HTML";
    case "text": return "TXT";
    default: return "FILE";
  }
}

export function artifactTypeLabelForPath(filePath: string): string {
  const extension = filePath.split(".").at(-1)?.toUpperCase() ?? "";
  return extension || artifactTypeLabel(artifactKind(filePath));
}

export function artifactSourceLabel(source: ArtifactSource): string {
  return source === "change-set" ? "change set" : "agent";
}

export function artifactStatusLabel(status: ArtifactItem["status"]): string {
  if (status === "modified") return "modified";
  if (status === "deleted") return "deleted";
  return "added";
}

export function formatArtifactSize(size: number | null | undefined): string {
  if (typeof size !== "number" || !Number.isFinite(size) || size < 0) return "";
  if (size < 1024) return `${Math.round(size)} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function artifactMatchesFilter(item: ArtifactItem, filter: ArtifactFilter): boolean {
  if (filter === "all") return true;
  if (filter === "images") return item.kind === "image" || item.kind === "svg";
  if (filter === "pdf") return item.kind === "pdf";
  if (filter === "data") return item.kind === "csv" || item.kind === "json";
  if (filter === "docs") return item.kind === "markdown" || item.kind === "text";
  return item.kind === "html" || item.kind === "svg";
}

export function filterArtifacts(items: ArtifactItem[], filter: ArtifactFilter): ArtifactItem[] {
  return filter === "all" ? items : items.filter((item) => artifactMatchesFilter(item, filter));
}

export function mergeArtifacts(records: ArtifactRecord[], changeSets: ChangeSetLike[], currentTurnId?: string | null): ArtifactItem[] {
  const byPath = new Map<string, ArtifactItem>();
  for (const record of records) {
    const kind = artifactKind(record.path);
    byPath.set(record.path, {
      id: record.id,
      path: record.path,
      title: record.title || artifactTitle(record.path),
      kind: kind === "other" ? record.kind : kind,
      size: Number(record.size_bytes) || null,
      modifiedAt: record.modified_at,
      createdAt: record.updated_at || record.created_at,
      turnId: record.turn_id ?? currentTurnId ?? null,
      version: record.version || 1,
      source: record.source,
      seen: Boolean(record.seen),
    });
  }
  for (const changeSet of changeSets) {
    for (const change of changeSet.changes) {
      if (!isArtifactPath(change.path) || byPath.has(change.path)) continue;
      byPath.set(change.path, {
        id: `change:${changeSet.id}:${change.path}`,
        path: change.path,
        title: artifactTitle(change.path),
        kind: artifactKind(change.path),
        size: null,
        modifiedAt: changeSet.createdAt,
        createdAt: changeSet.createdAt,
        turnId: changeSet.turnId ?? null,
        version: 1,
        source: "change-set",
        status: change.status ?? "modified",
        seen: false,
      });
    }
  }
  return [...byPath.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.title.localeCompare(right.title));
}

export function groupArtifacts(items: ArtifactItem[], currentTurnId?: string | null): { thisTurn: ArtifactItem[]; earlier: ArtifactItem[] } {
  if (!currentTurnId) return { thisTurn: [], earlier: items };
  const thisTurn: ArtifactItem[] = [];
  const earlier: ArtifactItem[] = [];
  for (const item of items) (item.turnId === currentTurnId ? thisTurn : earlier).push(item);
  return { thisTurn, earlier };
}

export function unseenArtifactCount(items: ArtifactItem[]): number {
  return items.filter((item) => !item.seen).length;
}

export function nextArtifactIndex(length: number, index: number, offset: number): number {
  if (length <= 0) return 0;
  return ((index + offset) % length + length) % length;
}
