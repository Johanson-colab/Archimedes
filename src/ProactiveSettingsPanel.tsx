import { Eye, History, Laptop, ShieldCheck, Sparkles, Timer } from "lucide-react";
import { useUISettings } from "./i18n";
import type { ProactiveSettings } from "./proactive-types";

const MODES: Array<{ id: ProactiveSettings["mode"]; label: string; description: string }> = [
  { id: "off", label: "Off", description: "No signals, no suggestions. Nothing is collected." },
  { id: "manual", label: "Manual", description: "Only when you ask Proactive agent to look at the current context." },
  { id: "auto", label: "Auto", description: "Watch L0 signals and queue suggestions in the top dock." },
];

export default function ProactiveSettingsPanel({
  settings,
  onChange,
  onObserveOnce,
  onResetHistory,
  historyCount,
  canObserve,
}: {
  settings: ProactiveSettings;
  onChange: (patch: Partial<ProactiveSettings>) => void;
  onObserveOnce: () => void;
  onResetHistory: () => void;
  historyCount: number;
  canObserve: boolean;
}) {
  const { t } = useUISettings();
  const setSource = (key: keyof ProactiveSettings["sources"], value: boolean) => {
    onChange({ sources: { ...settings.sources, [key]: value } });
  };

  return <div className="proactive-settings">
    <section className="proactive-settings-hero">
      <div className="proactive-settings-mark"><Sparkles size={18} /></div>
      <div>
        <span className="page-kicker">{t("Research dock")}</span>
        <h3>{t("Proactive agent")}</h3>
        <p>{t("A quiet research sidekick. It reads only app context, never screenshots, and every suggestion must carry evidence you can open.")}</p>
      </div>
      <span className={`proactive-mode-chip mode-${settings.mode}`}>{settings.mode === "off" ? t("Off") : settings.mode === "manual" ? t("Manual") : t("Auto")}</span>
    </section>

    <section className="proactive-settings-section">
      <header><div><strong>{t("Mode")}</strong><span>{t("Proactive is opt-in. Off is the default.")}</span></div></header>
      <div className="proactive-mode-grid" role="radiogroup" aria-label="Proactive mode">
        {MODES.map((mode) => <button
          key={mode.id}
          role="radio"
          aria-checked={settings.mode === mode.id}
          className={settings.mode === mode.id ? "proactive-mode-option selected" : "proactive-mode-option"}
          onClick={() => onChange({ mode: mode.id })}
        >
          <span className="proactive-radio" aria-hidden="true" />
          <strong>{t(mode.label)}</strong>
          <small>{t(mode.description)}</small>
        </button>)}
      </div>
    </section>

    <section className="proactive-settings-section">
      <header><div><strong>{t("What it watches")}</strong><span>{t("Only L0 signals from inside Archimedes.")}</span></div><span className="proactive-settings-badge">{t("Local only")}</span></header>
      <div className="proactive-source-list">
        <label className="proactive-source-row">
          <input type="checkbox" checked={settings.sources.search} onChange={(event) => setSource("search", event.target.checked)} />
          <span><strong>{t("Search with 0 results")}</strong><small>{t("Offer the likely term when a paper search misses.")}</small></span>
          <em>{t("L0")}</em>
        </label>
        <label className="proactive-source-row">
          <input type="checkbox" checked={settings.sources.selection} onChange={(event) => setSource("selection", event.target.checked)} />
          <span><strong>{t("Repeated passage selection")}</strong><small>{t("Notice when the same passage is selected more than once.")}</small></span>
          <em>L0</em>
        </label>
        <label className="proactive-source-row">
          <input type="checkbox" checked={settings.sources.latex} onChange={(event) => setSource("latex", event.target.checked)} />
          <span><strong>{t("LaTeX build failure")}</strong><small>{t("Turn the first diagnostic into a fix request with the file and line.")}</small></span>
          <em>L0</em>
        </label>
        <label className="proactive-source-row">
          <input type="checkbox" checked={settings.sources.citation} onChange={(event) => setSource("citation", event.target.checked)} />
          <span><strong>{t("Uncited claims")}</strong><small>{t("Manual review of the latest answer; never runs on its own.")}</small></span>
          <em>{t("Manual")}</em>
        </label>
      </div>
      <p className="proactive-privacy-note"><ShieldCheck size={13} />{t("No screenshots, window titles, keystrokes, or background model calls. Evidence stays in this workspace.")}</p>
    </section>

    <section className="proactive-settings-section">
      <header><div><strong>{t("Rhythm")}</strong><span>{t("Hard limits on when suggestions can appear.")}</span></div></header>
      <div className="proactive-rhythm-grid">
        <label className="proactive-field">
          <span><Timer size={13} />{t("Daily budget")}</span>
          <input type="number" min={1} max={20} value={settings.dailyBudget} onChange={(event) => onChange({ dailyBudget: Math.min(20, Math.max(1, Number(event.target.value) || 1)) })} />
          <small>{t("Auto suggestions created per day. Manual reviews are not counted.")}</small>
        </label>
        <div className="proactive-field">
          <span><Laptop size={13} />{t("Quiet hours")}</span>
          <div className="proactive-quiet-row">
            <label className="proactive-switch"><input type="checkbox" checked={settings.quietHours.enabled} onChange={(event) => onChange({ quietHours: { ...settings.quietHours, enabled: event.target.checked } })} /><span /></label>
            <input type="time" value={settings.quietHours.start} disabled={!settings.quietHours.enabled} onChange={(event) => onChange({ quietHours: { ...settings.quietHours, start: event.target.value } })} />
            <span>{t("to")}</span>
            <input type="time" value={settings.quietHours.end} disabled={!settings.quietHours.enabled} onChange={(event) => onChange({ quietHours: { ...settings.quietHours, end: event.target.value } })} />
          </div>
          <small>{t("Suggestions stay queued and only light the toolbar badge.")}</small>
        </div>
      </div>
      <div className="proactive-hard-rules">
        <span>{t("Composer focused → badge only")}</span>
        <span>{t("3 dismissals → 2h pause")}</span>
        <span>{t("No evidence → never shown")}</span>
      </div>
    </section>

    <section className="proactive-settings-section proactive-settings-actions">
      <div><strong>{t("Try it now")}</strong><span>{t("Review the latest answer for uncited claims.")}</span></div>
      <div>
        <button className="secondary-button" onClick={onObserveOnce} disabled={!canObserve}><Eye size={13} />{t("Observe once")}</button>
        <button className="proactive-text-button danger" onClick={onResetHistory} disabled={!historyCount}><History size={13} />{t("Clear {count} history items", { count: historyCount })}</button>
      </div>
    </section>
  </div>;
}
