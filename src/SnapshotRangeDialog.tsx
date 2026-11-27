import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Dialog } from "./Dialog";
import { InlineNotice } from "./InlineNotice";
import { useUISettings } from "./i18n";
import "./session-snapshot.css";

type Turn = { id: string; user_message: string; created_at: string };
export default function SnapshotRangeDialog({ bridge, threadId, title, onClose, onCreated }: {
  bridge: ResearchDeskBridge; threadId: string; title: string; onClose: () => void;
  onCreated: (snapshot: Awaited<ReturnType<ResearchDeskBridge["createResearchThreadSnapshot"]>>) => void;
}) {
  const { t } = useUISettings();
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [includeSources, setIncludeSources] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void bridge.listResearchThreadSnapshotTurns(threadId).then(items => {
      if (active) { setTurns(items); setSelected(items.slice(-1).map(item => item.id)); }
    }).catch(reason => { if (active) setError(String(reason)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [bridge, threadId]);
  async function create() {
    if (busy || !selected.length) return;
    setBusy(true); setError("");
    try { const snapshot = await bridge.createResearchThreadSnapshot(threadId, selected, includeSources); if (alive.current) onCreated(snapshot); }
    catch (reason) {
      const message = String(reason);
      if (alive.current) setError(message.includes("SNAPSHOT_TOO_LARGE") ? t("The selected turns are still too large. Choose fewer turns and try again.") : message);
    } finally { if (alive.current) setBusy(false); }
  }
  return <Dialog open onClose={onClose} size="md" className="session-snapshot-dialog" ariaLabel={t("Choose turns for a snapshot")}>
    <header className="session-snapshot-header"><div><h2>{t("Choose turns for a snapshot")}</h2><p>{title}</p></div><button className="dialog-ref-close" onClick={onClose} aria-label={t("Close")}><X size={17} /></button></header>
    <div className="snapshot-range-content">
      <p>{t("This session is too large for one snapshot. Select turns to export; the latest turn is selected by default.")}</p>
      <label className="snapshot-check"><input type="checkbox" checked={includeSources} disabled={busy} onChange={event => setIncludeSources(event.target.checked)} />{t("Include sources")}</label>
      <p className="snapshot-note">{t("Diagnostic events are excluded from partial snapshots. If a selection is too large, omit sources or choose fewer turns.")}</p>
      {loading ? <p>{t("Loading conversation turns…")}</p> : <div className="snapshot-turn-list snapshot-range-list">{turns.map((turn, index) => <label key={turn.id}><input type="checkbox" disabled={busy} checked={selected.includes(turn.id)} onChange={event => setSelected(current => event.target.checked ? [...current, turn.id] : current.filter(id => id !== turn.id))} /><span>{index + 1}. {turn.user_message || t("Empty question")}</span></label>)}</div>}
      {turns.length === 2000 && <p className="snapshot-note">{t("Showing the latest 2,000 turns.")}</p>}
      <p className="snapshot-note">{t("{selected} of {total} turns selected", { selected: selected.length, total: turns.length })}</p>
      {error && <InlineNotice tone="danger">{error}</InlineNotice>}
    </div>
    <footer className="session-snapshot-footer"><button className="secondary-button" onClick={onClose}>{t("Cancel")}</button><button className="primary-button" disabled={loading || busy || !selected.length || selected.length > 500} onClick={() => void create()}>{t(busy ? "Preparing…" : "Continue")}</button></footer>
  </Dialog>;
}
