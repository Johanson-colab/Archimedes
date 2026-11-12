export type SnapshotTurn = { id: string; user_message: string; assistant_message: string; created_at: string };
export type SnapshotExport = {
  version: 1;
  session: { title: string };
  snapshot: { id: string; created_at: string; sequence: number };
  turns: SnapshotTurn[];
  references: Array<{ title: string; url: string }>;
  events?: unknown[];
};
type FrozenSnapshot = { id: string; created_at: string; sequence: number; manifest: Record<string, unknown> };
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value : "";

export function snapshotTurns(manifest: Record<string, unknown>): SnapshotTurn[] {
  return (Array.isArray(manifest.turns) ? manifest.turns : []).map((value, index) => {
    const row = object(value);
    return { id: text(row.id) || `turn-${index}`, user_message: text(row.user_message), assistant_message: text(row.assistant_message), created_at: text(row.created_at) };
  });
}

export function selectSnapshot(snapshot: FrozenSnapshot, title: string, ids: string[], sources: boolean, diagnostics: boolean): SnapshotExport {
  const selected = new Set(ids);
  const all = snapshotTurns(snapshot.manifest);
  const turns = all.filter((turn) => selected.has(turn.id));
  const isAll = turns.length === all.length;
  const events = (Array.isArray(snapshot.manifest.events) ? snapshot.manifest.events : []).filter((value) => {
    const id = text(object(value).turn_id);
    return id ? selected.has(id) : isAll;
  });
  const references: SnapshotExport["references"] = [];
  const addSource = (value: unknown) => {
    const source = object(value);
    const url = text(source.url);
    if (/^https?:\/\//i.test(url) && !references.some((item) => item.url === url)) references.push({ title: text(source.title), url });
  };
  if (sources) {
    if (isAll && Array.isArray(snapshot.manifest.references)) snapshot.manifest.references.forEach(addSource);
    for (const event of events) {
      const row = object(event);
      let payload = row.payload;
      if (!payload && typeof row.payload_json === "string") { try { payload = JSON.parse(row.payload_json); } catch { /* Keep malformed diagnostics out of sources. */ } }
      addSource(payload);
    }
  }
  return { version: 1, session: { title }, snapshot: { id: snapshot.id, created_at: snapshot.created_at, sequence: snapshot.sequence }, turns, references, ...(diagnostics ? { events } : {}) };
}

export function snapshotMarkdown(snapshot: SnapshotExport) {
  const parts = [`# ${snapshot.session.title}`, ...snapshot.turns.flatMap((turn, index) => [`## ${index + 1} · You`, turn.user_message, "### Archimedes", turn.assistant_message])];
  if (snapshot.references.length) parts.push("## Sources", ...snapshot.references.map((source) => `${source.title || source.url}\n${source.url}`));
  if (snapshot.events) parts.push("## Diagnostic events", "```json\n" + JSON.stringify(snapshot.events, null, 2) + "\n```");
  return parts.join("\n\n") + "\n";
}

export function snapshotFileStem(title: string) {
  return (title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/[. ]+$/g, "").trim().slice(0, 80) || "session") + "-snapshot";
}

export function canShareSessionLink(signedIn: boolean, privateSession: boolean, allTurnIds: string[], selectedIds: string[]) {
  return signedIn && !privateSession && allTurnIds.length > 0 && allTurnIds.every((id) => selectedIds.includes(id));
}
