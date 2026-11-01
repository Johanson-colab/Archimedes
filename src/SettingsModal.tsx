import { useRef, useState } from "react";
import { Code2, FolderOpen, Globe2, Info, Languages, LayoutPanelTop, MessageSquareText, Monitor, Moon, Orbit, Palette, Route, SlidersHorizontal, Sparkles, SquareTerminal, Sun, Type, UserRound, Users, X } from "lucide-react";
import JourneySettingsPanel from "./JourneySettingsPanel";
import ProactiveSettingsPanel from "./ProactiveSettingsPanel";
import type { ProactiveSettings } from "./proactive-types";
import ModelSettingsModal from "./ModelSettingsModal";
import TerminalSettingsModal from "./TerminalSettingsModal";
import WebSearchSettingsModal from "./WebSearchSettingsModal";
import WorkbenchSettingsPanel from "./WorkbenchSettingsPanel";
import AccountSettingsPanel from "./AccountSettingsPanel";
import ProjectMembersPanel from "./ProjectMembersPanel";
import type { WorkbenchTabPreferences } from "./workbench-tabs";
import { TEXT_SIZE_SCALE, useUISettings, type ChatVerbosity, type InterfaceFont, type Language, type MonoFont, type TextSize } from "./i18n";
import { ACCENT_DEFAULT, CONTROL_RADIUS_DEFAULT, CONTROL_RADIUS_MAX, CONTROL_RADIUS_MIN, DENSITY_DEFAULT, SURFACE_DEFAULT, SURFACE_DEPTH_DEFAULT, SURFACE_DEPTH_MAX, SURFACE_DEPTH_MIN, contrastIssues, normalizeAppearance, parseThemePack, themePackSettings, toThemePack, type AppearanceSettings, type AppearanceStyles, type AppTheme, type ButtonStyle, type CardStyle, type ContrastIssue, type Density, type DialogStyle, type InputStyle, type MenuStyle, type MotionStyle, type ShadowStyle, type ShapeStyle, type SurfaceAppearance, type SurfaceScope, type SurfaceStyles, type ThemePack, type ThemePreset } from "./appearance";
import { Dialog } from "./Dialog";
import { SettingsChoiceGroup, SettingsRow, SettingsSection as SettingsSectionView } from "./SettingsPrimitives";

export type SettingsSection = "general" | "journey" | "proactive" | "appearance" | "workbench" | "models" | "web" | "terminal" | "workspace" | "about" | "account" | "members";

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
};

const sections: Array<{ id: SettingsSection; label: string; icon: React.ReactNode }> = [
  { id: "general", label: "General", icon: <SlidersHorizontal size={15} /> },
  { id: "account", label: "Account", icon: <UserRound size={15} /> },
  { id: "members", label: "Members", icon: <Users size={15} /> },
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
  { id: "smaller", label: "Smaller", scale: TEXT_SIZE_SCALE.smaller },
  { id: "small", label: "Small", scale: TEXT_SIZE_SCALE.small },
  { id: "default", label: "Default", scale: TEXT_SIZE_SCALE.default },
  { id: "large", label: "Large", scale: TEXT_SIZE_SCALE.large },
  { id: "larger", label: "Larger", scale: TEXT_SIZE_SCALE.larger },
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
}: SettingsModalProps) {
  const { language, setLanguage, textSize, setTextSize, interfaceFont, setInterfaceFont, monoFont, setMonoFont, fileIconStyle, setFileIconStyle, chatVerbosity, setChatVerbosity, t } = useUISettings();
  const [scope, setScope] = useState<SurfaceScope | "global">("global");
  const [pendingPack, setPendingPack] = useState<ThemePack | null>(null);
  const [packWarnings, setPackWarnings] = useState<ContrastIssue[]>([]);
  const [packError, setPackError] = useState("");
  const packInputRef = useRef<HTMLInputElement>(null);
  if (!open) return null;

  const workspaceName = workspace ? workspace.split(/[\\/]/).filter(Boolean).at(-1) : "";
  const embedded = section === "models";
  const sizeIndex = Math.max(0, textSizeSteps.findIndex((item) => item.id === textSize));
  const activeSize = textSizeSteps[sizeIndex] ?? textSizeSteps[2];
  const activeVerbosity = verbosityOptions.find((item) => item.id === chatVerbosity) ?? verbosityOptions[1];
  const scopedAppearance = scope === "global" ? undefined : appearance.surfaces?.[scope];
  const accentValue = scopedAppearance?.accent ?? appearance.overrides.accent ?? ACCENT_DEFAULT[theme];
  const surfaceValue = scopedAppearance?.surface ?? appearance.overrides.surface ?? SURFACE_DEFAULT[theme];
  const surfaceDepthValue = scopedAppearance?.surfaceDepth ?? appearance.overrides.surfaceDepth ?? SURFACE_DEPTH_DEFAULT;
  const hasSurface = Boolean(scopedAppearance?.surface ?? appearance.overrides.surface);
  const accentResetDisabled = scope === "global" ? !appearance.overrides.accent : !scopedAppearance?.accent;
  const surfaceResetDisabled = scope === "global" ? !appearance.overrides.surface : !scopedAppearance?.surface;
  const depthResetDisabled = scope === "global" ? appearance.overrides.surfaceDepth === undefined : scopedAppearance?.surfaceDepth === undefined;
  const radiusValue = appearance.overrides.controlRadius ?? CONTROL_RADIUS_DEFAULT;
  const densityValue: Density = appearance.overrides.density ?? DENSITY_DEFAULT;
  const effectiveStyles = scope === "global"
    ? appearance.styles
    : { ...appearance.styles, ...appearance.surfaces?.[scope]?.styles };
  const buttonStyle: ButtonStyle = effectiveStyles?.button ?? "solid";
  const dialogStyle: DialogStyle = effectiveStyles?.dialog ?? "elevated";
  const shapeStyle: ShapeStyle = effectiveStyles?.shape ?? "soft";
  const shadowStyle: ShadowStyle = effectiveStyles?.shadow ?? "default";
  const motionStyle: MotionStyle = appearance.styles?.motion ?? "full";
  const inputStyle: InputStyle = appearance.styles?.input ?? "default";
  const cardStyle: CardStyle = appearance.styles?.card ?? "default";
  const menuStyle: MenuStyle = appearance.styles?.menu ?? "default";
  const scopeIssues = contrastIssues(appearance, theme).filter((issue) => issue.scope === scope);
  const hasOverrides = Boolean(appearance.overrides.accent) || Boolean(appearance.overrides.surface)
    || appearance.overrides.surfaceDepth !== undefined || appearance.overrides.controlRadius !== undefined
    || appearance.overrides.density !== undefined
    || Boolean(appearance.surfaces && Object.keys(appearance.surfaces).length)
    || Boolean(appearance.styles && Object.keys(appearance.styles).length);

  function updateOverride(patch: SurfaceAppearance) {
    if (scope === "global") {
      onAppearanceChange(normalizeAppearance({ ...appearance, overrides: { ...appearance.overrides, ...patch } }));
      return;
    }
    const surfaces = { ...appearance.surfaces, [scope]: { ...appearance.surfaces?.[scope], ...patch } };
    onAppearanceChange(normalizeAppearance({ ...appearance, surfaces }));
  }
  function updateGlobalOverride(patch: Partial<AppearanceSettings["overrides"]>) {
    onAppearanceChange(normalizeAppearance({ ...appearance, overrides: { ...appearance.overrides, ...patch } }));
  }
  function clearOverride(key: "accent" | "surface" | "surfaceDepth" | "controlRadius" | "density") {
    if (key === "controlRadius" || key === "density" || scope === "global") {
      const overrides = { ...appearance.overrides };
      delete overrides[key];
      onAppearanceChange(normalizeAppearance({ ...appearance, overrides }));
      return;
    }
    const surfaces = { ...appearance.surfaces };
    const scoped = { ...surfaces[scope] };
    delete scoped[key];
    if (Object.keys(scoped).length) surfaces[scope] = scoped;
    else delete surfaces[scope];
    onAppearanceChange(normalizeAppearance({ ...appearance, surfaces }));
  }
  function updateGlobalStyles(patch: AppearanceStyles) {
    onAppearanceChange(normalizeAppearance({ ...appearance, styles: { ...appearance.styles, ...patch } }));
  }
  function updateStyles(patch: SurfaceStyles) {
    if (scope === "global") {
      updateGlobalStyles(patch);
      return;
    }
    const surfaces = {
      ...appearance.surfaces,
      [scope]: {
        ...appearance.surfaces?.[scope],
        styles: { ...appearance.surfaces?.[scope]?.styles, ...patch },
      },
    };
    onAppearanceChange(normalizeAppearance({ ...appearance, surfaces }));
  }
  function clearScope() {
    if (scope === "global") return;
    const surfaces = { ...appearance.surfaces };
    delete surfaces[scope];
    onAppearanceChange(normalizeAppearance({ ...appearance, surfaces }));
  }
  function exportPack() {
    const pack = toThemePack(appearance, appearance.preset === "system" ? "Archimedes theme" : `${appearance.preset} theme`);
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${pack.id}.archtheme.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
  async function importPack(file: File | undefined) {
    if (!file) return;
    try {
      const pack = parseThemePack(JSON.parse(await file.text()));
      setPendingPack(pack);
      setPackWarnings(contrastIssues(themePackSettings(pack), theme));
      setPackError("");
    } catch (error) {
      setPendingPack(null);
      setPackWarnings([]);
      setPackError(error instanceof Error ? error.message : "Could not read the theme pack.");
    }
  }
  function applyPack() {
    if (!pendingPack) return;
    onAppearanceChange(themePackSettings(pendingPack));
    setPendingPack(null);
    setPackWarnings([]);
  }

  const sectionHeadings: Record<SettingsSection, { title: string; description: string }> = {
    general: { title: t("General"), description: t("Preferences that apply across Archimedes.") },
    account: { title: t("Account"), description: t("Local identity and device") },
    members: { title: t("Project members"), description: t("Roles, access, and project activity") },
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

  return <Dialog open={open} onClose={onClose} size="settings" className="settings-modal" overlayClassName="modal-backdrop settings-backdrop" ariaLabel={t("Settings")}>
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
            {section === "account" && <AccountSettingsPanel identity={identity} onSave={onSaveIdentity} authState={authState} onOpenAuth={onOpenAuth} onSignOut={onSignOut} />}
            {section === "members" && (activeProject ? <ProjectMembersPanel bridge={bridge} project={activeProject} activeThreadId={activeThreadId} onProjectsChanged={onProjectsChanged} /> : <div className="project-members-empty">{t("Select a project to manage members.")}</div>)}

            {section === "general" && <div className="settings-sections">
              <SettingsSectionView title={t("Interface")}>
                <div className="settings-group">
                  <SettingsRow
                    title={<>{t("Language")}</>}
                    description={<>{t("Choose the language for the Archimedes interface.")}</>}
                  >
                      <select className="settings-select" value={language} onChange={(event) => setLanguage(event.target.value as Language)} aria-label={t("Language")}>
                        <option value="en">English</option>
                        <option value="zh">简体中文</option>
                      </select>

                  </SettingsRow>

                  <SettingsRow
                    stacked
                    title={<>{t("Text size")}</>}
                    description={<>{t("Text size scales the whole interface for easier reading.")}</>}
                  >
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

                  </SettingsRow>
                </div>
                            </SettingsSectionView>

              <SettingsSectionView title={t("Conversation")}>
                <div className="settings-group">
                  <SettingsRow
                    title={<>{t("Chat verbosity")}</>}
                    description={<>{t("Controls how much agent activity appears inline in chat.")}</>}
                    hint={<>{t(activeVerbosity.description)}</>}
                  >
                      <SettingsChoiceGroup
                        value={chatVerbosity}
                        label={t("Chat verbosity")}
                        options={verbosityOptions.map((item) => ({ value: item.id, label: t(item.label) }))}
                        onChange={setChatVerbosity}
                      />

                  </SettingsRow>
                </div>
                            </SettingsSectionView>
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
            bridge={bridge}
            historyCount={proactiveHistoryCount}
            canObserve={proactiveSettings.mode !== "off"}
          />}

          {section === "appearance" && <div className="settings-sections">
              <SettingsSectionView title={t("Theme")}>
                <div className="settings-group">
                  <SettingsRow
                    title={<>{t("Interface theme")}</>}
                    description={<>{t("Choose how Archimedes looks. System follows the operating system.")}</>}
                  >
                      <SettingsChoiceGroup
                        value={themePreference}
                        label={t("Theme")}
                        options={[
                          { value: "charcoal", label: t("Charcoal"), icon: <Moon size={13} /> },
                          { value: "system", label: t("System"), icon: <Monitor size={13} /> },
                          { value: "paper", label: t("Paper"), icon: <Sun size={13} /> },
                        ]}
                        onChange={onThemePreferenceChange}
                      />

                  </SettingsRow>
                </div>
                            </SettingsSectionView>

              <SettingsSectionView title={t("Customize")}>
                <div className="settings-group settings-appearance-group">
                  <SettingsRow
                    controlClassName="settings-appearance-control"
                    title={<>{t("Apply to")}</>}
                    description={<>{t("Button, dialog, shape, and shadow can be scoped; density, radius, motion, input, card, and menu stay global.")}</>}
                  >
                      <SettingsChoiceGroup
                        value={scope}
                        label={t("Apply to")}
                        options={([["global", "Global"], ["reader", "Reader"], ["writing", "Writing"], ["agent", "Agent"]] as Array<[SurfaceScope | "global", string]>).map(([id, label]) => ({ value: id, label: t(label) }))}
                        onChange={setScope}
                      />
                      {scope !== "global" && <button className="secondary-button" onClick={clearScope} disabled={!appearance.surfaces?.[scope]}>{t("Reset this surface")}</button>}

                  </SettingsRow>
                  {scopeIssues.length > 0 && <div className="settings-contrast-warning" role="status">
                    <strong>{t("Contrast warning")}</strong>
                    <span>{scopeIssues[0].pair} · {scopeIssues[0].ratio.toFixed(1)}:1 / {scopeIssues[0].minimum}:1{scopeIssues.length > 1 ? ` · +${scopeIssues.length - 1}` : ""}</span>
                  </div>}
                  <SettingsRow
                    controlClassName="settings-appearance-control"
                    title={<>{t("Accent color")}</>}
                    description={<>{t("Used for primary actions, focus rings, and highlights.")}</>}
                  >
                      <input className="settings-color-input" type="color" value={accentValue} aria-label={t("Accent color")} onChange={(event) => updateOverride({ accent: event.target.value })} />
                      <code className="settings-value">{accentValue}</code>
                      <button className="secondary-button" onClick={() => clearOverride("accent")} disabled={accentResetDisabled}>{t("Reset")}</button>

                  </SettingsRow>
                  <SettingsRow
                    controlClassName="settings-appearance-control"
                    title={<>{t("Surface color")}</>}
                    description={<>{t("Derives the ground, panel, borders, and readable text for the whole shell.")}</>}
                  >
                      <input className="settings-color-input" type="color" value={surfaceValue} aria-label={t("Surface color")} onChange={(event) => updateOverride({ surface: event.target.value })} />
                      <code className="settings-value">{surfaceValue}</code>
                      <button className="secondary-button" onClick={() => clearOverride("surface")} disabled={surfaceResetDisabled}>{t("Reset")}</button>

                  </SettingsRow>
                  <SettingsRow
                    controlClassName="settings-appearance-control"
                    title={<>{t("Surface depth")}</>}
                    description={<>{t("How far panels and borders step away from the base surface.")}</>}
                  >
                      <input className="settings-range-input" type="range" min={SURFACE_DEPTH_MIN} max={SURFACE_DEPTH_MAX} step={1} value={surfaceDepthValue} disabled={!hasSurface} aria-label={t("Surface depth")} onChange={(event) => updateOverride({ surfaceDepth: Number(event.target.value) })} />
                      <code className="settings-value">{surfaceDepthValue}</code>
                      <button className="secondary-button" onClick={() => clearOverride("surfaceDepth")} disabled={depthResetDisabled}>{t("Reset")}</button>

                  </SettingsRow>
                  <SettingsRow
                    title={<>{t("Density")}</>}
                    description={<>{t("Spacing for controls, settings rows, and navigation.")}</>}
                  >
                      <SettingsChoiceGroup
                        value={densityValue}
                        label={t("Density")}
                        options={([["compact", "Compact"], ["comfortable", "Comfortable"], ["spacious", "Spacious"]] as Array<[Density, string]>).map(([id, label]) => ({ value: id, label: t(label) }))}
                        onChange={(density) => updateGlobalOverride({ density })}
                      />

                  </SettingsRow>
                  <SettingsRow
                    controlClassName="settings-appearance-control"
                    title={<>{t("Control radius")}</>}
                    description={<>{t("Corner radius for buttons, inputs, and controls.")}</>}
                  >
                      <input className="settings-range-input" type="range" min={CONTROL_RADIUS_MIN} max={CONTROL_RADIUS_MAX} step={1} value={radiusValue} aria-label={t("Control radius")} onChange={(event) => updateGlobalOverride({ controlRadius: Number(event.target.value) })} />
                      <code className="settings-value">{radiusValue}px</code>
                      <button className="secondary-button" onClick={() => clearOverride("controlRadius")} disabled={appearance.overrides.controlRadius === undefined}>{t("Reset")}</button>

                  </SettingsRow>
                  <SettingsRow
                    title={<>{t("Custom theme")}</>}
                    description={<>{t("Accent, surface, density, and radius apply to both Charcoal and Paper.")}</>}
                  >
                      <button className="secondary-button" onClick={() => onAppearanceChange(normalizeAppearance({ version: 1, preset: appearance.preset }))} disabled={!hasOverrides}>{t("Reset custom theme")}</button>

                  </SettingsRow>
                </div>
                            </SettingsSectionView>

              <SettingsSectionView title={t("Style")}>
                <div className="settings-group settings-appearance-group">
                  <SettingsRow
                    title={<>{t("Button style")}</>}
                    description={<>{t("Fill, border, and hover treatment for primary and secondary buttons.")}</>}
                  >
                      <SettingsChoiceGroup
                        value={buttonStyle}
                        label={t("Button style")}
                        options={([["solid", "Solid"], ["soft", "Soft"], ["outline", "Outline style"], ["ghost", "Ghost"]] as Array<[ButtonStyle, string]>).map(([id, label]) => ({ value: id, label: t(label) }))}
                        onChange={(button) => updateStyles({ button })}
                      />

                  </SettingsRow>
                  <SettingsRow
                    title={<>{t("Dialog style")}</>}
                    description={<>{t("Elevation and surface treatment for dialogs and menus.")}</>}
                  >
                      <SettingsChoiceGroup
                        value={dialogStyle}
                        label={t("Dialog style")}
                        options={([["elevated", "Elevated"], ["flat", "Flat"], ["outlined", "Outlined"], ["glass", "Glass"]] as Array<[DialogStyle, string]>).map(([id, label]) => ({ value: id, label: t(label) }))}
                        onChange={(dialog) => updateStyles({ dialog })}
                      />

                  </SettingsRow>
                  <SettingsRow
                    title={<>{t("Shape")}</>}
                    description={<>{t("Corner radius across buttons and dialogs.")}</>}
                  >
                      <SettingsChoiceGroup
                        value={shapeStyle}
                        label={t("Shape")}
                        options={([["sharp", "Sharp"], ["soft", "Soft"], ["rounded", "Rounded"]] as Array<[ShapeStyle, string]>).map(([id, label]) => ({ value: id, label: t(label) }))}
                        onChange={(shape) => updateStyles({ shape })}
                      />

                  </SettingsRow>
                  <SettingsRow
                    title={<>{t("Shadow")}</>}
                    description={<>{t("Depth for buttons and dialogs.")}</>}
                  >
                      <SettingsChoiceGroup
                        value={shadowStyle}
                        label={t("Shadow")}
                        options={([["default", "Default"], ["none", "None"], ["subtle", "Subtle"], ["deep", "Deep"]] as Array<[ShadowStyle, string]>).map(([id, label]) => ({ value: id, label: t(label) }))}
                        onChange={(shadow) => updateStyles({ shadow })}
                      />

                  </SettingsRow>
                </div>
                            </SettingsSectionView>

              <SettingsSectionView title={t("Components")}>
                <div className="settings-group settings-appearance-group">
                  <SettingsRow
                    title={<>{t("Input style")}</>}
                    description={<>{t("Field fill and border treatment across the app.")}</>}
                  >
                      <SettingsChoiceGroup
                        value={inputStyle}
                        label={t("Input style")}
                        options={([["default", "Default"], ["filled", "Filled"], ["outlined", "Outlined"], ["ghost", "Ghost"]] as Array<[InputStyle, string]>).map(([id, label]) => ({ value: id, label: t(label) }))}
                        onChange={(input) => updateGlobalStyles({ input })}
                      />

                  </SettingsRow>
                  <SettingsRow
                    title={<>{t("Card style")}</>}
                    description={<>{t("Panel fill and border treatment across the app.")}</>}
                  >
                      <SettingsChoiceGroup
                        value={cardStyle}
                        label={t("Card style")}
                        options={([["default", "Default"], ["flat", "Flat"], ["outlined", "Outlined"]] as Array<[CardStyle, string]>).map(([id, label]) => ({ value: id, label: t(label) }))}
                        onChange={(card) => updateGlobalStyles({ card })}
                      />

                  </SettingsRow>
                  <SettingsRow
                    title={<>{t("Menu style")}</>}
                    description={<>{t("Popup fill, border, and blur treatment across the app.")}</>}
                  >
                      <SettingsChoiceGroup
                        value={menuStyle}
                        label={t("Menu style")}
                        options={([["default", "Default"], ["flat", "Flat"], ["outlined", "Outlined"], ["glass", "Glass"]] as Array<[MenuStyle, string]>).map(([id, label]) => ({ value: id, label: t(label) }))}
                        onChange={(menu) => updateGlobalStyles({ menu })}
                      />

                  </SettingsRow>
                  <SettingsRow
                    title={<>{t("Motion")}</>}
                    description={<>{t("Animation and transition intensity across the app.")}</>}
                  >
                      <SettingsChoiceGroup
                        value={motionStyle}
                        label={t("Motion")}
                        options={([["full", "Full"], ["reduced", "Reduced"], ["none", "None"]] as Array<[MotionStyle, string]>).map(([id, label]) => ({ value: id, label: t(label) }))}
                        onChange={(motion) => updateGlobalStyles({ motion })}
                      />

                  </SettingsRow>
                </div>
                            </SettingsSectionView>

              <SettingsSectionView title={t("Theme pack")}>
                <div className="settings-group">
                  <SettingsRow
                    title={<>{t("Share this appearance")}</>}
                    description={<>{t("Export the current appearance or import a shared .archtheme.json file.")}</>}
                  >
                      <div className="settings-appearance-control">
                        <button className="secondary-button" onClick={exportPack}>{t("Export")}</button>
                        <button className="secondary-button" onClick={() => packInputRef.current?.click()}>{t("Import")}</button>
                        <input ref={packInputRef} className="settings-file-input" type="file" accept=".json,.archtheme.json,application/json" aria-label={t("Import theme pack")} onChange={(event) => void importPack(event.target.files?.[0])} />
                      </div>

                  </SettingsRow>
                  {packError && <p className="settings-pack-error" role="alert">{packError}</p>}
                  {pendingPack && <div className="settings-pack-preview">
                    <div>
                      <strong>{pendingPack.name}</strong>
                      <span>{pendingPack.preset} · {Object.keys(pendingPack.overrides).length + Object.keys(pendingPack.surfaces ?? {}).length + Object.keys(pendingPack.styles ?? {}).length} overrides</span>
                    </div>
                    {packWarnings.length
                      ? <p className="settings-pack-warning">{t("{count} contrast pair(s) below WCAG AA.", { count: packWarnings.length })}</p>
                      : <p className="settings-pack-ok">{t("No contrast issues found.")}</p>}
                    <div className="settings-pack-actions">
                      <button className="primary-button" onClick={applyPack}>{t("Apply pack")}</button>
                      <button className="secondary-button" onClick={() => { setPendingPack(null); setPackWarnings([]); setPackError(""); }}>{t("Cancel")}</button>
                    </div>
                  </div>}
                </div>
                            </SettingsSectionView>

              <SettingsSectionView title={t("Fonts")}>
                <div className="settings-group">
                  <SettingsRow
                    title={<>{t("Interface font")}</>}
                    description={<>{t("Used for conversation, navigation, and interface text.")}</>}
                  >
                      <select className="settings-select" value={interfaceFont} onChange={(event) => setInterfaceFont(event.target.value as InterfaceFont)} aria-label={t("Interface font")}>
                        <option value="geist">{t("Geist Sans")}</option>
                        <option value="system">{t("System")}</option>
                      </select>

                  </SettingsRow>
                  <SettingsRow
                    title={<><Code2 size={13} />{t("Code font")}</>}
                    description={<>{t("Used for code, terminal output, and trajectory detail.")}</>}
                  >
                      <select className="settings-select" value={monoFont} onChange={(event) => setMonoFont(event.target.value as MonoFont)} aria-label={t("Code font")}>
                        <option value="geist-mono">{t("Geist Mono")}</option>
                        <option value="system">{t("System mono")}</option>
                      </select>

                  </SettingsRow>
                </div>
                            </SettingsSectionView>

              <SettingsSectionView title={t("Files")}>
                <div className="settings-group">
                  <SettingsRow
                    title={<>{t("File icons")}</>}
                    description={<>{t("Choose the icon palette for file trees.")}</>}
                  >
                      <SettingsChoiceGroup
                        className="file-icon-choice"
                        value={fileIconStyle}
                        label={t("File icons")}
                        options={[
                          { value: "city-lights", label: t("City Lights") },
                          { value: "material", label: t("Material") },
                          { value: "seti", label: t("Seti") },
                          { value: "monochrome", label: t("Monochrome") },
                        ]}
                        onChange={setFileIconStyle}
                      />

                  </SettingsRow>
                </div>
                            </SettingsSectionView>
            </div>}

            {section === "workbench" && <WorkbenchSettingsPanel preferences={workbenchPreferences} onChange={onChangeWorkbenchPreferences} onReset={onResetWorkbenchPreferences} />}

            {section === "models" && <ModelSettingsModal bridge={bridge} open embedded onClose={() => undefined} onSaved={onModelSaved} />}
            {section === "web" && <WebSearchSettingsModal bridge={bridge} open embedded onClose={() => undefined} />}
            {section === "terminal" && (terminalSettings
              ? <TerminalSettingsModal open embedded mode="settings" settings={terminalSettings} workspace={workspace} onClose={() => undefined} onSave={onSaveTerminalSettings} onOpenExternal={onOpenExternalTerminal} />
              : <div className="settings-empty">{t("Loading terminal settings…")}</div>)}

            {section === "workspace" && <div className="settings-sections">
              <SettingsSectionView title={t("Folder")}>
                <div className="settings-group">
                  <SettingsRow
                    stacked
                    controlClassName="settings-workspace-control"
                    title={<>{t("Current workspace")}</>}
                    description={<>{workspaceName || t("Opening workspace")} · {workspaceReady ? t("Workspace connected") : t("Opening workspace")}</>}
                  >
                      <code className="settings-path">{workspace || "—"}</code>
                      <button className="primary-button" onClick={onChooseWorkspace} disabled={agentBusy}><FolderOpen size={14} />{t("Change folder")}</button>

                  </SettingsRow>
                </div>
                            </SettingsSectionView>
            </div>}

            {section === "about" && <div className="settings-about">
              <strong>Archimedes</strong>
              <p>{t("Local-first AI for research.")}</p>
              <dl><dt>{t("Version")}</dt><dd>0.1.0</dd></dl>
            </div>}
          </div>
        </div>
      </div>
  </Dialog>;
}


