import { useEffect, useState } from "react";
import { ArrowUpRight, Settings2, X } from "lucide-react";
import { useDialogFocus } from "./useDialogFocus";

type TerminalSettingsModalProps = {
  open: boolean;
  mode: "settings" | "onboarding";
  settings: TerminalSettings | null;
  workspace: string;
  onClose: () => void;
  onSave: (patch: Partial<TerminalSettings>) => Promise<void>;
  onOpenExternal: (externalTerminal: TerminalExternalTerminal) => Promise<void>;
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

export default function TerminalSettingsModal({ open, mode, settings, workspace, onClose, onSave, onOpenExternal }: TerminalSettingsModalProps) {
  const dialogRef = useDialogFocus<HTMLElement>(open, onClose);
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
      { value: "none", label: "Do not open external terminal" },
    ]
    : platform === "darwin"
      ? [
        { value: "auto", label: "Ghostty · recommended" },
        { value: "wezterm", label: "WezTerm" },
        { value: "terminal", label: "Terminal.app" },
        { value: "none", label: "Do not open external terminal" },
      ]
      : [
        { value: "auto", label: "WezTerm · recommended" },
        { value: "ghostty", label: "Ghostty" },
        { value: "none", label: "Do not open external terminal" },
      ];

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

  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section ref={dialogRef} tabIndex={-1} className="workspace-modal terminal-settings-modal" role="dialog" aria-modal="true" aria-label={mode === "onboarding" ? "Choose your terminal" : "Terminal settings"} onMouseDown={(event) => event.stopPropagation()}>
      <div className="modal-header">
        <div><span className="eyebrow">{mode === "onboarding" ? "First terminal" : "Workspace terminal"}</span><h2>{mode === "onboarding" ? "Choose your terminal" : "Terminal settings"}</h2></div>
        <button className="icon-button" onClick={onClose} title="Close" aria-label="Close"><X size={16} /></button>
      </div>

      <div className="terminal-settings-body">
        {mode === "onboarding" && <p className="terminal-settings-intro">Pick the shell Archimedes should use for new terminals. You can change this later in Terminal settings.</p>}

        <div className="terminal-settings-platform"><span>{platformLabel}</span><strong>{settings.detectedShellName || settings.detectedShell}</strong></div>

        <label className="terminal-settings-field">
          <span>Shell profile</span>
          <select value={form.shell || "auto"} onChange={(event) => setForm((current) => ({ ...current, shell: event.target.value as TerminalShellProfile }))}>
            {shellOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
          </select>
          <small>Recommended for {platformLabel}: {recommendedShell}. Detected: {settings.detectedShellName || settings.detectedShell}</small>
        </label>

        {(form.shell || settings.shell) === "custom" && <label className="terminal-settings-field">
          <span>Custom shell</span>
          <input value={form.customShell || ""} onChange={(event) => setForm((current) => ({ ...current, customShell: event.target.value }))} placeholder={platform === "win32" ? "C:\\path\\to\\pwsh.exe" : "/usr/local/bin/fish"} />
        </label>}

        <div className="terminal-settings-grid">
          <label className="terminal-settings-field">
            <span>Font family</span>
            <input value={form.fontFamily || ""} onChange={(event) => setForm((current) => ({ ...current, fontFamily: event.target.value }))} placeholder={platform === "win32" ? "Cascadia Mono" : platform === "darwin" ? "SF Mono" : "JetBrains Mono"} />
          </label>
          <label className="terminal-settings-field">
            <span>Font size</span>
            <input type="number" min={10} max={20} value={form.fontSize ?? 12} onChange={(event) => setForm((current) => ({ ...current, fontSize: Number(event.target.value) }))} />
          </label>
        </div>

        <div className="terminal-settings-grid">
          <label className="terminal-settings-field">
            <span>Scrollback</span>
            <select value={form.scrollback ?? 10_000} onChange={(event) => setForm((current) => ({ ...current, scrollback: Number(event.target.value) }))}>
              <option value={5_000}>5,000 lines</option>
              <option value={10_000}>10,000 lines</option>
              <option value={25_000}>25,000 lines</option>
            </select>
          </label>
          <label className="terminal-settings-field">
            <span>External terminal</span>
            <select value={form.externalTerminal || "auto"} onChange={(event) => setForm((current) => ({ ...current, externalTerminal: event.target.value as TerminalExternalTerminal }))}>
              {externalOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>

        <div className="terminal-settings-external">
          <div><Settings2 size={13} /><span>Open the active workspace in {settings.externalTerminalLabel}.</span></div>
          <button className="secondary-button" onClick={() => void openExternal()} disabled={opening}><ArrowUpRight size={13} />{opening ? "Opening…" : "Open external"}</button>
        </div>

        {error && <p className="terminal-settings-error">{error}</p>}
      </div>

      <div className="modal-actions terminal-settings-actions">
        <button className="secondary-button" onClick={() => setForm({ shell: "auto", customShell: "", fontFamily: "", fontSize: 12, scrollback: 10_000, externalTerminal: "auto" })}>Restore recommended</button>
        <span style={{ flex: 1 }} />
        {mode === "onboarding"
          ? <><button className="secondary-button" onClick={() => void save({ onboarded: true })}>Not now</button><button className="primary-button" onClick={() => void save({})} disabled={saving}>{saving ? "Saving…" : "Continue"}</button></>
          : <><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={() => void save({})} disabled={saving}>{saving ? "Saving…" : "Save"}</button></>}
      </div>
    </section>
  </div>;
}
