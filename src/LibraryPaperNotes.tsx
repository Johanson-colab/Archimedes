import { useEffect, useRef, useState } from "react";
import { ExternalLink, Save } from "lucide-react";
import { useUISettings } from "./i18n";
import { InlineNotice } from "./InlineNotice";

export type LibraryNoteDrafts = Map<string, string>;

export function LibraryPaperNotes({ paper, drafts, onSave, compact = false }: {
  paper: LibraryPaper;
  drafts: LibraryNoteDrafts;
  onSave: (notes: string) => Promise<void>;
  compact?: boolean;
}) {
  const { t } = useUISettings();
  const [text, setText] = useState(() => drafts.get(paper.id) ?? paper.notes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const textRef = useRef(text);
  const alive = useRef(true);
  textRef.current = text;
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  // Another view may have saved this paper. Keep any local edits intact.
  useEffect(() => {
    if (!drafts.has(paper.id)) setText(paper.notes);
  }, [drafts, paper.id, paper.notes]);
  async function save() {
    const snapshot = textRef.current;
    setSaving(true);
    setError("");
    try {
      await onSave(snapshot);
      if (drafts.get(paper.id) === snapshot) drafts.delete(paper.id);
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (alive.current) setSaving(false);
    }
  }
  return <section className={`library-note-editor${compact ? " compact" : ""}`} aria-label={t("Reading notes")}>
    <header><div><h2>{t("Reading notes")}</h2><p>{paper.title}</p></div>{paper.url && <a className="icon-button" href={paper.url} target="_blank" rel="noreferrer" aria-label={t("Open source")}><ExternalLink size={15} /></a>}</header>
    {error && <InlineNotice tone="danger">{error}</InlineNotice>}
    <textarea aria-label={t("Reading notes")} placeholder={t("Record questions, evidence, and next steps…")} value={text} onChange={(event) => { setText(event.target.value); drafts.set(paper.id, event.target.value); }} />
    <footer><span role="status">{text === paper.notes ? t("Saved") : t("Unsaved changes")}</span><button className="primary-button" disabled={saving || text === paper.notes} onClick={() => void save()}><Save size={14} />{saving ? t("Saving…") : t("Save notes")}</button></footer>
  </section>;
}
