import { FolderOpen, Globe2, Info, Languages, Monitor, Moon, Orbit, Palette, SlidersHorizontal, SquareTerminal, Sun, Type, X } from "lucide-react";
import ModelSettingsModal from "./ModelSettingsModal";
import TerminalSettingsModal from "./TerminalSettingsModal";
import WebSearchSettingsModal from "./WebSearchSettingsModal";
import { useUISettings, type Language, type TextSize } from "./i18n";
import { useDialogFocus } from "./useDialogFocus";

export type SettingsSection = "general" | "appearance" | "models" | "web" | "terminal" | "workspace" | "about";

type SettingsModalProps = {
  open: boolean;
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  onClose: () => void;
  themePreference: "charcoal" | "system" | "paper";
  systemAppearance: "charcoal" | "paper";
  onThemePreferenceChange: (preference: "charcoal" | "system" | "paper") => void;
  bridge: ResearchDeskBridge;
  onModelSaved: (config: PublicModelConfig) => void;
  workspace: string;
  workspaceReady: boolean;
  agentBusy: boolean;
  onChooseWorkspace: () => void;
  terminalSettings: TerminalSettings | null;
  onSaveTerminalSettings: (patch: Partial<TerminalSettings>) => Promise<void>;
  onOpenExternalTerminal: (terminal: TerminalExternalTerminal) => Promise<void>;
};

const sections: Array<{ id: SettingsSection; label: string; icon: React.ReactNode }> = [
  { id: "general", label: "General", icon: <SlidersHorizontal size={15} /> },
  { id: "appearance", label: "Appearance", icon: <Palette size={15} /> },
  { id: "models", label: "Models", icon: <Orbit size={15} /> },
  { id: "web", label: "Web search", icon: <Globe2 size={15} /> },
  { id: "terminal", label: "Terminal", icon: <SquareTerminal size={15} /> },
  { id: "workspace", label: "Workspace", icon: <FolderOpen size={15} /> },
  { id: "about", label: "About", icon: <Info size={15} /> },
];

const textSizes: Array<{ id: TextSize; label: string }> = [
  { id: "small", label: "Small" },
  { id: "default", label: "Default" },
  { id: "large", label: "Large" },
];

export default function SettingsModal({
  open,
  section,
  onSectionChange,
  onClose,
  themePreference,
  systemAppearance,
  onThemePreferenceChange,
  bridge,
  onModelSaved,
  workspace,
  workspaceReady,
  agentBusy,
  onChooseWorkspace,
  terminalSettings,
  onSaveTerminalSettings,
  onOpenExternalTerminal,
}: SettingsModalProps) {
  const { language, setLanguage, textSize, setTextSize, t } = useUISettings();
  const dialogRef = useDialogFocus<HTMLElement>(open, onClose);
  if (!open) return null;

  const workspaceName = workspace ? workspace.split(/[\\/]/).filter(Boolean).at(-1) : "";

  const sectionHeadings: Record<SettingsSection, { title: string; description: string }> = {
    general: { title: t("General"), description: t("Preferences that apply across Archimedes.") },
    appearance: { title: t("Appearance"), description: t("Interface theme") },
    models: { title: t("Models"), description: t("Default model and providers") },
    web: { title: t("Web search"), description: t("Search provider and API keys") },
    terminal: { title: t("Terminal"), description: t("Shell, font, and external terminal") },
    workspace: { title: t("Workspace"), description: t("Current folder and access") },
    about: { title: t("About"), description: t("Version") },
  };
  const heading = sectionHeadings[section];

  return <div className="modal-backdrop settings-backdrop" role="presentation" onMouseDown={onClose}>
    <section ref={dialogRef} tabIndex={-1} className="settings-modal" role="dialog" aria-modal="true" aria-label={t("Settings")} onMouseDown={(event) => event.stopPropagation()}>
      <aside className="settings-sidebar">
        <div className="settings-brand"><SettingsMark /><div><strong>Archimedes</strong><span>{t("Settings")}</span></div></div>
        <nav className="settings-nav" aria-label={t("Settings sections")}>
          {sections.map((item) => <button key={item.id} className={item.id === section ? "settings-nav-item active" : "settings-nav-item"} onClick={() => onSectionChange(item.id)} aria-current={item.id === section ? "page" : undefined}>
            {item.icon}<span>{t(item.label)}</span>
          </button>)}
        </nav>
        <span className="settings-version">Archimedes 0.1.0</span>
      </aside>

      <div className="settings-main">
        <header className="settings-header">
          <div><h2>{heading.title}</h2><p>{heading.description}</p></div>
          <button className="settings-close" onClick={onClose} title={t("Close settings")} aria-label={t("Close settings")}><X size={16} /></button>
        </header>

        <div className={section === "models" || section === "web" || section === "terminal" ? "settings-body settings-body-embedded" : "settings-body"}>
          {section === "general" && <div className="settings-sections">
            <section className="settings-card">
              <div className="settings-card-heading"><Languages size={15} /><div><strong>{t("Language")}</strong><p>{t("Choose the language for the Archimedes interface.")}</p></div></div>
              <label className="settings-field">
                <span>{t("Language")}</span>
                <select value={language} onChange={(event) => setLanguage(event.target.value as Language)}>
                  <option value="en">English</option>
                  <option value="zh">简体中文</option>
                </select>
              </label>
            </section>

            <section className="settings-card">
              <div className="settings-card-heading"><Type size={15} /><div><strong>{t("Text size")}</strong><p>{t("Text size scales the whole interface for easier reading.")}</p></div></div>
              <div className="settings-segmented" role="group" aria-label={t("Text size")}>
                {textSizes.map((item) => <button key={item.id} className={textSize === item.id ? "active" : ""} aria-pressed={textSize === item.id} onClick={() => setTextSize(item.id)}>{t(item.label)}</button>)}
              </div>
            </section>
          </div>}

          {section === "appearance" && <div className="settings-sections">
            <section className="settings-card">
              <div className="settings-card-heading"><Palette size={15} /><div><strong>{t("Interface theme")}</strong><p>{t("Theme")}</p></div></div>
              <div className="settings-theme-grid" role="group" aria-label={t("Theme")}>
                <button className={themePreference === "charcoal" ? "settings-theme-option active" : "settings-theme-option"} onClick={() => onThemePreferenceChange("charcoal")} aria-pressed={themePreference === "charcoal"}>
                  <Moon size={16} /><strong>{t("Charcoal")}</strong><small>{t("Dark")}</small>
                </button>
                <button className={themePreference === "system" ? "settings-theme-option active" : "settings-theme-option"} onClick={() => onThemePreferenceChange("system")} aria-pressed={themePreference === "system"}>
                  <Monitor size={16} /><strong>{t("System")}</strong><small>{systemAppearance === "charcoal" ? t("Dark") : t("Light")}</small>
                </button>
                <button className={themePreference === "paper" ? "settings-theme-option active" : "settings-theme-option"} onClick={() => onThemePreferenceChange("paper")} aria-pressed={themePreference === "paper"}>
                  <Sun size={16} /><strong>{t("Paper")}</strong><small>{t("Light")}</small>
                </button>
              </div>
            </section>
          </div>}

          {section === "models" && <ModelSettingsModal bridge={bridge} open embedded onClose={() => undefined} onSaved={onModelSaved} />}
          {section === "web" && <WebSearchSettingsModal bridge={bridge} open embedded onClose={() => undefined} />}
          {section === "terminal" && (terminalSettings
            ? <TerminalSettingsModal open embedded mode="settings" settings={terminalSettings} workspace={workspace} onClose={() => undefined} onSave={onSaveTerminalSettings} onOpenExternal={onOpenExternalTerminal} />
            : <div className="settings-empty">{t("Loading terminal settings…")}</div>)}

          {section === "workspace" && <div className="settings-sections">
            <section className="settings-card">
              <div className="settings-card-heading"><FolderOpen size={15} /><div><strong>{t("Current workspace")}</strong><p>{workspaceName || t("Opening workspace")}</p></div></div>
              <code className="settings-workspace-path">{workspace || "—"}</code>
              <p className="settings-note">{workspaceReady ? t("Workspace connected") : t("Opening workspace")}</p>
              <div className="settings-actions"><button className="primary-button" onClick={onChooseWorkspace} disabled={agentBusy}><FolderOpen size={14} />{t("Change folder")}</button></div>
            </section>
          </div>}

          {section === "about" && <div className="settings-sections">
            <section className="settings-card settings-about">
              <SettingsMark large />
              <div><strong>Archimedes</strong><p>{t("Local-first AI for research.")}</p></div>
              <dl><dt>{t("Version")}</dt><dd>0.1.0</dd></dl>
            </section>
          </div>}
        </div>
      </div>
    </section>
  </div>;
}

function SettingsMark({ large = false }: { large?: boolean }) {
  return <span className={large ? "settings-mark large" : "settings-mark"} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3v3M12 18v3M4.2 7.5l2.6 1.5M17.2 15l2.6 1.5M4.2 16.5l2.6-1.5M17.2 9l2.6-1.5" /><circle cx="12" cy="12" r="3.4" /></svg></span>;
}
