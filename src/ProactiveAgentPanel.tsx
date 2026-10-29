import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Clock, MessageSquare, MoreHorizontal, Send, X } from "lucide-react";
import { useUISettings } from "./i18n";
import { evidenceLabel, formatRelativeTime } from "./proactive-engine";
import {
  PROACTIVE_SOURCE_LABELS,
  PROACTIVE_STATUS_LABELS,
  type ProactiveEvidence,
} from "./proactive-types";
import type { ProactiveAgentController } from "./useProactiveAgent";

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
  onDraftInChat,
}: {
  controller: ProactiveAgentController;
  onOpenSettings: () => void;
  onCollapse: () => void;
  onDraftInChat: (text: string) => void;
}) {
  const { t } = useUISettings();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [openEvidence, setOpenEvidence] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLInputElement | null>(null);

  const suggestions = controller.state.suggestions;
  const sorted = useMemo(
    () => [...suggestions].sort((left, right) => right.createdAt - left.createdAt),
    [suggestions],
  );
  const latest = sorted[0] ?? null;
  const selected = selectedId ? sorted.find((suggestion) => suggestion.id === selectedId) ?? latest : latest;
  const mode = controller.settings.mode;
  const limited = controller.quiet || controller.budgetReached || controller.suppressed || controller.composerFocused;
  const status = controller.quiet
    ? t("Quiet hours")
    : controller.budgetReached
      ? t("Daily budget reached")
      : controller.suppressed
        ? t("Paused after dismissals")
        : controller.composerFocused
          ? t("Paused while typing")
          : mode === "auto"
            ? t("Watching L0 signals")
            : mode === "manual"
              ? t("Manual review")
              : t("Off");
  const statusActive = mode !== "off" && !limited;

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
  }

  function submitDraft(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onDraftInChat(text);
    setDraft("");
    setComposerOpen(false);
  }

  const actionable = selected?.status === "queued" || selected?.status === "shown";
  const stateLabel = selected && !actionable && selected.status !== "expired"
    ? t(PROACTIVE_STATUS_LABELS[selected.status])
    : "";

  return <div className="agent-proactive-panel dock-panel" data-paused={limited ? "true" : "false"}>
    <header className="agent-proactive-head dock-panel-head">
      <span className="agent-proactive-status" title={t("{count} of {total} auto suggestions today", { count: controller.todayCount, total: controller.settings.dailyBudget })}>
        <i className={statusActive ? "agent-proactive-bar active" : "agent-proactive-bar"} aria-hidden="true" />
        <span>{status}</span>
      </span>
      <div className="agent-proactive-tools" ref={menuRef}>
        <button
          className={historyOpen ? "agent-proactive-icon wide active" : "agent-proactive-icon wide"}
          onClick={openHistory}
          title={t("History")}
          aria-label={t("History")}
          aria-pressed={historyOpen}
        >
          <Clock size={12} />
          {sorted.length > 0 && <span>{sorted.length}</span>}
        </button>
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
      <div className="agent-proactive-history-list">
        {sorted.map((suggestion) => <button
          key={suggestion.id}
          className={suggestion.id === selected?.id ? "agent-proactive-history-row active" : "agent-proactive-history-row"}
          onClick={() => { setSelectedId(suggestion.id); setHistoryOpen(false); }}
        >
          <span className={`agent-proactive-history-source source-${suggestion.source}`}>{t(PROACTIVE_SOURCE_LABELS[suggestion.source])}</span>
          <strong>{suggestion.title}</strong>
          <span className={`agent-proactive-history-state ${suggestion.status}`}>{t(PROACTIVE_STATUS_LABELS[suggestion.status])}</span>
          <time>{formatRelativeTime(suggestion.createdAt)}</time>
        </button>)}
        {sorted.length === 0 && <div className="agent-proactive-empty compact">
          <strong>{t("No history yet")}</strong>
          <p>{t("Queued, shown, accepted, dismissed, and expired suggestions all appear here.")}</p>
        </div>}
      </div>
    </div> : <div className="agent-proactive-body">
      {selected ? <>
        {selected.id !== latest?.id && <button className="agent-proactive-back" onClick={backToLatest}>
          <span>{t("Earlier output")}</span>
          <b>{t("Back to latest")}</b>
        </button>}
        <div className="agent-proactive-meta">
          <b className={`agent-proactive-source source-${selected.source}`}>{t(PROACTIVE_SOURCE_LABELS[selected.source])}</b>
          <span>·</span>
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
          {actionable && <button className="agent-proactive-primary" onClick={() => controller.accept(selected)}>{selected.action.label}</button>}
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

    {!historyOpen && (composerOpen ? <form className="agent-proactive-compose" onSubmit={submitDraft}>
      <input
        ref={composerRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={t("Ask in chat (draft only)")}
        aria-label={t("Ask in chat")}
        onKeyDown={(event) => { if (event.key === "Escape") { setComposerOpen(false); setDraft(""); } }}
      />
      <button type="submit" className="agent-proactive-send" disabled={!draft.trim()} title={t("Draft in chat")} aria-label={t("Draft in chat")}><Send size={11} /></button>
      <button type="button" className="agent-proactive-compose-close" onClick={() => { setComposerOpen(false); setDraft(""); }} title={t("Close")} aria-label={t("Close")}><X size={11} /></button>
    </form> : <div className="agent-proactive-foot">
      <button className="agent-proactive-reply" onClick={() => setComposerOpen(true)}>
        <MessageSquare size={11} />
        {t("Reply")}
      </button>
      <span className="agent-proactive-foot-hint">{t("Suggestions only · drafts go to chat")}</span>
    </div>)}
  </div>;
}
