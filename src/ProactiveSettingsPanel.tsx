import { useUISettings } from "./i18n";
import type { ProactiveSettings } from "./proactive-types";

const MODES: Array<{ id: ProactiveSettings["mode"]; label: string; description: string }> = [
  { id: "off", label: "Off", description: "No signals, no suggestions. Nothing is collected." },
  { id: "manual", label: "Manual", description: "Only when you ask Proactive agent to look at the current context." },
  { id: "auto", label: "Auto", description: "Watch L0 signals and queue suggestions in the top dock." },
];

function Row({ title, description, hint, children, stacked = false }: { title: string; description: string; hint?: string; children: React.ReactNode; stacked?: boolean }) {
  return <div className={stacked ? "settings-row settings-row-stacked" : "settings-row"}>
    <div className="settings-row-copy">
      <span className="settings-row-title">{title}</span>
      <p className="settings-row-description">{description}</p>
      {hint && <span className="settings-row-hint">{hint}</span>}
    </div>
    <div className="settings-row-control">{children}</div>
  </div>;
}

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return <button className={checked ? "settings-toggle on" : "settings-toggle"} role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}><span /></button>;
}

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
  const activeMode = MODES.find((mode) => mode.id === settings.mode) ?? MODES[0];

  return <div className="settings-sections">
    <p className="settings-group-note">{t("A quiet research sidekick. It reads only app context, never screenshots, and every suggestion must carry evidence you can open.")}</p>

    <section className="settings-section">
      <h3 className="settings-section-title">{t("Mode")}</h3>
      <div className="settings-group">
        <Row
          title={t("Proactive mode")}
          description={t("Proactive is opt-in. Off is the default.")}
          hint={t(activeMode.description)}
        >
          <div className="settings-choice" role="radiogroup" aria-label={t("Proactive mode")}>
            {MODES.map((mode) => <button
              key={mode.id}
              role="radio"
              aria-checked={settings.mode === mode.id}
              className={settings.mode === mode.id ? "active" : ""}
              onClick={() => onChange({ mode: mode.id })}
            >{t(mode.label)}</button>)}
          </div>
        </Row>
      </div>
    </section>

    <section className="settings-section">
      <h3 className="settings-section-title">{t("What it watches")}</h3>
      <p className="settings-group-note">{t("Only L0 signals from inside Archimedes.")}</p>
      <div className="settings-group">
        <Row title={t("Search with 0 results")} description={t("Offer the likely term when a paper search misses.")} hint={t("L0 · app context")}>
          <Toggle checked={settings.sources.search} label={t("Search with 0 results")} onChange={(value) => setSource("search", value)} />
        </Row>
        <Row title={t("Repeated passage selection")} description={t("Notice when the same passage is selected more than once.")} hint={t("L0 · app context")}>
          <Toggle checked={settings.sources.selection} label={t("Repeated passage selection")} onChange={(value) => setSource("selection", value)} />
        </Row>
        <Row title={t("LaTeX build failure")} description={t("Turn the first diagnostic into a fix request with the file and line.")} hint={t("L0 · app context")}>
          <Toggle checked={settings.sources.latex} label={t("LaTeX build failure")} onChange={(value) => setSource("latex", value)} />
        </Row>
        <Row title={t("Uncited claims")} description={t("Manual review of the latest answer; never runs on its own.")} hint={t("Manual only")}>
          <Toggle checked={settings.sources.citation} label={t("Uncited claims")} onChange={(value) => setSource("citation", value)} />
        </Row>
      </div>
      <p className="settings-group-note">{t("No screenshots, window titles, keystrokes, or background model calls. Evidence stays in this workspace.")}</p>
    </section>

    <section className="settings-section">
      <h3 className="settings-section-title">{t("Rhythm")}</h3>
      <div className="settings-group">
        <Row title={t("Daily budget")} description={t("Auto suggestions created per day. Manual reviews are not counted.")}>
          <input
            className="settings-text-input proactive-budget-input"
            type="number"
            min={1}
            max={20}
            value={settings.dailyBudget}
            aria-label={t("Daily budget")}
            onChange={(event) => onChange({ dailyBudget: Math.min(20, Math.max(1, Number(event.target.value) || 1)) })}
          />
        </Row>
        <Row title={t("Quiet hours")} description={t("Suggestions stay queued and only light the toolbar badge.")}>
          <div className="settings-inline-control">
            <Toggle checked={settings.quietHours.enabled} label={t("Quiet hours")} onChange={(enabled) => onChange({ quietHours: { ...settings.quietHours, enabled } })} />
            <input className="settings-text-input proactive-time-input" type="time" value={settings.quietHours.start} disabled={!settings.quietHours.enabled} aria-label={t("Quiet hours start")} onChange={(event) => onChange({ quietHours: { ...settings.quietHours, start: event.target.value } })} />
            <span className="settings-control-label">{t("to")}</span>
            <input className="settings-text-input proactive-time-input" type="time" value={settings.quietHours.end} disabled={!settings.quietHours.enabled} aria-label={t("Quiet hours end")} onChange={(event) => onChange({ quietHours: { ...settings.quietHours, end: event.target.value } })} />
          </div>
        </Row>
      </div>
      <p className="settings-group-note">{t("Composer focused → badge only · 3 dismissals → 2h pause · No evidence → never shown")}</p>
    </section>

    <section className="settings-section">
      <h3 className="settings-section-title">{t("Manual review")}</h3>
      <div className="settings-group">
        <Row title={t("Review the latest answer")} description={t("Look for uncited claims once. Nothing runs in the background.")}>
          <button className="secondary-button" onClick={onObserveOnce} disabled={!canObserve}>{t("Observe once")}</button>
        </Row>
        <Row title={t("Suggestion history")} description={t("{count} suggestions retained for 30 days", { count: historyCount })}>
          <button className="settings-reset-button" onClick={onResetHistory} disabled={!historyCount}>{t("Clear history")}</button>
        </Row>
      </div>
    </section>
  </div>;
}
