import { ArrowUpRight, Pin, X } from "lucide-react";
import { useUISettings } from "./i18n";
import type { ResearchStage } from "./research-path";
import "./workflow-continuity.css";

type Props = {
  stages: ResearchStage[];
  activeStage: ResearchStage;
  agentBusy: boolean;
  projectName: string;
  threadTitle: string;
  pinned: boolean;
  threadInactive: boolean;
  hasThread: boolean;
  onChangeMode: (stage: ResearchStage) => void;
  onTogglePin: () => void;
  onOpenThread: () => void;
  onCollapse: () => void;
};

/** A message mode is a routing choice, not evidence that research is complete. */
export default function ResearchPathPanel({ stages, activeStage, agentBusy, projectName, threadTitle, pinned, threadInactive, hasThread, onChangeMode, onTogglePin, onOpenThread, onCollapse }: Props) {
  const { t } = useUISettings();
  return <div className="agent-path-panel dock-panel work-mode-panel">
    <header className="agent-path-head dock-panel-head">
      <span className="agent-path-project" title={threadTitle}><i aria-hidden="true" />{projectName}</span>
      <span className="work-mode-heading">{t("Work modes")}</span>
      <div className="agent-path-actions">
        <button className={pinned ? "agent-path-icon on" : "agent-path-icon"} onClick={onTogglePin} title={pinned ? t("Unpin this session") : t("Pin this session")} aria-label={pinned ? t("Unpin this session") : t("Pin this session")} aria-pressed={pinned} disabled={!hasThread && !pinned}><Pin size={12} /></button>
        <button className="agent-path-icon" onClick={onOpenThread} title={t("Open session")} aria-label={t("Open session")} disabled={!hasThread}><ArrowUpRight size={12} /></button>
        <button className="agent-path-icon" onClick={onCollapse} title={t("Close Work modes")} aria-label={t("Close Work modes")}><X size={12} /></button>
      </div>
    </header>
    <div className="research-path-track agent-path-rail" role="group" aria-label={t("Work modes")}>
      {stages.map((stage) => <button key={stage.id} className={`research-path-stage ${stage.id === activeStage.id ? agentBusy ? "running" : "active" : ""}`} onClick={() => onChangeMode(stage)} disabled={threadInactive} aria-pressed={stage.id === activeStage.id} title={t(stage.description)}><span className="research-path-label">{t(stage.label)}</span></button>)}
    </div>
    <div className="work-mode-description">
      <p>{t(activeStage.description)}</p>
      {threadInactive ? <button className="quiet-button" onClick={onOpenThread}>{t("Open pinned session")}</button> : <small>{t("Sets the mode for your next message.")}</small>}
    </div>
  </div>;
}
