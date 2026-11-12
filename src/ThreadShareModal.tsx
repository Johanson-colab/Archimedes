import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { Dialog } from "./Dialog";
import { InlineNotice } from "./InlineNotice";
import { useUISettings } from "./i18n";
import { canShareSessionLink, selectSnapshot, snapshotFileStem, snapshotMarkdown, snapshotTurns } from "./session-snapshot";
import { downloadSnapshotBlob, snapshotImagePages } from "./session-snapshot-image";
import "./session-snapshot.css";

type Snapshot = Awaited<ReturnType<ResearchDeskBridge["createResearchThreadSnapshot"]>>;
type Props = { snapshot: Snapshot | null; bridge: ResearchDeskBridge; projectId: string; threadId: string; threadTitle: string; privateThread: boolean; signedIn: boolean; onClose: () => void; onCopy: (text: string) => Promise<void> };

export default function ThreadShareModal(props: Props) {
  return props.snapshot ? <SnapshotDialog key={props.snapshot.id} {...props} snapshot={props.snapshot} /> : null;
}

function SnapshotDialog({ snapshot, bridge, projectId, threadId, threadTitle, privateThread, signedIn, onClose, onCopy }: Props & { snapshot: Snapshot }) {
  const { t, language } = useUISettings();
  const turns = useMemo(() => snapshotTurns(snapshot.manifest), [snapshot]);
  const [scope, setScope] = useState<"all" | "latest" | "custom">("all");
  const [selected, setSelected] = useState(() => turns.map((turn) => turn.id));
  const [sources, setSources] = useState(true);
  const [diagnostics, setDiagnostics] = useState(false);
  const [format, setFormat] = useState<"md" | "json" | "png">("md");
  const [imageWidth, setImageWidth] = useState(900);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [shareLink, setShareLink] = useState<CloudShareLink | null>(null);
  const [imagePages, setImagePages] = useState<Blob[]>([]);
  const alive = useRef(true);
  const imageRequest = useRef<AbortController | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; imageRequest.current?.abort(); }; }, []);
  useEffect(() => { if (!signedIn) setShareLink(null); }, [signedIn]);
  const ids = scope === "all" ? turns.map((turn) => turn.id) : scope === "latest" ? turns.slice(-1).map((turn) => turn.id) : selected;
  const exported = useMemo(() => selectSnapshot(snapshot, threadTitle, ids, sources, diagnostics), [snapshot, threadTitle, ids.join("\0"), sources, diagnostics]);
  const markdown = snapshotMarkdown(exported);
  const allSelected = canShareSessionLink(signedIn, privateThread, turns.map((turn) => turn.id), ids);
  const stem = snapshotFileStem(threadTitle);
  useEffect(() => { setImagePages([]); setNotice(""); }, [ids.join("\0"), format, imageWidth, sources, diagnostics]);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(""); setNotice(""); setImagePages([]);
    try { await action(); }
    catch (cause) { if (alive.current) setError(cause instanceof Error ? t(cause.message) : String(cause)); }
    finally { if (alive.current) setBusy(false); }
  }

  async function download() {
    if (!exported.turns.length) return;
    if (format === "png") {
      imageRequest.current = new AbortController();
      const pages = await snapshotImagePages(exported, imageWidth, imageRequest.current.signal);
      if (!alive.current) return;
      if (pages.length === 1) downloadSnapshotBlob(pages[0], `${stem}.png`);
      else setImagePages(pages);
      setNotice(t("Image export ready: {count} files.", { count: pages.length }));
    } else {
      downloadSnapshotBlob(new Blob([format === "json" ? JSON.stringify(exported, null, 2) : markdown], { type: format === "json" ? "application/json" : "text/markdown;charset=utf-8" }), `${stem}.${format}`);
      setNotice(t("Download started."));
    }
  }

  return <Dialog open onClose={onClose} size="lg" className="session-snapshot-dialog" ariaLabel={t("Share session snapshot")}>
    <header className="session-snapshot-header"><div><h2>{t("Share session snapshot")}</h2><p>{threadTitle} · {new Date(snapshot.created_at).toLocaleString(language === "zh" ? "zh-CN" : "en-US")}</p></div><button className="dialog-ref-close" onClick={onClose} aria-label={t("Close")}><X size={17} /></button></header>
    <div className="session-snapshot-body">
      <div className="session-snapshot-options">
        <label>{t("Snapshot range")}<select aria-label={t("Snapshot range")} value={scope} disabled={busy} onChange={(event) => { setScope(event.target.value as typeof scope); setNotice(""); }}><option value="all">{t("All turns")}</option><option value="latest">{t("Latest turn")}</option><option value="custom">{t("Choose turns")}</option></select></label>
        {scope === "custom" && <div className="snapshot-turn-list">{turns.map((turn, index) => <label key={turn.id}><input type="checkbox" checked={selected.includes(turn.id)} disabled={busy} onChange={(event) => setSelected((current) => event.target.checked ? [...current, turn.id] : current.filter((id) => id !== turn.id))} /><span>{index + 1}. {turn.user_message || t("Empty question")}</span></label>)}</div>}
        <label className="snapshot-check"><input type="checkbox" checked={sources} disabled={busy} onChange={(event) => setSources(event.target.checked)} />{t("Include sources")}</label>
        <label className="snapshot-check"><input type="checkbox" checked={diagnostics} disabled={busy} onChange={(event) => setDiagnostics(event.target.checked)} />{t("Include diagnostic events")}</label>
        <p className="snapshot-note">{t(diagnostics ? "Diagnostic events may contain paths, commands, or other sensitive information." : "Raw diagnostic events are excluded by default. Review the selected content before sharing.")}</p>
        {privateThread && <p className="snapshot-note">{t("Private session. Exporting does not change its visibility.")}</p>}
        <p className="snapshot-note">{t("{selected} of {total} turns selected", { selected: exported.turns.length, total: turns.length })}</p>
      </div>
      <section className="snapshot-preview" aria-label={t("Snapshot preview")}>{exported.turns.length ? exported.turns.map((turn, index) => <article key={turn.id}><strong>{index + 1}. {t("You")}</strong><p>{turn.user_message.slice(0, 3000)}</p><strong>Archimedes</strong><p>{turn.assistant_message.slice(0, 6000)}</p>{(turn.user_message.length > 3000 || turn.assistant_message.length > 6000) && <small>{t("Preview shortened. Downloads include the complete selected text.")}</small>}</article>) : <p>{t("Select at least one turn to export.")}</p>}{exported.references.length > 0 && <article><strong>{t("Sources")}</strong>{exported.references.map((source) => <p key={source.url}>{source.title}<br />{source.url}</p>)}</article>}{exported.events && <details><summary>{t("Include diagnostic events")} ({exported.events.length})</summary><pre>{JSON.stringify(exported.events, null, 2).slice(0, 6000)}</pre><small>{t("Preview shortened. Downloads include the complete selected text.")}</small></details>}</section>
    </div>
    {signedIn && <section className="snapshot-guest-link" aria-label={t("Guest link")}><p>{t("Guest links open the complete session, not this selected frozen export.")}</p>{!allSelected && <small>{t("Guest links are available only for the full non-private session.")}</small>}{shareLink && allSelected ? <div><a href={shareLink.url} target="_blank" rel="noreferrer">{shareLink.url}</a><button className="secondary-button" disabled={busy} onClick={() => void run(async () => { await onCopy(shareLink.url); if (alive.current) setNotice(t("Copied.")); })}>{t("Copy link")}</button><small>{t("Expires {date}", { date: new Date(shareLink.expires_at).toLocaleDateString(language === "zh" ? "zh-CN" : "en-US") })}</small></div> : <button className="secondary-button" disabled={busy || !allSelected} onClick={() => void run(async () => { if (!signedIn || !allSelected) return; const link = await bridge.createShareLink({ projectId, resourceType: "thread", resourceId: threadId, role: "viewer", expiresInDays: 7 }); if (alive.current && signedIn) setShareLink(link); })}>{t("Create read-only guest link")}</button>}</section>}
    {(error || notice) && <div className="snapshot-feedback">{error ? <InlineNotice tone="danger">{error}</InlineNotice> : <span role="status">{notice}</span>}{imagePages.length > 1 && <div className="snapshot-image-pages">{imagePages.map((page, index) => <button key={index} className="secondary-button" onClick={() => downloadSnapshotBlob(page, `${stem}-${index + 1}.png`)}>{t("Download image {number}", { number: index + 1 })}</button>)}</div>}</div>}
    <footer className="session-snapshot-footer"><label>{t("Export format")}<select aria-label={t("Export format")} value={format} disabled={busy} onChange={(event) => setFormat(event.target.value as typeof format)}><option value="md">Markdown</option><option value="json">JSON</option><option value="png">{t("Long image (PNG)")}</option></select></label>{format === "png" && <label>{t("Image width")}<select aria-label={t("Image width")} value={imageWidth} disabled={busy} onChange={(event) => setImageWidth(Number(event.target.value))}><option value={600}>600 px</option><option value={900}>900 px</option><option value={1200}>1200 px</option></select></label>}<button className="secondary-button" disabled={busy || !exported.turns.length} onClick={() => void run(async () => { await onCopy(format === "json" ? JSON.stringify(exported, null, 2) : markdown); if (alive.current) setNotice(t("Copied.")); })}>{t(format === "json" ? "Copy JSON" : "Copy Markdown")}</button><button className="primary-button" disabled={busy || !exported.turns.length} onClick={() => void run(download)}>{t(busy ? "Preparing…" : "Download")}</button></footer>
  </Dialog>;
}
