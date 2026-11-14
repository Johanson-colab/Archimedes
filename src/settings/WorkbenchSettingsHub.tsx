import type { WorkbenchTabPreferences } from "../workbench-tabs";
import WorkbenchSettingsPanel from "../WorkbenchSettingsPanel";
import TerminalSettingsModal from "../TerminalSettingsModal";
import JourneySettingsPanel from "../JourneySettingsPanel";
import { useUISettings } from "../i18n";

type WorkbenchSettingsHubProps = {
  view: string;
  preferences: WorkbenchTabPreferences;
  onChangePreferences: (preferences: WorkbenchTabPreferences) => void;
  onResetPreferences: () => void;
  terminalSettings: TerminalSettings | null;
  onSaveTerminalSettings: (patch: Partial<TerminalSettings>) => Promise<void>;
  onOpenExternalTerminal: (terminal: TerminalExternalTerminal) => Promise<void>;
  workspace: string;
  journeySettings: JourneySettings;
  onSaveJourneySettings: (patch: Partial<JourneySettings>) => Promise<void>;
  onResetJourneySettings: () => Promise<void>;
  onOpenModels: () => void;
};

export default function WorkbenchSettingsHub({
  view,
  preferences,
  onChangePreferences,
  onResetPreferences,
  terminalSettings,
  onSaveTerminalSettings,
  onOpenExternalTerminal,
  workspace,
  journeySettings,
  onSaveJourneySettings,
  onResetJourneySettings,
  onOpenModels,
}: WorkbenchSettingsHubProps) {
  const { t } = useUISettings();
  return <div className="settings-sections">
    <div className="settings-hub-panel" role="tabpanel" hidden={view !== "layout"}>
      <WorkbenchSettingsPanel preferences={preferences} onChange={onChangePreferences} onReset={onResetPreferences} />
    </div>
    <div className="settings-hub-panel" role="tabpanel" hidden={view !== "terminal"}>
      {terminalSettings
        ? <TerminalSettingsModal open embedded mode="settings" settings={terminalSettings} workspace={workspace} onClose={() => undefined} onSave={onSaveTerminalSettings} onOpenExternal={onOpenExternalTerminal} />
        : <div className="settings-empty">{t("Loading terminal settings…")}</div>}
    </div>
    <div className="settings-hub-panel" role="tabpanel" hidden={view !== "research-path"}>
      <JourneySettingsPanel settings={journeySettings} onChange={onSaveJourneySettings} onReset={onResetJourneySettings} onOpenModels={onOpenModels} />
    </div>
  </div>;
}
