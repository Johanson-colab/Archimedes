import { Code2, FolderOpen, Globe2, Info, Languages, LayoutPanelTop, MessageSquareText, Monitor, Moon, Orbit, Palette, Route, SlidersHorizontal, Sparkles, SquareTerminal, Sun, Type, X } from "lucide-react";
import JourneySettingsPanel from "./JourneySettingsPanel";
import ProactiveSettingsPanel from "./ProactiveSettingsPanel";
import type { ProactiveSettings } from "./proactive-types";
import ModelSettingsModal from "./ModelSettingsModal";
import TerminalSettingsModal from "./TerminalSettingsModal";
import WebSearchSettingsModal from "./WebSearchSettingsModal";
import WorkbenchSettingsPanel from "./WorkbenchSettingsPanel";
import type { WorkbenchTabPreferences } from "./workbench-tabs";
import { useUISettings, type ChatVerbosity, type InterfaceFont, type Language, type MonoFont, type TextSize } from "./i18n";
import { ACCENT_DEFAULT, CONTROL_RADIUS_DEFAULT, CONTROL_RADIUS_MAX, CONTROL_RADIUS_MIN, DENSITY_DEFAULT, SURFACE_DEFAULT, SURFACE_DEPTH_DEFAULT, SURFACE_DEPTH_MAX, SURFACE_DEPTH_MIN, normalizeAppearance, type AppearanceSettings, type AppTheme, type Density, type ThemePreset } from "./appearance";
import { useDialogFocus } from "./useDialogFocus";

export type SettingsSection = "general" | "journey" | "proactive" | "appearance" | "workbench" | "models" | "web" | "terminal" | "workspace" | "about";

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
};

const sections: Array<{ id: SettingsSection; label: string; icon: React.ReactNode }> = [
  { id: "general", label: "General", icon: <SlidersHorizontal size={15} /> },
  { id: "journey", label: "Journey", icon: <Route size={15} /> },
  { id: "proactive", label: "Proactive agent", icon: <Sparkles size={15} /> },
  { id: "appearance", label: "Appearance", icon: <Palette size={15} /> },
  { id: "workbench", label: "Workbench", icon: <LayoutPanelTop size={15} /> },
  { id: "models", label: "Models", icon: <Orbit size={15} /> },
  { id: "web", label: "Web search", icon: <Globe2 size={15} /> },
  { id: "terminal", label: "Terminal", icon: <SquareTerminal size={15} /> },
  { id: "workspace", label: "Workspace", icon: <FolderOpen size={15} /> },
  { id: "about", label: "About", icon: <Info size={15} /> },
];

const textSizeSteps: Array<{ id: TextSize; label: string; scale: number }> = [
  { id: "smaller", label: "Smaller", scale: 1 },
  { id: "small", label: "Small", scale: 1.05 },
  { id: "default", label: "Default", scale: 1.1 },
  { id: "large", label: "Large", scale: 1.15 },
  { id: "larger", label: "Larger", scale: 1.2 },
];

const verbosityOptions: Array<{ id: ChatVerbosity; label: string; description: string }> = [
  { id: "low", label: "Low", description: "Summary only" },
  { id: "medium", label: "Medium", description: "Grouped steps" },
  { id: "high", label: "High", description: "Full detail" },
];

export default function SettingsModal({
  open,
  section,
  onSectionChange,
  onClose,
  themePreference,
  theme,
  systemAppearance,
  onThemePreferenceChange,
  appearance,
  onAppearanceChange,
  bridge,
  onModelSaved,
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
}: SettingsModalProps) {
  const { language, setLanguage, textSize, setTextSize, interfaceFont, setInterfaceFont, monoFont, setMonoFont, fileIconStyle, setFileIconStyle, chatVerbosity, setChatVerbosity, t } = useUISettings();
  const dialogRef = useDialogFocus<HTMLElement>(open, onClose);
  if (!open) return null;

  const workspaceName = workspace ? workspace.split(/[\\/]/).filter(Boolean).at(-1) : "";
  const embedded = section === "models";
  const sizeIndex = Math.max(0, textSizeSteps.findIndex((item) => item.id === textSize));
  const activeSize = textSizeSteps[sizeIndex] ?? textSizeSteps[2];
  const activeVerbosity = verbosityOptions.find((item) => item.id === chatVerbosity) ?? verbosityOptions[1];
  const accentValue = appearance.overrides.accent ?? ACCENT_DEFAULT[theme];
  const surfaceValue = appearance.overrides.surface ?? SURFACE_DEFAULT[theme];
  const surfaceDepthValue = appearance.overrides.surfaceDepth ?? SURFACE_DEPTH_DEFAULT;
  const radiusValue = appearance.overrides.controlRadius ?? CONTROL_RADIUS_DEFAULT;
  const densityValue: Density = appearance.overrides.density ?? DENSITY_DEFAULT;
  const hasOverrides = Boolean(appearance.overrides.accent) || Boolean(appearance.overrides.surface)
    || appearance.overrides.surfaceDepth !== undefined || appearance.overrides.controlRadius !== undefined
    || appearance.overrides.density !== undefined;
  function updateOverride(patch: Partial<AppearanceSettings["overrides"]>) {
    onAppearanceChange(normalizeAppearance({ ...appearance, overrides: { ...appearance.overrides, ...patch } }));
  }
  function clearOverride(key: "accent" | "surface" | "surfaceDepth" | "controlRadius" | "density") {
    const overrides = { ...appearance.overrides };
    delete overrides[key];
    onAppearanceChange(normalizeAppearance({ ...appearance, overrides }));
  }

  const sectionHeadings: Record<SettingsSection, { title: string; description: string }> = {
    general: { title: t("General"), description: t("Preferences that apply across Archimedes.") },
    journey: { title: t("Journey"), description: t("How the AI summarizes long runs and when the map appears.") },
    proactive: { title: t("Proactive agent"), description: t("Opt-in L0 signals, evidence, and interruption limits.") },
    appearance: { title: t("Appearance"), description: t("Theme and fonts") },
    workbench: { title: t("Workbench"), description: t("Choose the tabs that appear in the right rail.") },
    models: { title: t("Models"), description: t("Default model and providers") },
    web: { title: t("Web search"), description: t("Search provider and API keys") },
    terminal: { title: t("Terminal"), description: t("Shell, font, and external terminal") },
    workspace: { title: t("Workspace"), description: t("Current folder and access") },
    about: { title: t("About"), description: t("Build information") },
  };
  const heading = sectionHeadings[section];

  return <div className="modal-backdrop settings-backdrop" role="presentation" onMouseDown={onClose}>
    <section ref={dialogRef} tabIndex={-1} className="settings-modal" role="dialog" aria-modal="true" aria-label={t("Settings")} onMouseDown={(event) => event.stopPropagation()}>
      <aside className="settings-sidebar">
        <div className="settings-brand"><div><strong>Archimedes</strong><span>{t("Settings")}</span></div></div>
        <nav className="settings-nav" aria-label={t("Settings sections")}>
          {sections.map((item) => <button key={item.id} className={item.id === section ? "settings-nav-item active" : "settings-nav-item"} onClick={() => onSectionChange(item.id)} aria-current={item.id === section ? "page" : undefined}>
            {item.icon}<span>{t(item.label)}</span>
          </button>)}
        </nav>
        <span className="settings-version">Archimedes 0.1.0</span>
      </aside>

      <div className="settings-main">
        <header className="settings-header">
          <div className="settings-header-copy"><h2>{heading.title}</h2><p>{heading.description}</p></div>
          <button className="settings-close" onClick={onClose} title={t("Close settings")} aria-label={t("Close settings")}><X size={16} /></button>
        </header>

        <div className={embedded ? "settings-body settings-body-embedded" : "settings-body"}>
          <div className="settings-content">
            {section === "general" && <div className="settings-sections">
              <section className="settings-section">
                <h3 className="settings-section-title">{t("Interface")}</h3>
                <div className="settings-group">
                  <div className="settings-row">
                    <div className="settings-row-copy">
                      <span className="settings-row-title">{t("Language")}</span>
                      <p className="settings-row-description">{t("Choose the language for the Archimedes interface.")}</p>
                    </div>
                    <div className="settings-row-control">
                      <select className="settings-select" value={language} onChange={(event) => setLanguage(event.target.value as Language)} aria-label={t("Language")}>
                        <option value="en">English</option>
                        <option value="zh">简体中文</option>
                      </select>
                    </div>
                  </div>

                  <div className="settings-row settings-row-stacked">
                    <div className="settings-row-copy">
                      <span className="settings-row-title">{t("Text size")}</span>
                      <p className="settings-row-description">{t("Text size scales the whole interface for easier reading.")}</p>
                    </div>
                    <div className="settings-row-control">
                      <div className="settings-slider">
                        <div className="settings-slider-head">
                          <span className="settings-slider-label">{t(activeSize.label)}</span>
                          <span className="settings-slider-value">{Math.round(activeSize.scale * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={textSizeSteps.length - 1}
                          step={1}
                          value={sizeIndex}
                          aria-label={t("Text size")}
                          aria-valuetext={`${t(activeSize.label)} · ${Math.round(activeSize.scale * 100)}%`}
                          style={{ "--settings-slider-progress": `${(sizeIndex / (textSizeSteps.length - 1)) * 100}%` } as React.CSSProperties}
                          onChange={(event) => setTextSize(textSizeSteps[Number(event.target.value)]?.id ?? "default")}
                        />
                        <div className="settings-slider-scale">
                          {textSizeSteps.map((item) => <button key={item.id} type="button" className={textSize === item.id ? "active" : ""} aria-pressed={textSize === item.id} onClick={() => setTextSize(item.id)}>{t(item.label)}</button>)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="settings-section">
                <h3 className="settings-section-title">{t("Conversation")}</h3>
                <div className="settings-group">
                  <div className="settings-row">
                    <div className="settings-row-copy">
                      <span className="settings-row-title">{t("Chat verbosity")}</span>
                      <p className="settings-row-description">{t("Controls how much agent activity appears inline in chat.")}</p>
                      <span className="settings-row-hint">{t(activeVerbosity.description)}</span>
                    </div>
                    <div className="settings-row-control">
                      <div className="settings-choice" role="group" aria-label={t("Chat verbosity")}>
                        {verbosityOptions.map((item) => <button key={item.id} className={chatVerbosity === item.id ? "active" : ""} aria-pressed={chatVerbosity === item.id} onClick={() => setChatVerbosity(item.id)}>{t(item.label)}</button>)}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </div>}

            {section === "journey" && <JourneySettingsPanel
            settings={journeySettings}
            onChange={onSaveJourneySettings}
            onReset={onResetJourneySettings}
            onOpenModels={onOpenModels}
          />}

          {section === "proactive" && <ProactiveSettingsPanel
            settings={proactiveSettings}
            onChange={onChangeProactiveSettings}
            onObserveOnce={onObserveProactive}
            onResetHistory={onResetProactiveHistory}
            historyCount={proactiveHistoryCount}
            canObserve={proactiveSettings.mode !== "off"}
          />}

          {section === "appearance" && <div className="settings-sections">
              <section className="settings-section">
                <h3 className="settings-section-title">{t("Theme")}</h3>
                <div className="settings-group">
                  <div className="settings-row">
                    <div className="settings-row-copy">
                      <span className="settings-row-title">{t("Interface theme")}</span>
                      <p className="settings-row-description">{t("Choose how Archimedes looks. System follows the operating system.")}</p>
                    </div>
                    <div className="settings-row-control">
                      <div className="settings-choice" role="group" aria-label={t("Theme")}>
                        <button className={themePreference === "charcoal" ? "active" : ""} onClick={() => onThemePreferenceChange("charcoal")} aria-pressed={themePreference === "charcoal"}><Moon size={13} />{t("Charcoal")}</button>
                        <button className={themePreference === "system" ? "active" : ""} onClick={() => onThemePreferenceChange("system")} aria-pressed={themePreference === "system"}><Monitor size={13} />{t("System")}</button>
                        <button className={themePreference === "paper" ? "active" : ""} onClick={() => onThemePreferenceChange("paper")} aria-pressed={themePreference === "paper"}><Sun size={13} />{t("Paper")}</button>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="settings-section">
                <h3 className="settings-section-title">{t("Customize")}</h3>
                <div className="settings-group settings-appearance-group">
                  <div className="settings-row">
                    <div className="settings-row-copy">
                      <span className="settings-row-title">{t("Accent color")}</span>
                      <p className="settings-row-description">{t("Used for primary actions, focus rings, and highlights.")}</p>
                    </div>
                    <div className="settings-row-control settings-appearance-control">
                      <input className="settings-color-input" type="color" value={accentValue} aria-label={t("Accent color")} onChange={(event) => updateOverride({ accent: event.target.value })} />
                      <code className="settings-value">{accentValue}</code>
                      <button className="secondary-button" onClick={() => clearOverride("accent")} disabled={!appearance.overrides.accent}>{t("Reset")}</button>
                    </div>
                  </div>
                  <div className="settings-row">
                    <div className="settings-row-copy">
                      <span className="settings-row-title">{t("Surface color")}</span>
                      <p className="settings-row-description">{t("Derives the ground, panel, borders, and readable text for the whole shell.")}</p>
                    </div>
                    <div className="settings-row-control settings-appearance-control">
                      <input className="settings-color-input" type="color" value={surfaceValue} aria-label={t("Surface color")} onChange={(event) => updateOverride({ surface: event.target.value })} />
                      <code className="settings-value">{surfaceValue}</code>
                      <button className="secondary-button" onClick={() => clearOverride("surface")} disabled={!appearance.overrides.surface}>{t("Reset")}</button>
                    </div>
                  </div>
                  <div className="settings-row">
                    <div className="settings-row-copy">
                      <span className="settings-row-title">{t("Surface depth")}</span>
                      <p className="settings-row-description">{t("How far panels and borders step away from the base surface.")}</p>
                    </div>
                    <div className="settings-row-control settings-appearance-control">
                      <input className="settings-range-input" type="range" min={SURFACE_DEPTH_MIN} max={SURFACE_DEPTH_MAX} step={1} value={surfaceDepthValue} disabled={!appearance.overrides.surface} aria-label={t("Surface depth")} onChange={(event) => updateOverride({ surfaceDepth: Number(event.target.value) })} />
                      <code className="settings-value">{surfaceDepthValue}</code>
                      <button className="secondary-button" onClick={() => clearOverride("surfaceDepth")} disabled={appearance.overrides.surfaceDepth === undefined}>{t("Reset")}</button>
                    </div>
                  </div>
                  <div className="settings-row">
                    <div className="settings-row-copy">
                      <span className="settings-row-title">{t("Density")}</span>
                      <p className="settings-row-description">{t("Spacing for controls, settings rows, and navigation.")}</p>
                    </div>
                    <div className="settings-row-control">
                      <div className="settings-choice" role="group" aria-label={t("Density")}>
                        {([["compact", "Compact"], ["comfortable", "Comfortable"], ["spacious", "Spacious"]] as Array<[Density, string]>).map(([id, label]) => <button key={id} className={densityValue === id ? "active" : ""} aria-pressed={densityValue === id} onClick={() => updateOverride({ density: id })}>{t(label)}</button>)}
                      </div>
                    </div>
                  </div>
                  <div className="settings-row">
                    <div className="settings-row-copy">
                      <span className="settings-row-title">{t("Control radius")}</span>
                      <p className="settings-row-description">{t("Corner radius for buttons, inputs, and controls.")}</p>
                    </div>
                    <div className="settings-row-control settings-appearance-control">
                      <input className="settings-range-input" type="range" min={CONTROL_RADIUS_MIN} max={CONTROL_RADIUS_MAX} step={1} value={radiusValue} aria-label={t("Control radius")} onChange={(event) => updateOverride({ controlRadius: Number(event.target.value) })} />
                      <code className="settings-value">{radiusValue}px</code>
                      <button className="secondary-button" onClick={() => clearOverride("controlRadius")} disabled={appearance.overrides.controlRadius === undefined}>{t("Reset")}</button>
                    </div>
                  </div>
                  <div className="settings-row">
                    <div className="settings-row-copy">
                      <span className="settings-row-title">{t("Custom theme")}</span>
                      <p className="settings-row-description">{t("Accent, surface, density, and radius apply to both Charcoal and Paper.")}</p>
                    </div>
                    <div className="settings-row-control">
                      <button className="secondary-button" onClick={() => onAppearanceChange(normalizeAppearance({ version: 1, preset: appearance.preset }))} disabled={!hasOverrides}>{t("Reset custom theme")}</button>
                    </div>
                  </div>
                </div>
              </section>

              <section className="settings-section">
                <h3 className="settings-section-title">{t("Fonts")}</h3>
                <div className="settings-group">
                  <div className="settings-row">
                    <div className="settings-row-copy">
                      <span className="settings-row-title">{t("Interface font")}</span>
                      <p className="settings-row-description">{t("Used for conversation, navigation, and interface text.")}</p>
                    </div>
                    <div className="settings-row-control">
                      <select className="settings-select" value={interfaceFont} onChange={(event) => setInterfaceFont(event.target.value as InterfaceFont)} aria-label={t("Interface font")}>
                        <option value="geist">{t("Geist Sans")}</option>
                        <option value="system">{t("System")}</option>
                      </select>
                    </div>
                  </div>
                  <div className="settings-row">
                    <div className="settings-row-copy">
                      <span className="settings-row-title"><Code2 size={13} />{t("Code font")}</span>
                      <p className="settings-row-description">{t("Used for code, terminal output, and trajectory detail.")}</p>
                    </div>
                    <div className="settings-row-control">
                      <select className="settings-select" value={monoFont} onChange={(event) => setMonoFont(event.target.value as MonoFont)} aria-label={t("Code font")}>
                        <option value="geist-mono">{t("Geist Mono")}</option>
                        <option value="system">{t("System mono")}</option>
                      </select>
                    </div>
                  </div>
                </div>
              </section>

              <section className="settings-section">
                <h3 className="settings-section-title">{t("Files")}</h3>
                <div className="settings-group">
                  <div className="settings-row">
                    <div className="settings-row-copy">
                      <span className="settings-row-title">{t("File icons")}</span>
                      <p className="settings-row-description">{t("Choose the icon palette for file trees.")}</p>
                    </div>
                    <div className="settings-row-control">
                      <div className="settings-choice file-icon-choice" role="group" aria-label={t("File icons")}>
                        <button className={fileIconStyle === "city-lights" ? "active" : ""} aria-pressed={fileIconStyle === "city-lights"} onClick={() => setFileIconStyle("city-lights")}>{t("City Lights")}</button>
                        <button className={fileIconStyle === "material" ? "active" : ""} aria-pressed={fileIconStyle === "material"} onClick={() => setFileIconStyle("material")}>{t("Material")}</button>
                        <button className={fileIconStyle === "seti" ? "active" : ""} aria-pressed={fileIconStyle === "seti"} onClick={() => setFileIconStyle("seti")}>{t("Seti")}</button>
                        <button className={fileIconStyle === "monochrome" ? "active" : ""} aria-pressed={fileIconStyle === "monochrome"} onClick={() => setFileIconStyle("monochrome")}>{t("Monochrome")}</button>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </div>}

            {section === "workbench" && <WorkbenchSettingsPanel preferences={workbenchPreferences} onChange={onChangeWorkbenchPreferences} onReset={onResetWorkbenchPreferences} />}

            {section === "models" && <ModelSettingsModal bridge={bridge} open embedded onClose={() => undefined} onSaved={onModelSaved} />}
            {section === "web" && <WebSearchSettingsModal bridge={bridge} open embedded onClose={() => undefined} />}
            {section === "terminal" && (terminalSettings
              ? <TerminalSettingsModal open embedded mode="settings" settings={terminalSettings} workspace={workspace} onClose={() => undefined} onSave={onSaveTerminalSettings} onOpenExternal={onOpenExternalTerminal} />
              : <div className="settings-empty">{t("Loading terminal settings…")}</div>)}

            {section === "workspace" && <div className="settings-sections">
              <section className="settings-section">
                <h3 className="settings-section-title">{t("Folder")}</h3>
                <div className="settings-group">
                  <div className="settings-row settings-row-stacked">
                    <div className="settings-row-copy">
                      <span className="settings-row-title">{t("Current workspace")}</span>
                      <p className="settings-row-description">{workspaceName || t("Opening workspace")} · {workspaceReady ? t("Workspace connected") : t("Opening workspace")}</p>
                    </div>
                    <div className="settings-row-control settings-workspace-control">
                      <code className="settings-path">{workspace || "—"}</code>
                      <button className="primary-button" onClick={onChooseWorkspace} disabled={agentBusy}><FolderOpen size={14} />{t("Change folder")}</button>
                    </div>
                  </div>
                </div>
              </section>
            </div>}

            {section === "about" && <div className="settings-about">
              <strong>Archimedes</strong>
              <p>{t("Local-first AI for research.")}</p>
              <dl><dt>{t("Version")}</dt><dd>0.1.0</dd></dl>
            </div>}
          </div>
        </div>
      </div>
    </section>
  </div>;
}


