import { ArrowUpRight, Blocks, Check, Pin, RefreshCw, X } from "lucide-react";
import { useUISettings } from "./i18n";
import type { ResearchStage, ResearchStageId } from "./research-path";

type ResearchPathPanelProps = {
  stages: ResearchStage[];
  activeStage: ResearchStage;
  acceptedStages: ResearchStageId[];
  staleStages: ResearchStageId[];
  selectedStage: ResearchStageId | null;
  agentBusy: boolean;
  notice: string;
  projectName: string;
  threadTitle: string;
  pinned: boolean;
  threadInactive: boolean;
  hasThread: boolean;
  onSelectStage: (stage: ResearchStageId | null) => void;
  onAccept: () => void;
  onRequestChanges: () => void;
  onBranch: () => void;
  onReturn: (stage: ResearchStage) => void;
  onTogglePin: () => void;
  onOpenThread: () => void;
  onCollapse: () => void;
};

/**
 * The research path is thread state. It stays in the global dock, follows the
 * active thread by default, and can be pinned to a specific thread so it keeps
 * showing while the user is in Library, Files, or Paper writing.
 */
export default function ResearchPathPanel({
  stages,
  activeStage,
  acceptedStages,
  staleStages,
  selectedStage,
  agentBusy,
  notice,
  projectName,
  threadTitle,
  pinned,
  threadInactive,
  hasThread,
  onSelectStage,
  onAccept,
  onRequestChanges,
  onBranch,
  onReturn,
  onTogglePin,
  onOpenThread,
  onCollapse,
}: ResearchPathPanelProps) {
  const { t } = useUISettings();
  const activeIndex = Math.max(0, stages.findIndex((stage) => stage.id === activeStage.id));
  const shownStage = selectedStage ? stages.find((stage) => stage.id === selectedStage) ?? activeStage : activeStage;
  const shownIsActive = shownStage.id === activeStage.id;
  const canAct = hasThread && !threadInactive && shownIsActive;

  return <div className="agent-path-panel dock-panel">
    <header className="agent-path-head dock-panel-head">
      <span className="agent-path-project" title={threadTitle}>
        <i aria-hidden="true" />
        {projectName}
      </span>
      {pinned && threadInactive && <span className="agent-path-pin-state inactive">{t("Pinned")}</span>}
      <span className="agent-path-count">{activeIndex + 1} / {stages.length}</span>
      <div className="agent-path-actions">
        {notice && <span className="agent-path-notice" title={notice}>{notice}</span>}
        <button
          className={pinned ? "agent-path-icon on" : "agent-path-icon"}
          onClick={onTogglePin}
          title={pinned ? t("Unpin this thread") : t("Pin this thread")}
          aria-label={pinned ? t("Unpin this thread") : t("Pin this thread")}
          aria-pressed={pinned}
          disabled={!hasThread && !pinned}
        >
          <Pin size={12} />
        </button>
        <button
          className="agent-path-icon"
          onClick={onOpenThread}
          title={t("Open thread")}
          aria-label={t("Open thread")}
          disabled={!hasThread}
        >
          <ArrowUpRight size={12} />
        </button>
        <button className="agent-path-icon" onClick={onCollapse} title={t("Close Research path")} aria-label={t("Close Research path")}>
          <X size={12} />
        </button>
      </div>
    </header>

    <div className="research-path-track agent-path-rail" role="list" aria-label="Research stages">
      {stages.map((stage, index) => {
        const accepted = acceptedStages.includes(stage.id);
        const stale = staleStages.includes(stage.id);
        const active = stage.id === activeStage.id;
        const state = stale ? "stale" : active ? (agentBusy ? "running" : "active") : accepted ? "accepted" : "planned";
        return <div className="research-path-segment" role="listitem" key={stage.id}>
          <button
            className={`research-path-stage ${state} ${selectedStage === stage.id ? "selected" : ""}`}
            onClick={() => onSelectStage(selectedStage === stage.id ? null : stage.id)}
            aria-current={active ? "step" : undefined}
            title={t(stage.checkpoint)}
          >
            <span className="research-path-node" aria-hidden="true">
              {accepted && !stale ? <Check size={11} /> : index + 1}
            </span>
            <span className="research-path-label">{t(stage.label)}</span>
          </button>
          {index < stages.length - 1 && <span className={`research-path-line ${accepted && !stale ? "complete" : ""}`} aria-hidden="true" />}
        </div>;
      })}
    </div>

    <div className="agent-path-checkpoint">
      <div className="agent-path-checkpoint-copy">
        <span>{shownIsActive ? t("Next checkpoint") : t(shownStage.label)}</span>
        <strong>{t(shownStage.checkpoint)}</strong>
        <p>{t(shownStage.description)}</p>
      </div>
      <div className="agent-path-checkpoint-actions">
        {canAct && <>
          <button className="agent-path-primary" onClick={onAccept}><Check size={11} />{t("Accept & advance")}</button>
          <button onClick={onRequestChanges}><RefreshCw size={11} />{t("Request changes")}</button>
          <button onClick={onBranch}><Blocks size={11} />{t("Branch")}</button>
        </>}
        {shownIsActive && !canAct && <button onClick={onOpenThread} disabled={!hasThread}>
          <ArrowUpRight size={11} />
          {threadInactive ? t("Open pinned thread") : hasThread ? t("Open thread") : t("Start a research thread")}
        </button>}
        {!shownIsActive && !threadInactive && <button onClick={() => onReturn(shownStage)}><RefreshCw size={11} />{t("Return here")}</button>}
      </div>
    </div>
  </div>;
}
