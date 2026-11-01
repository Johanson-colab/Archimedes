import { useState } from "react";
import { Check, Copy, Download, Link2, LoaderCircle, Share2, X } from "lucide-react";
import { Dialog } from "./Dialog";

type ThreadShareSnapshot = Awaited<ReturnType<ResearchDeskBridge["createResearchThreadSnapshot"]>>;

type ThreadShareModalProps = {
  snapshot: ThreadShareSnapshot | null;
  bridge: ResearchDeskBridge;
  projectId: string;
  threadId: string;
  threadTitle: string;
  privateThread: boolean;
  onClose: () => void;
  onCopy: (text: string) => Promise<void>;
};

export default function ThreadShareModal({ snapshot, bridge, projectId, threadId, threadTitle, privateThread, onClose, onCopy }: ThreadShareModalProps) {
  const [shareLink, setShareLink] = useState<CloudShareLink | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState("");
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

  async function createGuestLink() {
    if (linkBusy || typeof bridge.createShareLink !== "function") return;
    setLinkBusy(true);
    setLinkError("");
    try {
      setShareLink(await bridge.createShareLink({ projectId, resourceType: "thread", resourceId: threadId, role: "viewer", expiresInDays: 7 }));
    } catch (cause) {
      setLinkError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLinkBusy(false);
    }
  }

  return <Dialog open onClose={onClose} size="md" className="thread-share-modal" ariaLabel="Share thread snapshot">
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
        <p className="thread-share-note"><Share2 size={13} /><span>The snapshot freezes the thread at sequence <b>{snapshot.sequence}</b>. Cloud share links and guest access arrive with the collaboration service; create a read-only guest link below.</span></p>
        {privateThread && <p className="thread-share-warning">This is a private draft. Creating a snapshot does not change its visibility.</p>}
        <div className="thread-share-link">
          {shareLink ? <>
            <code>{shareLink.url}</code>
            <button className="secondary-button" onClick={() => void onCopy(shareLink.url)}><Copy size={13} />Copy link</button>
            <small>Expires {new Date(shareLink.expires_at).toLocaleString()} · {shareLink.role}</small>
          </> : <button className="secondary-button" disabled={linkBusy} onClick={() => void createGuestLink()}>{linkBusy ? <LoaderCircle className="spin" size={13} /> : <Link2 size={13} />}{linkBusy ? "Creating…" : "Create read-only guest link"}</button>}
          {linkError && <p className="settings-group-note warning">{linkError}</p>}
        </div>
      </div>
      <footer className="thread-share-footer">
        <button className="secondary-button" onClick={() => void copy()}><Copy size={13} />Copy JSON</button>
        <button className="secondary-button" onClick={download}><Download size={13} />Download .json</button>
        <button className="primary-button" onClick={onClose}><Check size={13} />Done</button>
      </footer>
  </Dialog>;
}
