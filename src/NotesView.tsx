import { useState } from "react";
import { ArrowUpToLine, LoaderCircle, NotebookPen, Replace } from "lucide-react";
import { useUISettings } from "./i18n";

type NotesViewProps = {
  value: string;
  loading: boolean;
  saveState: "idle" | "saving" | "saved";
  contextLabel: string;
  onChange: (value: string) => void;
  onSend: (text: string, mode: "append" | "replace") => void;
};

export default function NotesView({ value, loading, saveState, contextLabel, onChange, onSend }: NotesViewProps) {
  const { t } = useUISettings();
  const [selection, setSelection] = useState("");
  const canSend = Boolean(value.trim());

  function readSelection(target: HTMLTextAreaElement) {
    const next = target.value.slice(target.selectionStart, target.selectionEnd).trim();
    setSelection(next);
  }

  return <section className="notes-view" aria-label={t("Notes")}>
    <header className="notes-header">
      <div className="notes-heading"><NotebookPen size={13} /><span>{contextLabel}</span></div>
      <span className={`notes-save-state ${saveState}`} aria-live="polite">
        {saveState === "saving" ? <><LoaderCircle className="spin" size={11} />{t("Saving")}</> : saveState === "saved" ? t("Saved") : null}
      </span>
    </header>

    {loading ? <div className="notes-loading"><LoaderCircle className="spin" size={16} />{t("Loading notes…")}</div> : <textarea
      className="notes-editor"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onSelect={(event) => readSelection(event.currentTarget)}
      onKeyUp={(event) => readSelection(event.currentTarget)}
      onClick={(event) => readSelection(event.currentTarget)}
      onKeyDown={(event) => {
        if (!(event.metaKey || event.ctrlKey) || event.key !== "Enter" || !canSend) return;
        event.preventDefault();
        onSend(value, "append");
      }}
      placeholder={t("Jot down an idea, a quote, or draft your next prompt…")}
      aria-label={t("Notes editor")}
      spellCheck
    />}

    <footer className="notes-footer">
      <span className="notes-meta">{value.length.toLocaleString()} {t("characters")}</span>
      <div className="notes-actions">
        {selection && <button className="notes-action" onClick={() => onSend(selection, "append")} title={t("Append the selected text to the chat composer")}><ArrowUpToLine size={12} />{t("Send selection")}</button>}
        <button className="notes-action" onClick={() => onSend(value, "append")} disabled={!canSend || loading} title={t("Append these notes to the chat composer (Ctrl/Cmd+Enter)")}><ArrowUpToLine size={12} />{t("Add to chat")}</button>
        <button className="notes-action subtle" onClick={() => onSend(value, "replace")} disabled={!canSend || loading} title={t("Replace the chat composer with these notes")}><Replace size={12} />{t("Use as prompt")}</button>
      </div>
    </footer>
  </section>;
}
