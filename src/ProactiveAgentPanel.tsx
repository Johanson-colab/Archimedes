import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronUp, MoreHorizontal } from "lucide-react";
import { useUISettings } from "./i18n";
import { evidenceLabel, formatRelativeTime } from "./proactive-engine";
import {
  PROACTIVE_SOURCE_LABELS,
  PROACTIVE_STATUS_LABELS,
  type ProactiveEvidence,
  type ProactiveSuggestion,
} from "./proactive-types";
import type { ProactiveAgentController } from "./useProactiveAgent";

type HistoryFilter = "all" | "open" | "accepted" | "dismissed";

function EvidenceDetail({ evidence }: { evidence: ProactiveEvidence }) {
  switch (evidence.kind) {
    case "search":
      return <div className="proactive-evidence-detail">
        <span>{evidence.libraryName ?? "Library"} · {evidence.paperTitle ?? "Paper"}</span>
        <code>{evidence.query}</code>
        <small>{evidence.resultCount} matching passages</small>
      </div>;
    case "selection":
      return <div className="proactive-evidence-detail">
        <span>{evidence.paperTitle} · p. {evidence.page}</span>
        <blockquote>{evidence.text}</blockquote>
      </div>;
    case "terminal":
      return <div className="proactive-evidence-detail">
        <span>{evidence.command} · exit {evidence.exitCode}</span>
        <pre>{evidence.output}</pre>
      </div>;
    case "citation":
      return <div className="proactive-evidence-detail">
        <span>Claim without a source</span>
        <blockquote>{evidence.quote}</blockquote>
      </div>;
    case "generic":
      return <div className="proactive-evidence-detail">
        <span>{evidence.label}</span>
        <p>{evidence.detail}</p>
      </div>;
  }
}

function ProactiveCard({
  suggestion,
  onAccept,
  onDismiss,
  onUndo,
}: {
  suggestion: ProactiveSuggestion;
  onAccept: (suggestion: ProactiveSuggestion) => void;
  onDismiss: (suggestion: ProactiveSuggestion) => void;
  onUndo: (suggestion: ProactiveSuggestion) => void;
}) {
  const { t } = useUISettings();
  const [openEvidence, setOpenEvidence] = useState<number | null>(null);
  const open = openEvidence !== null;
  const action = suggestion.action;
  const canUndo = Boolean(action.undo);
  return <article className={`proactive-card source-${suggestion.source} ${suggestion.status}`}>
    <header className="proactive-card-head">
      <span className={`proactive-source source-${suggestion.source}`}>{t(PROACTIVE_SOURCE_LABELS[suggestion.source])}</span>
      <time>{formatRelativeTime(suggestion.createdAt)}</time>
    </header>
    <h3>{suggestion.title}</h3>
    <div className="proactive-card-body">
      <div className="proactive-card-copy">
        <p className="proactive-why">{suggestion.whyNow}</p>
        <div className="proactive-evidence-row">
          {suggestion.evidence.map((evidence, index) => <button
            key={`${evidence.kind}-${index}`}
            className={openEvidence === index ? "proactive-evidence-chip active" : "proactive-evidence-chip"}
            onClick={() => setOpenEvidence(openEvidence === index ? null : index)}
            aria-expanded={openEvidence === index}
            title={t("Open evidence")}
          >
            <span>{evidenceLabel(evidence)}</span>
          </button>)}
        </div>
      </div>
      <div className="proactive-card-actions">
        <button className="proactive-primary" onClick={() => onAccept(suggestion)}>{action.label}</button>
        {canUndo && <button className="proactive-secondary" onClick={() => onUndo(suggestion)}>{t("Undo")}</button>}
        <button className="proactive-dismiss" onClick={() => onDismiss(suggestion)}>{t("Not now")}</button>
      </div>
    </div>
    {open && openEvidence !== null && <EvidenceDetail evidence={suggestion.evidence[openEvidence]} />}
    {suggestion.status === "accepted" && <div className="proactive-card-state">{t("Accepted")}</div>}
    {suggestion.status === "undone" && <div className="proactive-card-state">{t("Undone")}</div>}
  </article>;
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
  const { t } = useUISettings();
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const suggestions = controller.state.suggestions;
  const inbox = useMemo(
    () => suggestions
      .filter((suggestion) => suggestion.status === "queued" || suggestion.status === "shown")
      .sort((left, right) => right.createdAt - left.createdAt),
    [suggestions],
  );
  const history = useMemo(
    () => suggestions
      .filter((suggestion) => {
        if (historyFilter === "open") return suggestion.status === "queued" || suggestion.status === "shown";
        if (historyFilter === "accepted") return suggestion.status === "accepted" || suggestion.status === "undone";
        if (historyFilter === "dismissed") return suggestion.status === "dismissed" || suggestion.status === "expired";
        return true;
      })
      .sort((left, right) => right.createdAt - left.createdAt),
    [historyFilter, suggestions],
  );
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
    if (!menuOpen) return;
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menuOpen]);

  return <div className="proactive-panel dock-panel">
    <header className="proactive-panel-head dock-panel-head">
      <div className="proactive-panel-title">
        <span className="proactive-panel-name">{t("Proactive agent")}</span>
        <span className={statusActive ? "proactive-status-text active" : "proactive-status-text"}>{status}</span>
        <span className="proactive-budget" title={t("{count} of {total} auto suggestions today", { count: controller.todayCount, total: controller.settings.dailyBudget })}>{controller.todayCount}/{controller.settings.dailyBudget}</span>
      </div>
      <div className="proactive-panel-actions" ref={menuRef}>
        <button className={menuOpen ? "proactive-head-button active" : "proactive-head-button"} onClick={() => setMenuOpen((open) => !open)} title={t("More actions")} aria-label={t("More actions")} aria-haspopup="menu" aria-expanded={menuOpen}><MoreHorizontal size={14} /></button>
        <button className="dock-panel-collapse" onClick={onCollapse} title={t("Collapse Proactive agent")} aria-label={t("Collapse Proactive agent")}><ChevronUp size={14} /></button>
        {menuOpen && <div className="proactive-menu" role="menu" aria-label={t("Proactive actions")}>
          <button role="menuitem" onClick={() => { setMenuOpen(false); controller.observeOnce(); }}>{t("Observe once")}</button>
          <button role="menuitem" onClick={() => { setMenuOpen(false); controller.setPanelView(controller.panelView === "history" ? "inbox" : "history"); }}>{controller.panelView === "history" ? t("Back to suggestions") : t("Suggestion history")}</button>
          <button role="menuitem" onClick={() => { setMenuOpen(false); onOpenSettings(); }}>{t("Proactive settings")}</button>
        </div>}
      </div>
    </header>

    {controller.panelView === "inbox" ? <div className="proactive-inbox">
      {inbox.length > 0 ? inbox.map((suggestion) => <ProactiveCard
        key={suggestion.id}
        suggestion={suggestion}
        onAccept={controller.accept}
        onDismiss={controller.dismiss}
        onUndo={controller.undo}
      />) : mode === "off" ? <div className="proactive-empty">
        <strong>{t("Proactive agent is off")}</strong>
        <p>{t("It reads only app context — paper pages, selections, searches, and build errors. No screenshots, no background model calls.")}</p>
        <button className="primary-button" onClick={() => controller.setSettings({ mode: "manual" })}>{t("Enable manual review")}</button>
      </div> : <div className="proactive-empty">
        <strong>{mode === "manual" ? t("Ready when you are") : t("No suggestions right now")}</strong>
        <p>{mode === "manual"
          ? t("Use Observe once to review the latest answer, or turn on Auto in settings to watch for 0-result searches, repeated selections, and failed builds.")
          : t("Watching for 0-result searches, repeated selections, and failed LaTeX builds. Suggestions stay here until you open the panel.")}</p>
        <div className="proactive-empty-actions">
          <button className="secondary-button" onClick={controller.observeOnce}>{t("Observe once")}</button>
          <button className="proactive-text-button" onClick={onOpenSettings}>{t("Open settings")}</button>
        </div>
      </div>}
    </div> : <div className="proactive-history">
      <div className="proactive-history-filters" role="tablist" aria-label={t("Suggestion history filter")}>
        {([["all", "All"], ["open", "Open"], ["accepted", "Accepted"], ["dismissed", "Dismissed"]] as Array<[HistoryFilter, string]>).map(([id, label]) => <button key={id} role="tab" aria-selected={historyFilter === id} className={historyFilter === id ? "active" : ""} onClick={() => setHistoryFilter(id)}>{t(label)}</button>)}
      </div>
      {history.length ? <div className="proactive-history-list">{history.map((suggestion) => <div className="proactive-history-row" key={suggestion.id}>
        <span className={`proactive-source source-${suggestion.source}`}>{t(PROACTIVE_SOURCE_LABELS[suggestion.source])}</span>
        <strong>{suggestion.title}</strong>
        <span className={`proactive-history-status ${suggestion.status}`}>{t(PROACTIVE_STATUS_LABELS[suggestion.status])}</span>
        <time>{formatRelativeTime(suggestion.createdAt)}</time>
      </div>)}</div> : <div className="proactive-empty compact"><strong>{t("No history yet")}</strong><p>{t("Queued, shown, accepted, dismissed, and expired suggestions all appear here.")}</p></div>}
      <div className="proactive-history-footer">
        <span>{t("{count} suggestions retained for 30 days", { count: suggestions.length })}</span>
        <button className="proactive-text-button danger" onClick={() => { if (window.confirm(t("Clear all proactive suggestion history?"))) controller.resetHistory(); }}>{t("Clear history")}</button>
      </div>
    </div>}
  </div>;
}
