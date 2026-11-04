import { memo, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, Expand, Square, X } from "lucide-react";
import { useUISettings } from "./i18n";
import { shouldSubmitPaperChatKey } from "./paperChatKeyboard";

const SideMessage = memo(function SideMessage({ message }: { message: { id: string; role: string; text: string } }) {
  return <article className={`side-chat-message ${message.role}`}><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown></article>;
});
const SideMessages = memo(function SideMessages({ messages }: { messages: Array<{ id: string; role: string; text: string }> }) {
  return <>{messages.map((message) => <SideMessage key={message.id} message={message} />)}</>;
});

export default function SideConversation({ bridge, initialThread, dataWorkspace, reasoningEffort, contextLength, onBusyChange, onClose, onOpenMain, onUpdated }: {
  bridge: ResearchDeskBridge;
  initialThread: ResearchThreadDetail;
  dataWorkspace: string;
  reasoningEffort: ReasoningEffort;
  contextLength: ContextLength;
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
  onOpenMain: (thread: ResearchThreadDetail) => void;
  onUpdated: (thread: ResearchThreadDetail) => void;
}) {
  const { t } = useUISettings();
  const [thread, setThread] = useState(initialThread);
  const [messages, setMessages] = useState<Array<{ id: string; role: string; text: string }>>(initialThread.messages);
  const draftKey = `archimedes-side-draft:${initialThread.id}`;
  const [draft, setDraft] = useState(() => { try { return localStorage.getItem(draftKey) || ""; } catch { return ""; } });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [width, setWidth] = useState(380);
  const panelRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const dragRef = useRef<{ x: number; width: number } | null>(null);
  const runRef = useRef(false);
  const clientRunId = `side-chat:${initialThread.id}`;
  useEffect(() => { try { localStorage.setItem(draftKey, draft); } catch { /* Keep typing available when browser storage is full. */ } }, [draft, draftKey]);
  useEffect(() => {
    const parent = panelRef.current?.parentElement?.parentElement;
    parent?.style.setProperty("--side-chat-width", `${width}px`);
    return () => { parent?.style.removeProperty("--side-chat-width"); };
  }, [width]);
  useEffect(() => bridge.onAgentEvent((event) => {
    if (event.clientRunId !== clientRunId || event.threadId !== initialThread.id || !event.delta || !event.turnId) return;
    const id = `${event.turnId}:stream`;
    setMessages((current) => {
      const previous = current.find((message) => message.id === id);
      return previous ? current.map((message) => message.id === id ? { ...message, text: message.text + event.delta } : message) : [...current, { id, role: "assistant", text: event.delta! }];
    });
  }), [bridge, clientRunId, initialThread.id]);
  useEffect(() => {
    const area = scrollRef.current;
    if (area && area.scrollHeight - area.scrollTop - area.clientHeight < 160) area.scrollTop = area.scrollHeight;
  }, [messages]);

  async function send() {
    const prompt = draft.trim();
    if (!prompt || runRef.current) return;
    runRef.current = true;
    setBusy(true);
    onBusyChange(true);
    setError("");
    setDraft("");
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", text: prompt }]);
    try {
      const result = await bridge.runAgent({ prompt, threadId: thread.id, workspace: thread.workspace_path || dataWorkspace, projectId: thread.project_id, visibility: thread.visibility, mode: "free-chat", reasoningEffort, contextLength, clientRunId, capabilities: { write: "deny", command: "deny" } });
      setThread(result.thread);
      setMessages(result.thread.messages);
      onUpdated(result.thread);
    } catch (cause) {
      setError(String(cause));
      setDraft((current) => current || prompt);
      const restored = await bridge.getResearchThread(thread.id, dataWorkspace).catch(() => null);
      if (restored) { setThread(restored); setMessages(restored.messages); onUpdated(restored); }
    } finally { runRef.current = false; setBusy(false); onBusyChange(false); fieldRef.current?.focus(); }
  }

  async function stop() {
    try { await bridge.interruptAgent(thread.id); } catch (cause) { setError(String(cause)); }
  }

  return <aside ref={panelRef} className="side-chat-panel" aria-label={t("Side conversation")}>
    <div className="side-chat-resizer" role="separator" tabIndex={0} aria-label={t("Resize side conversation")} aria-orientation="vertical" aria-valuemin={280} aria-valuemax={720} aria-valuenow={width}
      onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); setWidth((current) => Math.max(280, Math.min(720, current + (event.key === "ArrowLeft" ? 16 : -16)))); } }}
      onPointerDown={(event) => { dragRef.current = { x: event.clientX, width }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={(event) => { const drag = dragRef.current; if (drag) setWidth(Math.max(280, Math.min(720, drag.width + drag.x - event.clientX))); }}
      onPointerUp={(event) => { dragRef.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
      onPointerCancel={() => { dragRef.current = null; }} />
    <header className="side-chat-header"><strong>{t("Side conversation")}</strong><button type="button" disabled={busy} title={t("Open in main chat")} aria-label={t("Open in main chat")} onClick={() => onOpenMain(thread)}><Expand size={14} /></button><button type="button" disabled={busy} title={t("Close")} aria-label={t("Close side conversation")} onClick={onClose}><X size={15} /></button></header>
    <p className="side-chat-note">{t("Separate history. Open in main chat to apply file changes.")}</p>
    <div className="side-chat-messages" ref={scrollRef}><SideMessages messages={messages} />{!messages.length && <p>{t("Ask a follow-up without changing the main conversation.")}</p>}</div>
    {error && <p className="side-chat-error" role="alert">{error}</p>}
    <div className="side-chat-composer"><textarea ref={fieldRef} value={draft} aria-label={t("Message side conversation")} placeholder={t("Ask a side question…")} rows={3} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (shouldSubmitPaperChatKey(event)) { event.preventDefault(); void send(); } }} />{busy ? <button type="button" aria-label={t("Stop")} onClick={() => void stop()}><Square size={14} /></button> : <button type="button" disabled={!draft.trim()} aria-label={t("Send")} onClick={() => void send()}><ArrowUp size={17} /></button>}</div>
  </aside>;
}
