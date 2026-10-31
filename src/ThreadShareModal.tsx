import { Check, Copy, Download, Share2, X } from "lucide-react";
import { useDialogFocus } from "./useDialogFocus";

type ThreadShareSnapshot = Awaited<ReturnType<ResearchDeskBridge["createResearchThreadSnapshot"]>>;

type ThreadShareModalProps = {
  snapshot: ThreadShareSnapshot | null;
  threadTitle: string;
  privateThread: boolean;
  onClose: () => void;
  onCopy: (text: string) => Promise<void>;
};

export default function ThreadShareModal({ snapshot, threadTitle, privateThread, onClose, onCopy }: ThreadShareModalProps) {
  const dialogRef = useDialogFocus<HTMLElement>(Boolean(snapshot), onClose);
  if (!snapshot) return null;
  const manifest = snapshot.manifest as { turns?: unknown[]; events?: unknown[]; references?: unknown[]; sequence?: number };
  const turns = Array.isArray(manifest.turns) ? manifest.turns.length : 0;
  const events = Array.isArray(manifest.events) ? manifest.events.length : 0;
  const references = Array.isArray(manifest.references) ? manifest.references.length : 0;

  function download() {
    const blob = new Blob([JSON.stringify(snapshot?.manifest, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${threadTitle.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "thread"}-snapshot.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function copy() {
    if (!snapshot) return;
    await onCopy(JSON.stringify(snapshot.manifest, null, 2));
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section ref={dialogRef} tabIndex={-1} className="thread-share-modal" role="dialog" aria-modal="true" aria-label="Share thread snapshot" onMouseDown={(event) => event.stopPropagation()}>
      <header className="thread-share-header">
        <div><span className="eyebrow">Asynchronous sharing</span><h2>Share a snapshot</h2><p>{threadTitle}</p></div>
        <button className="settings-close" onClick={onClose} aria-label="Close share dialog"><X size={16} /></button>
      </header>
      <div className="thread-share-body">
        <div className="thread-share-summary">
          <div><span>Turns</span><strong>{turns}</strong></div>
          <div><span>Events</span><strong>{events}</strong></div>
          <div><span>Sources</span><strong>{references}</strong></div>
          <div><span>Visibility</span><strong>{privateThread ? "Private draft" : "Project"}</strong></div>
        </div>
        <p className="thread-share-note"><Share2 size={13} /><span>The snapshot freezes the thread at sequence <b>{snapshot.sequence}</b>. Cloud share links and guest access arrive with the collaboration service; this JSON is local-only.</span></p>
        {privateThread && <p className="thread-share-warning">This is a private draft. Creating a snapshot does not change its visibility.</p>}
      </div>
      <footer className="thread-share-footer">
        <button className="secondary-button" onClick={() => void copy()}><Copy size={13} />Copy JSON</button>
        <button className="secondary-button" onClick={download}><Download size={13} />Download .json</button>
        <button className="primary-button" onClick={onClose}><Check size={13} />Done</button>
      </footer>
    </section>
  </div>;
}
