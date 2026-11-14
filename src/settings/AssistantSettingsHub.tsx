import ProactiveSettingsPanel from "../ProactiveSettingsPanel";
import type { ProactiveSettings } from "../proactive-types";
import type { SessionToolPreferences } from "../session-tools";
import { CommentsSettingsPanel, SnapshotSettingsPanel } from "./SessionToolsSettingsPanel";

type AssistantSettingsHubProps = {
  view: string;
  proactiveSettings: ProactiveSettings;
  onChangeProactiveSettings: (patch: Partial<ProactiveSettings>) => void;
  onObserveProactive: () => void;
  onResetProactiveHistory: () => void;
  proactiveHistoryCount: number;
  bridge: ResearchDeskBridge;
  sessionTools: SessionToolPreferences;
  onSessionToolsChange: (patch: Partial<SessionToolPreferences>) => void;
};

export default function AssistantSettingsHub({
  view,
  proactiveSettings,
  onChangeProactiveSettings,
  onObserveProactive,
  onResetProactiveHistory,
  proactiveHistoryCount,
  bridge,
  sessionTools,
  onSessionToolsChange,
}: AssistantSettingsHubProps) {
  return <div className="settings-sections">
    <div className="settings-hub-panel" role="tabpanel" hidden={view !== "proactive"}>
      <ProactiveSettingsPanel
        settings={proactiveSettings}
        onChange={onChangeProactiveSettings}
        onObserveOnce={onObserveProactive}
        onResetHistory={onResetProactiveHistory}
        bridge={bridge}
        historyCount={proactiveHistoryCount}
        canObserve={proactiveSettings.mode !== "off"}
      />
    </div>
    <div className="settings-hub-panel" role="tabpanel" hidden={view !== "comments"}>
      <CommentsSettingsPanel preferences={sessionTools} onChange={onSessionToolsChange} />
    </div>
    <div className="settings-hub-panel" role="tabpanel" hidden={view !== "snapshots"}>
      <SnapshotSettingsPanel preferences={sessionTools} onChange={onSessionToolsChange} />
    </div>
  </div>;
}
