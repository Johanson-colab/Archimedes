import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowUp, MessageSquare, MoreHorizontal, X } from "lucide-react";
import { useUISettings } from "./i18n";
import { evidenceLabel, formatRelativeTime } from "./proactive-engine";
import {
  PROACTIVE_SOURCE_LABELS,
  PROACTIVE_STATUS_LABELS,
  type ProactiveAction,
  type ProactiveEvidence,
} from "./proactive-types";
import type { ProactiveAgentController } from "./useProactiveAgent";

function hasCjkLabel(label: string) {
  return /[\u3400-\u9fff]/.test(label);
}

/** The observer model labels the action in the language of the latest user
 * message. Keep that verb when it matches the UI language, but fall back to a
 * stable localized label so an English panel never shows a Chinese verb. */
function actionLabel(action: ProactiveAction, language: "en" | "zh", t: (key: string) => string) {
  const mismatched = language === "zh" ? !hasCjkLabel(action.label) : hasCjkLabel(action.label);
  if (!mismatched) return action.label;
  if (action.kind === "insert") return t("Insert draft");
  if (action.kind === "copy") return t("Copy draft");
  return action.label;
}

function EvidenceDetail({ evidence }: { evidence: ProactiveEvidence }) {
  switch (evidence.kind) {
    case "search":
      return <div className="agent-proactive-evidence-detail">
        <span>{evidence.libraryName ?? "Library"} · {evidence.paperTitle ?? "Paper"}</span>
        <code>{evidence.query}</code>
        <small>{evidence.resultCount} matching passages</small>
      </div>;
    case "selection":
      return <div className="agent-proactive-evidence-detail">
        <span>{evidence.paperTitle} · p. {evidence.page}</span>
        <blockquote>{evidence.text}</blockquote>
      </div>;
    case "terminal":
      return <div className="agent-proactive-evidence-detail">
        <span>{evidence.command} · exit {evidence.exitCode}</span>
        <pre>{evidence.output}</pre>
      </div>;
    case "citation":
      return <div className="agent-proactive-evidence-detail">
        <span>Claim without a source</span>
        <blockquote>{evidence.quote}</blockquote>
      </div>;
    case "generic":
      return <div className="agent-proactive-evidence-detail">
        <span>{evidence.label}</span>
        <p>{evidence.detail}</p>
      </div>;
  }
}

export default function ProactiveAgentPanel({
  controller,
  onOpenSettings,
  onCollapse,
}: {
  controller: ProactiveAgentController;
  onOpenSettings: () => void;
  onCollapse: () => void;
}) {
  const { t, language } = useUISettings();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [openEvidence, setOpenEvidence] = useState<number | null>(null);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyMessages, setReplyMessages] = useState<Array<{ role: "user" | "assistant"; text: string }>>([]);
  const [replyError, setReplyError] = useState("");
  const [historyFilter, setHistoryFilter] = useState<"all" | "active" | "accepted" | "closed">("all");
  const [workspaceOnly, setWorkspaceOnly] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLInputElement | null>(null);
  const replyEndRef = useRef<HTMLDivElement | null>(null);

  const suggestions = controller.state.suggestions;
  const sorted = useMemo(
    () => [...suggestions].sort((left, right) => right.createdAt - left.createdAt),
    [suggestions],
  );
  const latest = sorted[0] ?? null;
  const selected = selectedId ? sorted.find((suggestion) => suggestion.id === selectedId) ?? latest : latest;
  const historyRows = useMemo(() => {
    const scoped = workspaceOnly
      ? sorted.filter((suggestion) => suggestion.workspace === controller.workspace)
      : sorted;
    if (historyFilter === "active") return scoped.filter((suggestion) => suggestion.status === "queued" || suggestion.status === "shown");
    if (historyFilter === "accepted") return scoped.filter((suggestion) => suggestion.status === "accepted" || suggestion.status === "undone");
    if (historyFilter === "closed") return scoped.filter((suggestion) => suggestion.status === "dismissed" || suggestion.status === "expired");
    return scoped;
  }, [controller.workspace, historyFilter, sorted, workspaceOnly]);
  const openCount = sorted.filter((suggestion) => suggestion.status === "queued" || suggestion.status === "shown").length;
  const mode = controller.settings.mode;
  const limited = controller.quiet || controller.budgetReached || controller.observationBudgetReached || controller.suppressed || controller.composerFocused;
  const status = controller.quiet
    ? t("Quiet hours")
    : controller.budgetReached
      ? t("Daily budget reached")
      : controller.observationBudgetReached
        ? t("Observation budget reached")
        : controller.suppressed
          ? t("Paused after dismissals")
          : controller.composerFocused
            ? t("Paused while typing")
            : controller.observing
              ? t("Observing now")
              : mode === "auto" && !controller.modelReady
                ? t("Proactive model not configured")
                : mode === "auto"
                  ? t("Watching context")
                  : mode === "manual"
                    ? t("Manual review")
                    : t("Off");
  const statusActive = mode !== "off" && !limited && (mode !== "auto" || controller.modelReady);

  useEffect(() => {
    if (selectedId && !sorted.some((suggestion) => suggestion.id === selectedId)) setSelectedId(null);
  }, [selectedId, sorted]);

  useEffect(() => {
    setOpenEvidence(null);
  }, [selected?.id]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!composerOpen) return;
    composerRef.current?.focus();
  }, [composerOpen]);

  function openHistory() {
    setHistoryOpen(true);
    setComposerOpen(false);
    setMenuOpen(false);
  }

  function backToLatest() {
    setHistoryOpen(false);
    setSelectedId(null);
    setComposerOpen(false);
    setReplyOpen(false);
  }

  function openReplyComposer() {
    setReplyOpen(false);
    setComposerOpen(true);
    setReplyError("");
    window.setTimeout(() => composerRef.current?.focus(), 0);
  }

  async function submitReply(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || controller.replyBusy) return;
    setDraft("");
    setComposerOpen(false);
    setReplyOpen(true);
    setReplyError("");
    setReplyMessages((current) => [...current, { role: "user", text }]);
    try {
      const answer = await controller.reply(text, selected);
      setReplyMessages((current) => [...current, { role: "assistant", text: answer }]);
    } catch (error) {
      setReplyError(String(error).replace(/^Error invoking remote method '[^']+': Error:\s*|^Error:\s*/, ""));
    }
  }

  useEffect(() => {
    if (!replyOpen) return;
    replyEndRef.current?.scrollIntoView({ block: "end" });
  }, [replyOpen, replyMessages, controller.replyBusy]);

  const actionable = selected?.status === "queued" || selected?.status === "shown";
  const stateLabel = selected && !actionable && selected.status !== "expired"
    ? t(PROACTIVE_STATUS_LABELS[selected.status])
    : "";

  return <div className="agent-proactive-panel dock-panel" data-paused={limited ? "true" : "false"}>
    <header className="agent-proactive-head dock-panel-head">
      <span className="agent-proactive-status" title={t("{count} of {total} auto suggestions today", { count: controller.todayCount, total: controller.settings.dailyBudget })}>
        <i className={statusActive ? "agent-proactive-bar active" : "agent-proactive-bar"} aria-hidden="true" />
        <span className="agent-proactive-status-label">{status}</span>
      </span>
      <div className="agent-proactive-tools" ref={menuRef}>
        <button
          className={menuOpen ? "agent-proactive-icon active" : "agent-proactive-icon"}
          onClick={() => setMenuOpen((open) => !open)}
          title={t("More actions")}
          aria-label={t("More actions")}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <MoreHorizontal size={13} />
        </button>
        <button className="agent-proactive-icon" onClick={onCollapse} title={t("Close Proactive agent")} aria-label={t("Close Proactive agent")}>
          <X size={13} />
        </button>
        {menuOpen && <div className="agent-proactive-menu" role="menu" aria-label={t("Proactive actions")}>
          <button role="menuitem" onClick={() => { setMenuOpen(false); controller.observeOnce(); }}>{t("Observe once")}</button>
          <button role="menuitem" onClick={openHistory}>{t("Suggestion history")}</button>
          <button role="menuitem" onClick={() => { setMenuOpen(false); onOpenSettings(); }}>{t("Proactive settings")}</button>
        </div>}
      </div>
    </header>

    {historyOpen ? <div className="agent-proactive-history">
      <div className="agent-proactive-history-head">
        <span>{t("History")}</span>
        <b>{t("{count} outputs", { count: sorted.length })}</b>
        <button onClick={backToLatest}>{t("Back to latest")}</button>
      </div>
      <div className="agent-proactive-history-filters" role="tablist" aria-label={t("Suggestion history filter")}>
        {([["all", t("All")], ["active", t("Active")], ["accepted", t("Accepted")], ["closed", t("Closed")]] as const).map(([id, label]) =>
          <button key={id} role="tab" aria-selected={historyFilter === id} className={historyFilter === id ? "active" : ""} onClick={() => setHistoryFilter(id)}>{label}{id === "active" && openCount > 0 ? ` ${openCount}` : ""}</button>)}
        <button className={workspaceOnly ? "agent-proactive-history-scope active" : "agent-proactive-history-scope"} aria-pressed={workspaceOnly} onClick={() => setWorkspaceOnly((value) => !value)} title={t("Only suggestions for the current workspace")}>{t("This workspace")}</button>
      </div>
      <div className="agent-proactive-history-list">
        {historyRows.map((suggestion) => <button
          key={suggestion.id}
          className={suggestion.id === selected?.id ? "agent-proactive-history-row active" : "agent-proactive-history-row"}
          onClick={() => { setSelectedId(suggestion.id); setHistoryOpen(false); }}
        >
          <span className={`agent-proactive-history-source source-${suggestion.source}`}>{t(PROACTIVE_SOURCE_LABELS[suggestion.source])}</span>
          <strong>{suggestion.title}</strong>
          <span className={`agent-proactive-history-state ${suggestion.status}`}>{t(PROACTIVE_STATUS_LABELS[suggestion.status])}</span>
          <time>{formatRelativeTime(suggestion.createdAt)}</time>
        </button>)}
        {historyRows.length === 0 && <div className="agent-proactive-empty compact">
          <strong>{t("No history yet")}</strong>
          <p>{t("Queued, shown, accepted, dismissed, and expired suggestions all appear here.")}</p>
        </div>}
      </div>
    </div> : <div className="agent-proactive-body">
      {replyOpen ? <div className="agent-proactive-reply-thread">
        <button className="agent-proactive-back" onClick={() => setReplyOpen(false)}><span>{t("Back to suggestions")}</span></button>
        <div className="agent-proactive-reply-list">
          {replyMessages.map((message, index) => <div key={`${message.role}-${index}`} className={`agent-proactive-reply-message ${message.role}`}>
            <span>{message.role === "assistant" ? t("Proactive agent") : t("You")}</span>
            <p>{message.text}</p>
          </div>)}
          {controller.replyBusy && <div className="agent-proactive-reply-message assistant pending"><span>{t("Proactive agent")}</span><p>{t("Thinking…")}</p></div>}
          {replyError && <p className="agent-proactive-reply-error">{replyError}</p>}
          <div ref={replyEndRef} />
        </div>
      </div> : selected ? <>
        {selected.id !== latest?.id && <button className="agent-proactive-back" onClick={backToLatest}>
          <span>{t("Earlier output")}</span>
          <b>{t("Back to latest")}</b>
        </button>}
        <div className="agent-proactive-meta">
          <b className={`agent-proactive-source source-${selected.source}`}>{t(PROACTIVE_SOURCE_LABELS[selected.source])}</b>
          <time>{formatRelativeTime(selected.createdAt)}</time>
          {stateLabel && <span className={`agent-proactive-state ${selected.status}`}>{stateLabel}</span>}
        </div>
        <h3 className="agent-proactive-title">{selected.title}</h3>
        <p className="agent-proactive-why">{selected.whyNow}</p>
        <div className="agent-proactive-evidence-row">
          {selected.evidence.map((evidence, index) => <button
            key={`${evidence.kind}-${index}`}
            className={openEvidence === index ? "agent-proactive-evidence-chip active" : "agent-proactive-evidence-chip"}
            onClick={() => setOpenEvidence(openEvidence === index ? null : index)}
            aria-expanded={openEvidence === index}
            title={t("Open evidence")}
          >
            <span>{evidenceLabel(evidence)}</span>
          </button>)}
        </div>
        {openEvidence !== null && selected.evidence[openEvidence] && <EvidenceDetail evidence={selected.evidence[openEvidence]} />}
        {(actionable || selected.action.undo) && <div className="agent-proactive-action-row">
          {actionable && <button className="agent-proactive-primary" onClick={() => controller.accept(selected)}>{actionLabel(selected.action, language, t)}</button>}
          {selected.action.undo && <button className="agent-proactive-secondary" onClick={() => controller.undo(selected)}>{t("Undo")}</button>}
          {actionable && <button className="agent-proactive-dismiss" onClick={() => controller.dismiss(selected)}>{t("Not now")}</button>}
        </div>}
      </> : mode === "off" ? <div className="agent-proactive-empty">
        <strong>{t("Proactive agent is off")}</strong>
        <p>{t("It reads only app context — paper pages, selections, searches, and build errors. No screenshots, no background model calls.")}</p>
        <button className="primary-button" onClick={() => controller.setSettings({ mode: "manual" })}>{t("Enable manual review")}</button>
      </div> : <div className="agent-proactive-empty">
        <strong>{mode === "manual" ? t("Ready when you are") : t("No suggestions right now")}</strong>
        <p>{mode === "manual"
          ? t("Use Observe once to review the latest answer, or turn on Auto in settings to watch for 0-result searches, repeated selections, and failed builds.")
          : t("Watching for 0-result searches, repeated selections, and failed LaTeX builds. Suggestions stay here until you open the panel.")}</p>
        <div className="agent-proactive-empty-actions">
          <button className="secondary-button" onClick={controller.observeOnce}>{t("Observe once")}</button>
          <button className="agent-proactive-text-button" onClick={onOpenSettings}>{t("Open settings")}</button>
        </div>
      </div>}
    </div>}

    {!historyOpen && (composerOpen ? <form className="agent-proactive-compose" onSubmit={submitReply}>
      <input
        ref={composerRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={t("Reply to Proactive agent…")}
        aria-label={t("Reply to Proactive agent")}
        onKeyDown={(event) => { if (event.key === "Escape") { setComposerOpen(false); setDraft(""); } }}
      />
      <button type="submit" className="agent-proactive-send" disabled={!draft.trim() || controller.replyBusy} title={t("Send reply")} aria-label={t("Send reply")}><ArrowUp size={15} /></button>
      <button type="button" className="agent-proactive-compose-close" onClick={() => { setComposerOpen(false); setDraft(""); }} title={t("Close")} aria-label={t("Close")}><X size={11} /></button>
    </form> : <div className="agent-proactive-foot">
      <button className="agent-proactive-reply" onClick={openReplyComposer}>
        <MessageSquare size={12} />
        {t("Reply")}
      </button>
    </div>)}
  </div>;
}

