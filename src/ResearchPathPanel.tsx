import { Blocks, Check, ChevronUp, RefreshCw } from "lucide-react";
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
  onSelectStage: (stage: ResearchStageId | null) => void;
  onAccept: () => void;
  onRequestChanges: () => void;
  onBranch: () => void;
  onReturn: (stage: ResearchStage) => void;
  onCollapse: () => void;
};

/**
 * Research path is thread state, not module navigation. It lives in the top
 * dock so the reading/writing surface keeps its full height.
 */
export default function ResearchPathPanel({
  stages,
  activeStage,
  acceptedStages,
  staleStages,
  selectedStage,
  agentBusy,
  notice,
  onSelectStage,
  onAccept,
  onRequestChanges,
  onBranch,
  onReturn,
  onCollapse,
}: ResearchPathPanelProps) {
  const { t } = useUISettings();
  const activeIndex = Math.max(0, stages.findIndex((stage) => stage.id === activeStage.id));
  const selected = selectedStage ? stages.find((stage) => stage.id === selectedStage) ?? activeStage : null;
  const selectedIsActive = selected?.id === activeStage.id;

  return <div className="research-path-panel dock-panel">
    <header className="research-path-head dock-panel-head">
      <div className="research-path-heading">
        <span>{t("Research path")}</span>
        <small>{activeIndex + 1} / {stages.length}</small>
      </div>
      <div className="research-path-actions">
        {notice && <span className="research-path-notice" title={notice}>{notice}</span>}
        <button
          className={selectedIsActive ? "research-path-review active" : "research-path-review"}
          onClick={() => onSelectStage(selectedStage === activeStage.id ? null : activeStage.id)}
          aria-expanded={selectedIsActive}
        >
          <span>{t("Review checkpoint")}</span>
        </button>
        <button className="dock-panel-collapse" onClick={onCollapse} title={t("Collapse Research path")} aria-label={t("Collapse Research path")}><ChevronUp size={14} /></button>
      </div>
    </header>

    <div className="research-path-track" role="list" aria-label="Research stages">
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

    {selected && <div className="research-path-checkpoint">
      <div className="research-path-checkpoint-copy">
        <span>{selectedIsActive ? t("Next checkpoint") : t(selected.label)}</span>
        <strong>{t(selected.checkpoint)}</strong>
        <p>{t(selected.description)}</p>
      </div>
      <div className="research-path-checkpoint-actions">
        {selectedIsActive && <button className="research-path-primary" onClick={onAccept}><Check size={12} />{t("Accept & advance")}</button>}
        {selectedIsActive && <button onClick={onRequestChanges}><RefreshCw size={12} />{t("Request changes")}</button>}
        {selectedIsActive && <button onClick={onBranch}><Blocks size={12} />{t("Create branch")}</button>}
        {!selectedIsActive && <button onClick={() => onReturn(selected)}><RefreshCw size={12} />{t("Return here")}</button>}
      </div>
    </div>}
  </div>;
}
