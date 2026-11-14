import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { MenuSurface } from "./Menu";
import { InlineNotice } from "./InlineNotice";
import { useUISettings } from "./i18n";
import { captureSessionCommentAnchor, readSessionCommentAnchor, sessionCommentY, type MessagePosition, type SessionCommentAnchor } from "./session-comment-anchor";
import { sessionCommentPopoverPoint, sessionCommentSummary, sessionCommentSummaryWidth } from "./session-comment-presentation";
import "./session-comments.css";

export type SessionCommentsScope = { bridge: ResearchDeskBridge; workspace: string; projectId: string; sessionId: string; shared: boolean };

export default function SessionComments({ scope, adding, showResolvedByDefault = false, onExit, onRequireHistory, historyComplete, scrollRef, children }: {
  scope: SessionCommentsScope;
  adding: boolean;
  showResolvedByDefault?: boolean;
  onExit: () => void;
  onRequireHistory: () => void;
  historyComplete: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const { t, language } = useUISettings();
  const contentRef = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const loadingRef = useRef(false);
  const mutationVersion = useRef(0);
  const [comments, setComments] = useState<ResearchComment[]>([]);
  const [error, setError] = useState("");
  const [syncError, setSyncError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [resolved, setResolved] = useState(showResolvedByDefault);
  const [draft, setDraft] = useState("");
  const [selection, setSelection] = useState<{ anchor: SessionCommentAnchor; ids: string[]; composing: boolean; xFraction: number; preview?: boolean } | null>(null);
  const [positions, setPositions] = useState<Array<{ id: string; y: number }>>([]);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [summaryWidth, setSummaryWidth] = useState(120);
  const [cardWidth, setCardWidth] = useState(300);
  const [cardHeight, setCardHeight] = useState(184);
  const [paneHeight, setPaneHeight] = useState(480);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardContentRef = useRef<HTMLDivElement>(null);
  const previewId = useId();
  const input = { workspace: scope.workspace, projectId: scope.projectId, resourceType: "thread" as const, resourceId: scope.sessionId };

  const load = useCallback(async (sync = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    const version = mutationVersion.current;
    try {
      const local = await scope.bridge.listComments({ workspace: scope.workspace, projectId: scope.projectId, resourceType: "thread", resourceId: scope.sessionId });
      if (!alive.current) return;
      if (version === mutationVersion.current) setComments(local);
      setError("");
      if (sync && scope.shared) {
        try {
          const result = await scope.bridge.syncProjectThreads(scope.projectId);
          if (!alive.current) return;
          setSyncError(Boolean(result.warnings?.length));
          const fresh = await scope.bridge.listComments({ workspace: scope.workspace, projectId: scope.projectId, resourceType: "thread", resourceId: scope.sessionId });
          if (alive.current && version === mutationVersion.current) setComments(fresh);
        } catch { if (alive.current) setSyncError(true); }
      }
    } catch (cause) { if (alive.current) setError(String(cause)); }
    finally { loadingRef.current = false; if (alive.current) setLoading(false); }
  }, [scope]);

  useEffect(() => {
    alive.current = true;
    void load(true);
    const refresh = () => { if (document.visibilityState === "visible") void load(true); };
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 30_000);
    return () => { alive.current = false; clearInterval(timer); window.removeEventListener("focus", refresh); if (previewTimer.current) clearTimeout(previewTimer.current); };
  }, [load]);

  function messagePositions(): MessagePosition[] {
    const content = contentRef.current;
    if (!content) return [];
    const origin = content.getBoundingClientRect().top;
    return [...content.querySelectorAll<HTMLElement>("[data-session-message-id]")].map((element) => ({ id: element.dataset.sessionMessageId!, top: element.getBoundingClientRect().top - origin, height: element.getBoundingClientRect().height }));
  }

  useLayoutEffect(() => {
    const content = contentRef.current;
    const scroll = scrollRef.current;
    if (!content || !scroll) return;
    const measure = () => {
      setSummaryWidth(sessionCommentSummaryWidth(scroll.clientWidth));
      setPaneHeight(scroll.clientHeight);
      const width = Math.max(1, Math.min(300, scroll.clientWidth - 16));
      setCardWidth(width);
      const messages = messagePositions();
      const next: Array<{ id: string; y: number }> = [];
      let missing = false;
      for (const comment of comments) {
        const anchor = readSessionCommentAnchor(comment.anchor);
        const y = anchor ? sessionCommentY(anchor, messages, content.offsetHeight, historyComplete) : 12;
        if (y === null) { missing = true; continue; }
        if (resolved || !comment.resolved_at) next.push({ id: comment.id, y });
      }
      if (missing) onRequireHistory();
      setPositions((old) => JSON.stringify(old) === JSON.stringify(next) ? old : next);
      if (selection) {
        const y = sessionCommentY(selection.anchor, messages, content.offsetHeight) ?? selection.anchor.y;
        const rect = scroll.getBoundingClientRect();
        const contentRect = content.getBoundingClientRect();
        const point = { x: contentRect.left + selection.xFraction * content.clientWidth, y: contentRect.top + y };
        const nextCursor = sessionCommentPopoverPoint(point, rect, width, Math.min(cardHeight, scroll.clientHeight - 16), selection.composing ? 0 : 24);
        setCursor((old) => old?.x === nextCursor.x && old?.y === nextCursor.y ? old : nextCursor);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    observer.observe(scroll);
    for (const element of content.querySelectorAll("[data-session-message-id]")) observer.observe(element);
    scroll.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); scroll.removeEventListener("scroll", measure); window.removeEventListener("resize", measure); };
  }, [comments, selection, children, resolved, historyComplete, cardHeight, onRequireHistory, scrollRef]);

  const cardOpen = Boolean(selection && cursor);
  useLayoutEffect(() => {
    const panel = cardContentRef.current?.parentElement;
    if (!cardOpen || !panel) return;
    const measure = () => setCardHeight(panel.offsetHeight || 184);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [cardOpen]);

  function cancelPreviewClose() {
    if (previewTimer.current) clearTimeout(previewTimer.current);
  }

  function schedulePreviewClose() {
    cancelPreviewClose();
    previewTimer.current = setTimeout(() => setSelection((current) => current?.preview ? null : current), 160);
  }

  function openComments(group: { y: number; ids: string[] }, element: HTMLElement, preview: boolean) {
    cancelPreviewClose();
    const content = contentRef.current;
    if (!content) return;
    const x = element.getBoundingClientRect().left - content.getBoundingClientRect().left;
    if (!preview) setDraft("");
    const next = { anchor: captureSessionCommentAnchor(group.y, messagePositions()), ids: group.ids, composing: false, xFraction: x / Math.max(1, content.clientWidth), preview };
    setSelection((current) => preview && current && !current.preview ? current : next);
  }

  useEffect(() => {
    if (!adding) return;
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setSelection(null); onExit(); } };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [adding, onExit]);

  async function submit() {
    if (!selection || !draft.trim() || busy) return;
    setBusy(true);
    try {
      const created = await scope.bridge.createComment({ ...input, body: draft.trim(), anchor: selection.anchor });
      if (!alive.current) return;
      if (!created) throw new Error(t("Could not save comment."));
      mutationVersion.current += 1;
      setComments((current) => [...current.filter((item) => item.id !== created.id), created]);
      setDraft(""); setSelection(null); setError(""); onExit();
      void load(true);
    } catch (cause) { if (alive.current) setError(String(cause)); }
    finally { if (alive.current) setBusy(false); }
  }

  async function toggle(comment: ResearchComment) {
    setBusy(true);
    try {
      const updated = await scope.bridge.resolveComment({ workspace: scope.workspace, id: comment.id, resolved: !comment.resolved_at });
      if (!alive.current) return;
      if (!updated) throw new Error(t("Could not save comment."));
      mutationVersion.current += 1;
      setComments((current) => current.map((item) => item.id === updated.id ? updated : item));
      void load(true);
    } catch (cause) { if (alive.current) setError(String(cause)); }
    finally { if (alive.current) setBusy(false); }
  }

  const groups: Array<{ y: number; ids: string[] }> = [];
  for (const position of [...positions].sort((a, b) => a.y - b.y)) {
    const last = groups.at(-1);
    if (last && position.y - last.y < 26) last.ids.push(position.id);
    else groups.push({ y: position.y, ids: [position.id] });
  }
  const hasComments = comments.some((comment) => resolved || !comment.resolved_at);
  return <div className={`session-comments-content${adding ? " is-adding" : ""}${hasComments ? " has-comments" : ""}`} style={{ "--session-comment-summary-width": `${summaryWidth}px` } as CSSProperties} ref={contentRef} onClickCapture={(event) => {
    if (!adding || busy || loading || (selection && !selection.preview) || !(event.target instanceof Element)) return;
    if (event.target.closest("button, a, input, textarea, select, summary, [role=button], [contenteditable=true], [data-session-comments-ui]")) return;
    if (window.getSelection()?.toString()) return;
    event.preventDefault(); event.stopPropagation();
    setDraft("");
    cancelPreviewClose();
    const content = contentRef.current!;
    const rect = content.getBoundingClientRect();
    setSelection({ anchor: captureSessionCommentAnchor(event.clientY - rect.top, messagePositions()), ids: [], composing: true, xFraction: (event.clientX - rect.left) / Math.max(1, content.clientWidth) });
  }}>
    {children}
    {(adding || error || syncError) && <div className="session-comments-hint" data-session-comments-ui="" role="status">
      <span>{error || (syncError ? t("Comments are saved locally. Collaboration sync is unavailable.") : loading ? t("Loading comments…") : t("Click anywhere in this session to add a comment. Esc to finish."))}</span>
      {(error || syncError) && <button onClick={() => void load(true)}>{t("Retry")}</button>}
      {adding && <><label><input type="checkbox" checked={resolved} onChange={(event) => setResolved(event.target.checked)} />{t("Show resolved")}</label><button onClick={onExit}>{t("Done")}</button></>}
    </div>}
    {groups.map((group) => {
      const summary = sessionCommentSummary(comments.find((comment) => comment.id === group.ids[0])?.body || "");
      return <button key={group.ids.join(":")} className="session-comment-pin" style={{ top: group.y }} data-session-comments-ui="" aria-label={`${summary} · ${t("{count} comments at this position", { count: group.ids.length })}`} aria-expanded={Boolean(selection?.ids.some((id) => group.ids.includes(id)))} aria-controls={selection?.preview ? previewId : undefined}
        onPointerEnter={(event) => { if (event.pointerType !== "touch") openComments(group, event.currentTarget, true); }} onPointerLeave={schedulePreviewClose}
        onFocus={(event) => openComments(group, event.currentTarget, true)} onBlur={schedulePreviewClose}
        onClick={(event) => openComments(group, event.currentTarget, false)}>
        <span className="session-comment-summary">{summary}</span>{group.ids.length > 1 && <span className="session-comment-more">+{group.ids.length - 1}</span>}
      </button>;
    })}
    <MenuSurface open={cardOpen} cursor={cursor} onClose={() => { if (!busy) { setSelection(null); setDraft(""); } }} width={cardWidth} minWidth={Math.min(260, cardWidth)} maxHeight={Math.max(80, Math.min(430, paneHeight - 16))} focus={selection?.preview ? "none" : "first"} role="dialog" ariaLabel={t("Session comments")} className="session-comment-card">
      <div data-session-comments-ui="" id={previewId} ref={cardContentRef} onPointerEnter={cancelPreviewClose} onPointerLeave={schedulePreviewClose}>
        {comments.filter((comment) => selection?.ids.includes(comment.id)).map((comment) => <article key={comment.id} className={comment.resolved_at ? "is-resolved" : ""}>
          <header><strong>{comment.author_name}</strong><time dateTime={comment.created_at}>{new Date(comment.created_at).toLocaleString(language === "zh" ? "zh-CN" : "en-US")}</time></header>
          <p>{comment.body}</p>{!selection?.preview && <button disabled={busy} onClick={() => void toggle(comment)}>{t(comment.resolved_at ? "Reopen" : "Resolve")}</button>}
        </article>)}
        {selection?.composing && <textarea autoFocus aria-label={t("Add a comment")} placeholder={t("Add a comment")} maxLength={10_000} rows={4} value={draft} disabled={busy} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); void submit(); } }} />}
        {error && <InlineNotice tone="danger">{error}</InlineNotice>}
        {!selection?.preview && <footer><button disabled={busy} onClick={() => { setSelection(null); setDraft(""); }}>{t(selection?.composing ? "Cancel" : "Close")}</button>{selection?.composing && <button className="primary-button" disabled={busy || !draft.trim()} onClick={() => void submit()}>{t(busy ? "Saving…" : "Comment")}</button>}</footer>}
      </div>
    </MenuSurface>
  </div>;
}
