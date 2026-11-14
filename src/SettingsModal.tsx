import { useEffect, useState } from "react";
import { X } from "lucide-react";
import AccountSettingsPanel from "./AccountSettingsPanel";
import ModelSettingsModal, { type ModelExecutionPreferences } from "./ModelSettingsModal";
import PluginsSettingsPanel from "./PluginsSettingsPanel";
import SshServersPanel from "./SshServersPanel";
import WebSearchSettingsModal from "./WebSearchSettingsModal";
import { Dialog } from "./Dialog";
import type { AppearanceSettings, AppTheme, ThemePreset } from "./appearance";
import type { WorkbenchTabPreferences } from "./workbench-tabs";
import type { SessionToolPreferences } from "./session-tools";
import type { ProactiveSettings } from "./proactive-types";
import { useUISettings } from "./i18n";
import AppearanceSettingsPanel from "./settings/AppearanceSettingsPanel";
import AssistantSettingsHub from "./settings/AssistantSettingsHub";
import GeneralSettingsPanel from "./settings/GeneralSettingsPanel";
import SettingsSubnav from "./settings/SettingsSubnav";
import WorkbenchSettingsHub from "./settings/WorkbenchSettingsHub";
import WorkspaceSettingsHub from "./settings/WorkspaceSettingsHub";
import {
  defaultSettingsSubview,
  resolveSettingsLocation,
  settingsNavGroups,
  settingsSectionDefinition,
  type SettingsSection,
} from "./settings/registry";

export type { SettingsSection } from "./settings/registry";

type SettingsModalProps = {
  open: boolean;
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  onClose: () => void;
  themePreference: ThemePreset;
  theme: AppTheme;
  systemAppearance: AppTheme;
  onThemePreferenceChange: (preference: ThemePreset) => void;
  appearance: AppearanceSettings;
  onAppearanceChange: (appearance: AppearanceSettings) => void;
  bridge: ResearchDeskBridge;
  onModelSaved: (config: PublicModelConfig) => void;
  executionPreferences?: ModelExecutionPreferences;
  workspace: string;
  workspaceReady: boolean;
  agentBusy: boolean;
  onChooseWorkspace: () => void;
  journeySettings: JourneySettings;
  onSaveJourneySettings: (patch: Partial<JourneySettings>) => Promise<void>;
  onResetJourneySettings: () => Promise<void>;
  onOpenModels: () => void;
  terminalSettings: TerminalSettings | null;
  onSaveTerminalSettings: (patch: Partial<TerminalSettings>) => Promise<void>;
  onOpenExternalTerminal: (terminal: TerminalExternalTerminal) => Promise<void>;
  workbenchPreferences: WorkbenchTabPreferences;
  onChangeWorkbenchPreferences: (preferences: WorkbenchTabPreferences) => void;
  onResetWorkbenchPreferences: () => void;
  proactiveSettings: ProactiveSettings;
  onChangeProactiveSettings: (patch: Partial<ProactiveSettings>) => void;
  onResetProactiveHistory: () => void;
  proactiveHistoryCount: number;
  onObserveProactive: () => void;
  sessionTools: SessionToolPreferences;
  onSessionToolsChange: (patch: Partial<SessionToolPreferences>) => void;
  identity: LocalIdentity | null;
  onSaveIdentity: (displayName: string) => Promise<LocalIdentity>;
  activeProject: ResearchProject | null;
  activeThreadId?: string | null;
  onProjectsChanged?: () => Promise<void>;
  authState: AuthState | null;
  onSignIn: (email: string, password: string) => Promise<AuthState>;
  onSignUp: (email: string, password: string, displayName?: string) => Promise<AuthState>;
  onSignOut: () => Promise<AuthState>;
  onOpenAuth: (mode?: "choice" | "password" | "signup" | "reset") => void;
  onPluginsChanged?: () => void;
  disabledCoreModules: string[];
  onCoreModuleEnabled: (id: string, enabled: boolean) => Promise<void> | void;
};

export default function SettingsModal({
  open,
  section,
  onSectionChange,
  onClose,
  themePreference,
  theme,
  onThemePreferenceChange,
  appearance,
  onAppearanceChange,
  bridge,
  onModelSaved,
  executionPreferences,
  workspace,
  workspaceReady,
  agentBusy,
  onChooseWorkspace,
  journeySettings,
  onSaveJourneySettings,
  onResetJourneySettings,
  onOpenModels,
  terminalSettings,
  onSaveTerminalSettings,
  onOpenExternalTerminal,
  workbenchPreferences,
  onChangeWorkbenchPreferences,
  onResetWorkbenchPreferences,
  proactiveSettings,
  onChangeProactiveSettings,
  onResetProactiveHistory,
  proactiveHistoryCount,
  onObserveProactive,
  sessionTools,
  onSessionToolsChange,
  identity,
  onSaveIdentity,
  activeProject,
  activeThreadId,
  onProjectsChanged,
  authState,
  onSignIn,
  onSignUp,
  onSignOut,
  onOpenAuth,
  onPluginsChanged,
  disabledCoreModules,
  onCoreModuleEnabled,
}: SettingsModalProps) {
  const { t } = useUISettings();
  const location = resolveSettingsLocation(section);
  const activeSection = settingsSectionDefinition(location.section);
  const [subview, setSubview] = useState(() => location.subview ?? defaultSettingsSubview(location.section) ?? "");
  useEffect(() => {
    const resolved = resolveSettingsLocation(section);
    setSubview(resolved.subview ?? defaultSettingsSubview(resolved.section) ?? "");
  }, [section]);

  if (!open) return null;

  const embedded = location.section === "models";

  return <Dialog open={open} onClose={onClose} size="settings" className="settings-modal" overlayClassName="modal-backdrop settings-backdrop" ariaLabel={t("Settings")}>
    <aside className="settings-sidebar">
      <div className="settings-brand"><div><strong>Archimedes</strong><span>{t("Settings")}</span></div></div>
      <nav className="settings-nav" aria-label={t("Settings sections")}>
        {settingsNavGroups().map((group) => <div className="settings-nav-group" key={group.id}>
          <span className="settings-nav-group-label">{t(group.label)}</span>
          {group.sections.map((item) => <button
            key={item.id}
            className={item.id === location.section ? "settings-nav-item active" : "settings-nav-item"}
            onClick={() => onSectionChange(item.id)}
            aria-current={item.id === location.section ? "page" : undefined}
          >
            {item.icon}<span>{t(item.label)}</span>
          </button>)}
        </div>)}
      </nav>
      <span className="settings-version">Archimedes 0.1.0</span>
    </aside>

    <div className="settings-main">
      <header className="settings-header">
        <div className="settings-header-copy"><h2>{t(activeSection.label)}</h2><p>{t(activeSection.description)}</p></div>
        <button className="settings-close" onClick={onClose} title={t("Close settings")} aria-label={t("Close settings")}><X size={16} /></button>
      </header>

      {activeSection.subviews && <SettingsSubnav items={activeSection.subviews} value={subview} onChange={setSubview} label={t(activeSection.label)} />}

      <div className={embedded ? "settings-body settings-body-embedded" : "settings-body"}>
        <div className="settings-content">
          {location.section === "general" && <GeneralSettingsPanel />}
          {location.section === "appearance" && <AppearanceSettingsPanel
            themePreference={themePreference}
            theme={theme}
            appearance={appearance}
            onThemePreferenceChange={onThemePreferenceChange}
            onAppearanceChange={onAppearanceChange}
          />}
          {location.section === "account" && <AccountSettingsPanel identity={identity} onSave={onSaveIdentity} authState={authState} onOpenAuth={onOpenAuth} onSignOut={onSignOut} />}
          {location.section === "workbench" && <WorkbenchSettingsHub
            view={subview}
            preferences={workbenchPreferences}
            onChangePreferences={onChangeWorkbenchPreferences}
            onResetPreferences={onResetWorkbenchPreferences}
            terminalSettings={terminalSettings}
            onSaveTerminalSettings={onSaveTerminalSettings}
            onOpenExternalTerminal={onOpenExternalTerminal}
            workspace={workspace}
            journeySettings={journeySettings}
            onSaveJourneySettings={onSaveJourneySettings}
            onResetJourneySettings={onResetJourneySettings}
            onOpenModels={onOpenModels}
          />}
          {location.section === "assistant" && <AssistantSettingsHub
            view={subview}
            proactiveSettings={proactiveSettings}
            onChangeProactiveSettings={onChangeProactiveSettings}
            onObserveProactive={onObserveProactive}
            onResetProactiveHistory={onResetProactiveHistory}
            proactiveHistoryCount={proactiveHistoryCount}
            bridge={bridge}
            sessionTools={sessionTools}
            onSessionToolsChange={onSessionToolsChange}
          />}
          {location.section === "models" && <ModelSettingsModal bridge={bridge} open embedded onClose={() => undefined} onSaved={onModelSaved} executionPreferences={executionPreferences} />}
          {location.section === "plugins" && <PluginsSettingsPanel bridge={bridge} workspace={workspace} onPluginsChanged={onPluginsChanged} disabledCoreModules={disabledCoreModules} onCoreModuleEnabled={onCoreModuleEnabled} />}
          {location.section === "workspace" && <WorkspaceSettingsHub
            view={subview}
            workspace={workspace}
            workspaceReady={workspaceReady}
            agentBusy={agentBusy}
            onChooseWorkspace={onChooseWorkspace}
            bridge={bridge}
            activeProject={activeProject}
            activeThreadId={activeThreadId}
            onProjectsChanged={onProjectsChanged}
          />}
          {location.section === "web" && <WebSearchSettingsModal bridge={bridge} open embedded onClose={() => undefined} />}
          {location.section === "ssh" && <SshServersPanel bridge={bridge} />}
        </div>
      </div>
    </div>
  </Dialog>;
}
