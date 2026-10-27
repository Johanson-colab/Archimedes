import { useState } from "react";
import { GripVertical } from "lucide-react";
import { useUISettings } from "./i18n";
import { moveWorkbenchTab, setWorkbenchTabVisibility, visibleWorkbenchTabs, workbenchTabDefinition, type WorkbenchTabId, type WorkbenchTabPreferences } from "./workbench-tabs";

type WorkbenchSettingsPanelProps = {
  preferences: WorkbenchTabPreferences;
  onChange: (preferences: WorkbenchTabPreferences) => void;
  onReset: () => void;
};

export default function WorkbenchSettingsPanel({ preferences, onChange, onReset }: WorkbenchSettingsPanelProps) {
  const { t } = useUISettings();
  const [dragging, setDragging] = useState<WorkbenchTabId | null>(null);
  const [dropTarget, setDropTarget] = useState<WorkbenchTabId | null>(null);
  const visibleCount = visibleWorkbenchTabs(preferences).length;

  return <div className="workbench-settings-panel">
    <p className="workbench-settings-hint">{t("Choose which tabs appear in the workbench. Drag the handle to change their order.")}</p>
    <div className="workbench-settings-list" role="list">
      {preferences.order.map((id) => {
        const tab = workbenchTabDefinition(id);
        const visible = !preferences.hidden.includes(id);
        const lockedVisible = visible && visibleCount <= 1;
        return <div
          key={id}
          role="listitem"
          className={`workbench-settings-row${dragging === id ? " dragging" : ""}${dropTarget === id && dragging && dragging !== id ? " drop-target" : ""}`}
          onDragOver={(event) => {
            if (!dragging || dragging === id) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setDropTarget(id);
          }}
          onDragLeave={() => setDropTarget((current) => current === id ? null : current)}
          onDrop={(event) => {
            event.preventDefault();
            if (dragging && dragging !== id) onChange(moveWorkbenchTab(preferences, dragging, id));
            setDragging(null);
            setDropTarget(null);
          }}
        >
          <span
            className="workbench-settings-grip"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", id);
              setDragging(id);
            }}
            onDragEnd={() => { setDragging(null); setDropTarget(null); }}
            title={t("Drag to reorder")}
            aria-hidden="true"
          ><GripVertical size={14} /></span>
          <span className="workbench-settings-icon">{tab.icon}</span>
          <div className="workbench-settings-copy">
            <strong>{t(tab.labelKey)}</strong>
            <p>{t(tab.descriptionKey)}</p>
          </div>
          <button
            className={visible ? "workbench-visibility on" : "workbench-visibility"}
            role="switch"
            aria-checked={visible}
            aria-label={visible ? t("Hide {tab}", { tab: t(tab.labelKey) }) : t("Show {tab}", { tab: t(tab.labelKey) })}
            title={lockedVisible ? t("At least one tab must stay visible.") : visible ? t("Hide {tab}", { tab: t(tab.labelKey) }) : t("Show {tab}", { tab: t(tab.labelKey) })}
            disabled={lockedVisible}
            onClick={() => onChange(setWorkbenchTabVisibility(preferences, id, !visible))}
          ><span /></button>
        </div>;
      })}
    </div>
    <div className="workbench-settings-actions">
      <button className="secondary-button" onClick={onReset}>{t("Reset to defaults")}</button>
      <span>{visibleCount === 1 ? t("1 visible tab") : t("{count} visible tabs", { count: visibleCount })}</span>
    </div>
  </div>;
}
