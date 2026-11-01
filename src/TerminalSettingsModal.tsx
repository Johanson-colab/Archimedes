import { useEffect, useState } from "react";
import { ArrowUpRight, Settings2, X } from "lucide-react";
import { useUISettings } from "./i18n";
import { Dialog } from "./Dialog";
import { SettingsGroup, SettingsRow, SettingsSection } from "./SettingsPrimitives";

type TerminalSettingsModalProps = {
  open: boolean;
  mode: "settings" | "onboarding";
  settings: TerminalSettings | null;
  workspace: string;
  onClose: () => void;
  onSave: (patch: Partial<TerminalSettings>) => Promise<void>;
  onOpenExternal: (externalTerminal: TerminalExternalTerminal) => Promise<void>;
  embedded?: boolean;
};

const WINDOWS_SHELLS: Array<{ value: TerminalShellProfile; label: string }> = [
  { value: "auto", label: "Auto · recommended" },
  { value: "pwsh", label: "PowerShell 7" },
  { value: "powershell", label: "Windows PowerShell 5.1" },
  { value: "cmd", label: "Command Prompt" },
  { value: "custom", label: "Custom executable" },
];

const POSIX_SHELLS: Array<{ value: TerminalShellProfile; label: string }> = [
  { value: "auto", label: "Auto · login shell" },
  { value: "zsh", label: "zsh" },
  { value: "fish", label: "fish" },
  { value: "bash", label: "bash" },
  { value: "custom", label: "Custom executable" },
];

export default function TerminalSettingsModal({ open, mode, settings, workspace, onClose, onSave, onOpenExternal, embedded = false }: TerminalSettingsModalProps) {
  const { t } = useUISettings();
  const [form, setForm] = useState<Partial<TerminalSettings>>({});
  const [saving, setSaving] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !settings) return;
    setForm({
      shell: settings.shell,
      customShell: settings.customShell,
      fontFamily: settings.fontFamily,
      fontSize: settings.fontSize,
      scrollback: settings.scrollback,
      externalTerminal: settings.externalTerminal,
    });
    setError("");
  }, [open, settings]);

  if (!open || !settings) return null;

  const platform = settings.platform;
  const shellOptions = platform === "win32" ? WINDOWS_SHELLS : POSIX_SHELLS;
  const externalOptions: Array<{ value: TerminalExternalTerminal; label: string }> = platform === "win32"
    ? [
      { value: "auto", label: "Windows Terminal · recommended" },
      { value: "wezterm", label: "WezTerm" },
      { value: "tabby", label: "Tabby" },
      { value: "none", label: "Do not open external terminal" },
    ]
    : platform === "darwin"
      ? [
        { value: "auto", label: "Ghostty · recommended" },
        { value: "wezterm", label: "WezTerm" },
        { value: "tabby", label: "Tabby" },
        { value: "terminal", label: "Terminal.app" },
        { value: "none", label: "Do not open external terminal" },
      ]
      : [
        { value: "auto", label: "WezTerm · recommended" },
        { value: "ghostty", label: "Ghostty" },
        { value: "tabby", label: "Tabby" },
        { value: "none", label: "Do not open external terminal" },
      ];

  const selectedExternal = form.externalTerminal || settings.externalTerminal || "auto";
  const externalLabel = selectedExternal === "auto"
    ? settings.externalTerminalLabel
    : externalOptions.find((option) => option.value === selectedExternal)?.label.split(" · ")[0] || settings.externalTerminalLabel;
  const recommendedShell = platform === "win32" ? "PowerShell 7" : platform === "darwin" ? "zsh" : "$SHELL";
  const platformLabel = platform === "win32" ? "Windows" : platform === "darwin" ? "macOS" : "Linux";

  async function save(patch: Partial<TerminalSettings>) {
    setSaving(true);
    setError("");
    try {
      await onSave({ ...form, ...patch, onboarded: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  async function openExternal() {
    setOpening(true);
    setError("");
    try {
      await onOpenExternal((form.externalTerminal || settings?.externalTerminal || "auto") as TerminalExternalTerminal);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setOpening(false);
    }
  }

  if (embedded) return <div className="settings-sections">
    <SettingsSection title={t("Shell")}>
      <SettingsGroup>
        <SettingsRow
          title={t("Detected shell")}
          description={<>{platformLabel} · {settings.detectedShellName || settings.detectedShell}</>}
        >
          <code className="settings-path settings-path-inline">{settings.detectedShellName || settings.detectedShell}</code>
        </SettingsRow>
        <SettingsRow
          title={t("Shell profile")}
          description={t("Recommended for {platform}: {shell}. Detected: {detected}", { platform: platformLabel, shell: recommendedShell, detected: settings.detectedShellName || settings.detectedShell })}
        >
          <select className="settings-select" value={form.shell || "auto"} aria-label={t("Shell profile")} onChange={(event) => setForm((current) => ({ ...current, shell: event.target.value as TerminalShellProfile }))}>
            {shellOptions.map((option) => <option value={option.value} key={option.value}>{t(option.label)}</option>)}
          </select>
        </SettingsRow>
        {(form.shell || settings.shell) === "custom" && <SettingsRow
          stacked
          title={t("Custom shell")}
          description={t("Absolute path to the shell executable.")}
        >
          <input className="settings-text-input settings-text-input-wide" value={form.customShell || ""} aria-label={t("Custom shell")} onChange={(event) => setForm((current) => ({ ...current, customShell: event.target.value }))} placeholder={platform === "win32" ? "C:\\path\\to\\pwsh.exe" : "/usr/local/bin/fish"} />
        </SettingsRow>}
      </SettingsGroup>
    </SettingsSection>

    <SettingsSection title={t("Appearance")}>
      <SettingsGroup>
        <SettingsRow
          title={t("Font family")}
          description={t("Leave empty to use the platform monospace stack.")}
        >
          <input className="settings-text-input" value={form.fontFamily || ""} aria-label={t("Font family")} onChange={(event) => setForm((current) => ({ ...current, fontFamily: event.target.value }))} placeholder={platform === "win32" ? "Cascadia Mono" : platform === "darwin" ? "SF Mono" : "JetBrains Mono"} />
        </SettingsRow>
        <SettingsRow
          title={t("Font size")}
          description={t("Terminal text size in pixels.")}
        >
          <input className="settings-text-input terminal-font-size" type="number" min={10} max={20} value={form.fontSize ?? 12} aria-label={t("Font size")} onChange={(event) => setForm((current) => ({ ...current, fontSize: Number(event.target.value) }))} />
        </SettingsRow>
      </SettingsGroup>
    </SettingsSection>

    <SettingsSection title={t("Session")}>
      <SettingsGroup>
        <SettingsRow
          title={t("Scrollback")}
          description={t("Lines kept in memory for each terminal session.")}
        >
          <select className="settings-select" value={form.scrollback ?? 10_000} aria-label={t("Scrollback")} onChange={(event) => setForm((current) => ({ ...current, scrollback: Number(event.target.value) }))}>
            <option value={5_000}>{t("5,000 lines")}</option>
            <option value={10_000}>{t("10,000 lines")}</option>
            <option value={25_000}>{t("25,000 lines")}</option>
          </select>
        </SettingsRow>
        <SettingsRow
          title={t("External terminal")}
          description={t("Used by the Open external action.")}
          controlClassName="settings-inline-control"
        >
          <select className="settings-select terminal-external-select" value={form.externalTerminal || "auto"} aria-label={t("External terminal")} onChange={(event) => setForm((current) => ({ ...current, externalTerminal: event.target.value as TerminalExternalTerminal }))}>
            {externalOptions.map((option) => <option value={option.value} key={option.value}>{t(option.label)}</option>)}
          </select>
          <button className="secondary-button" onClick={() => void openExternal()} disabled={opening}><ArrowUpRight size={13} />{opening ? t("Opening…") : t("Open external")}</button>
        </SettingsRow>
      </SettingsGroup>
      <p className="settings-group-note">{t("Open the active workspace in {terminal}.", { terminal: externalLabel })}</p>
    </SettingsSection>

    {error && <p className="settings-form-error" role="alert">{error}</p>}
    <div className="settings-form-actions">
      <span className="settings-form-status">{t("Changes apply to new terminal sessions.")}</span>
      <div className="settings-form-buttons">
        <button className="secondary-button" onClick={() => setForm({ shell: "auto", customShell: "", fontFamily: "", fontSize: 12, scrollback: 10_000, externalTerminal: "auto" })}>{t("Restore recommended")}</button>
        <button className="primary-button" onClick={() => void save({})} disabled={saving}>{saving ? t("Saving…") : t("Save")}</button>
      </div>
    </div>
  </div>;

  const content = <>
      {!embedded && <div className="modal-header">
        <div><span className="eyebrow">{mode === "onboarding" ? t("First terminal") : t("Workspace terminal")}</span><h2>{mode === "onboarding" ? t("Choose your terminal") : t("Terminal settings")}</h2></div>
        <button className="icon-button" onClick={onClose} title={t("Close")} aria-label={t("Close")}><X size={16} /></button>
      </div>}

      <div className="terminal-settings-body">
        {mode === "onboarding" && <p className="terminal-settings-intro">{t("Pick the shell Archimedes should use for new terminals. You can change this later in Terminal settings.")}</p>}

        <div className="terminal-settings-platform"><span>{platformLabel}</span><strong>{settings.detectedShellName || settings.detectedShell}</strong></div>

        <label className="terminal-settings-field">
          <span>{t("Shell profile")}</span>
          <select value={form.shell || "auto"} onChange={(event) => setForm((current) => ({ ...current, shell: event.target.value as TerminalShellProfile }))}>
            {shellOptions.map((option) => <option value={option.value} key={option.value}>{t(option.label)}</option>)}
          </select>
          <small>{t("Recommended for {platform}: {shell}. Detected: {detected}", { platform: platformLabel, shell: recommendedShell, detected: settings.detectedShellName || settings.detectedShell })}</small>
        </label>

        {(form.shell || settings.shell) === "custom" && <label className="terminal-settings-field">
          <span>{t("Custom shell")}</span>
          <input value={form.customShell || ""} onChange={(event) => setForm((current) => ({ ...current, customShell: event.target.value }))} placeholder={platform === "win32" ? "C:\\path\\to\\pwsh.exe" : "/usr/local/bin/fish"} />
        </label>}

        <div className="terminal-settings-grid">
          <label className="terminal-settings-field">
            <span>{t("Font family")}</span>
            <input value={form.fontFamily || ""} onChange={(event) => setForm((current) => ({ ...current, fontFamily: event.target.value }))} placeholder={platform === "win32" ? "Cascadia Mono" : platform === "darwin" ? "SF Mono" : "JetBrains Mono"} />
          </label>
          <label className="terminal-settings-field">
            <span>{t("Font size")}</span>
            <input type="number" min={10} max={20} value={form.fontSize ?? 12} onChange={(event) => setForm((current) => ({ ...current, fontSize: Number(event.target.value) }))} />
          </label>
        </div>

        <div className="terminal-settings-grid">
          <label className="terminal-settings-field">
            <span>{t("Scrollback")}</span>
            <select value={form.scrollback ?? 10_000} onChange={(event) => setForm((current) => ({ ...current, scrollback: Number(event.target.value) }))}>
              <option value={5_000}>{t("5,000 lines")}</option>
              <option value={10_000}>{t("10,000 lines")}</option>
              <option value={25_000}>{t("25,000 lines")}</option>
            </select>
          </label>
          <label className="terminal-settings-field">
            <span>{t("External terminal")}</span>
            <select value={form.externalTerminal || "auto"} onChange={(event) => setForm((current) => ({ ...current, externalTerminal: event.target.value as TerminalExternalTerminal }))}>
              {externalOptions.map((option) => <option value={option.value} key={option.value}>{t(option.label)}</option>)}
            </select>
          </label>
        </div>

        <div className="terminal-settings-external">
          <div><Settings2 size={13} /><span>{t("Open the active workspace in {terminal}.", { terminal: externalLabel })}</span></div>
          <button className="secondary-button" onClick={() => void openExternal()} disabled={opening}><ArrowUpRight size={13} />{opening ? t("Opening…") : t("Open external")}</button>
        </div>

        {error && <p className="terminal-settings-error">{error}</p>}
      </div>

      <div className="modal-actions terminal-settings-actions">
        <button className="secondary-button" onClick={() => setForm({ shell: "auto", customShell: "", fontFamily: "", fontSize: 12, scrollback: 10_000, externalTerminal: "auto" })}>{t("Restore recommended")}</button>
        <span style={{ flex: 1 }} />
        {mode === "onboarding"
          ? <><button className="secondary-button" onClick={() => void save({ onboarded: true })}>{t("Not now")}</button><button className="primary-button" onClick={() => void save({})} disabled={saving}>{saving ? t("Saving…") : t("Continue")}</button></>
          : <>{!embedded && <button className="secondary-button" onClick={onClose}>{t("Cancel")}</button>}<button className="primary-button" onClick={() => void save({})} disabled={saving}>{saving ? t("Saving…") : t("Save")}</button></>}
      </div>
    </>;
  if (embedded) return <section className="settings-embedded terminal-settings-modal" aria-label="Terminal settings">{content}</section>;
  return <Dialog open={open} onClose={onClose} size="md" className="workspace-modal terminal-settings-modal" ariaLabel={mode === "onboarding" ? "Choose your terminal" : "Terminal settings"}>{content}</Dialog>;
}
