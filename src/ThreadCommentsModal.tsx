import { useEffect, useState } from "react";
import { Check, MessageSquareText, Send, X } from "lucide-react";
import { Dialog } from "./Dialog";

import { InlineNotice } from "./InlineNotice";
import { StateView } from "./StateView";
type ThreadCommentsModalProps = {
  bridge: ResearchDeskBridge;
  workspace: string;
  projectId: string;
  threadId: string;
  threadTitle: string;
  onClose: () => void;
};

export default function ThreadCommentsModal({ bridge, workspace, projectId, threadId, threadTitle, onClose }: ThreadCommentsModalProps) {
  const [comments, setComments] = useState<ResearchComment[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      setComments(await bridge.listComments({ workspace, projectId, resourceType: "thread", resourceId: threadId }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [bridge, projectId, threadId, workspace]);

  async function submit() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    try {
      await bridge.createComment({ workspace, projectId, resourceType: "thread", resourceId: threadId, body });
      setDraft("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSending(false);
    }
  }

  async function toggleResolved(comment: ResearchComment) {
    try {
      await bridge.resolveComment({ workspace, id: comment.id, resolved: !comment.resolved_at });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return <Dialog open onClose={onClose} size="md" className="thread-comments-modal" ariaLabel="Thread comments">
      <header className="thread-comments-header">
        <div><span className="eyebrow">Thread discussion</span><h2>Comments</h2><p>{threadTitle}</p></div>
        <button className="settings-close" onClick={onClose} aria-label="Close comments"><X size={16} /></button>
      </header>
      <div className="thread-comments-list">
        {error && <InlineNotice tone="danger" className="thread-comments-error">{error}</InlineNotice>}
        {loading && !comments.length ? <StateView tone="loading" className="thread-comments-empty" description="Loading comments…" /> : comments.length ? comments.map((comment) => <article className={`thread-comment${comment.resolved_at ? " resolved" : ""}`} key={comment.id}>
          <header><strong>{comment.author_name}</strong><span>{new Date(comment.created_at).toLocaleString()}</span></header>
          <p>{comment.body}</p>
          <button className="thread-comment-resolve" onClick={() => void toggleResolved(comment)}>{comment.resolved_at ? "Reopen" : <><Check size={11} />Resolve</>}</button>
        </article>) : <StateView className="thread-comments-empty" icon={<MessageSquareText size={18} />} title="No comments yet" description="Leave a note for collaborators without changing the research transcript." />}
      </div>
      <div className="thread-comments-composer">
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Add a comment for the project" rows={3} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void submit(); }} />
        <div><span>Commenter access required · ⌘↵ to send</span><button className="primary-button" disabled={!draft.trim() || sending} onClick={() => void submit()}><Send size={12} />{sending ? "Sending…" : "Comment"}</button></div>
      </div>
  </Dialog>;
}
