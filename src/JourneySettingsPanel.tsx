import { useUISettings } from "./i18n";

type JourneySettingsPanelProps = {
  settings: JourneySettings;
  onChange: (patch: Partial<JourneySettings>) => Promise<void>;
  onReset: () => Promise<void>;
  onOpenModels: () => void;
};

function Row({ title, description, children, stacked = false }: { title: string; description: string; children: React.ReactNode; stacked?: boolean }) {
  return <div className={stacked ? "settings-row settings-row-stacked" : "settings-row"}>
    <div className="settings-row-copy"><span className="settings-row-title">{title}</span><p className="settings-row-description">{description}</p></div>
    <div className="settings-row-control">{children}</div>
  </div>;
}

function Choice<T extends string>({ value, options, label, onChange }: { value: T; options: Array<{ value: T; label: string; disabled?: boolean }>; label: string; onChange: (value: T) => void }) {
  return <div className="settings-choice" role="group" aria-label={label}>
    {options.map((option) => <button key={option.value} className={value === option.value ? "active" : ""} disabled={option.disabled} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}
  </div>;
}

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return <button className={checked ? "settings-toggle on" : "settings-toggle"} role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}><span /></button>;
}

function Stepper({ value, unit, min, max, step = 1, label, disabled = false, onChange }: { value: number; unit: string; min: number; max: number; step?: number; label: string; disabled?: boolean; onChange: (value: number) => void }) {
  const next = (delta: number) => onChange(Math.max(min, Math.min(max, value + delta)));
  return <div className={disabled ? "settings-stepper disabled" : "settings-stepper"}>
    <button disabled={disabled || value <= min} aria-label={`Decrease ${label}`} onClick={() => next(-step)}>−</button>
    <span>{value} <small>{unit}</small></span>
    <button disabled={disabled || value >= max} aria-label={`Increase ${label}`} onClick={() => next(step)}>+</button>
  </div>;
}

export default function JourneySettingsPanel({ settings, onChange, onReset, onOpenModels }: JourneySettingsPanelProps) {
  const { t } = useUISettings();
  const save = (patch: Partial<JourneySettings>) => { void onChange(patch); };

  return <div className="settings-sections">
    <p className="settings-group-note">{t("These settings control how much the AI summarizes and when the map appears. Higher frequency increases model calls.")}</p>

    <section className="settings-section">
      <h3 className="settings-section-title">{t("View")}</h3>
      <div className="settings-group">
        <Row title={t("Default view")} description={t("Story reads like a brief. Outline is a tree for navigating long runs.")}>
          <Choice value={settings.defaultView} label={t("Default view")} onChange={(defaultView) => save({ defaultView })} options={[{ value: "story", label: t("Story") }, { value: "outline", label: t("Outline") }]} />
        </Row>
        <Row title={t("Map")} description={t("Open the structural map automatically when the journey gets long.")}>
          <Choice value={settings.mapMode} label={t("Map")} onChange={(mapMode) => save({ mapMode })} options={[{ value: "auto", label: t("Auto") }, { value: "always", label: t("Always") }, { value: "off", label: t("Off") }]} />
        </Row>
        <Row stacked title={t("Map threshold")} description={t("Auto opens the map at whichever threshold comes first.")}>
          <div className="settings-threshold">
            <Stepper value={settings.mapChapters} unit={t("chapters")} min={4} max={20} label={t("Map chapters")} disabled={settings.mapMode !== "auto"} onChange={(mapChapters) => save({ mapChapters })} />
            <span className="settings-threshold-or">{t("or")}</span>
            <Stepper value={settings.mapSteps} unit={t("steps")} min={50} max={500} step={10} label={t("Map steps")} disabled={settings.mapMode !== "auto"} onChange={(mapSteps) => save({ mapSteps })} />
          </div>
        </Row>
        <Row title={t("Since you left")} description={t("Show new steps, sources, and pending approvals after a break.")}>
          <Toggle checked={settings.sinceYouLeft} label={t("Since you left")} onChange={(sinceYouLeft) => save({ sinceYouLeft })} />
        </Row>
        <Row title={t("Follow live")} description={t("Keep new activity below your reading position. Jump to latest when you scroll up.")}>
          <Toggle checked={settings.followLive} label={t("Follow live")} onChange={(followLive) => save({ followLive })} />
        </Row>
      </div>
    </section>

    <section className="settings-section">
      <h3 className="settings-section-title">{t("Chapters")}</h3>
      <div className="settings-group">
        <Row title={t("Max chapters")} description={t("Older chapters merge after this limit.")}>
          <Stepper value={settings.maxChapters} unit={t("chapters")} min={6} max={16} label={t("Max chapters")} onChange={(maxChapters) => save({ maxChapters })} />
        </Row>
        <Row title={t("Auto-merge")} description={t("Merge completed chapters instead of hiding them.")}>
          <Toggle checked={settings.autoMerge} label={t("Auto-merge")} onChange={(autoMerge) => save({ autoMerge })} />
        </Row>
        <Row title={t("Collapse completed")} description={t("Keep only the current chapter expanded.")}>
          <Toggle checked={settings.collapseCompleted} label={t("Collapse completed")} onChange={(collapseCompleted) => save({ collapseCompleted })} />
        </Row>
        <Row title={t("Target episodes")} description={t("Used when chapter boundaries are proposed.")}>
          <Stepper value={settings.targetEpisodes} unit={t("episodes")} min={3} max={6} label={t("Target episodes")} onChange={(targetEpisodes) => save({ targetEpisodes })} />
        </Row>
      </div>
    </section>

    <section className="settings-section">
      <h3 className="settings-section-title">{t("Summaries")}</h3>
      <p className="settings-group-note">{t("Changes apply to the next summary. Cadence and length affect model cost.")}</p>
      <div className="settings-group">
        <Row title={t("Live summaries")} description={t("Update while the agent is running. Off updates only at turn end.")}>
          <Toggle checked={settings.liveSummaries} label={t("Live summaries")} onChange={(liveSummaries) => save({ liveSummaries })} />
        </Row>
        <Row title={t("Episode cadence")} description={t("Summarize after this many meaningful events.")}>
          <Stepper value={settings.episodeCadence} unit={t("events")} min={6} max={24} label={t("Episode cadence")} disabled={!settings.liveSummaries} onChange={(episodeCadence) => save({ episodeCadence })} />
        </Row>
        <Row title={t("Idle delay")} description={t("Or after this much quiet time.")}>
          <Stepper value={settings.idleDelay} unit={t("seconds")} min={20} max={180} step={10} label={t("Idle delay")} disabled={!settings.liveSummaries} onChange={(idleDelay) => save({ idleDelay })} />
        </Row>
        <Row title={t("Brief interval")} description={t("Refresh the top-level brief at this interval.")}>
          <Stepper value={settings.briefInterval} unit={t("minutes")} min={1} max={15} label={t("Brief interval")} onChange={(briefInterval) => save({ briefInterval })} />
        </Row>
        <Row title={t("Summary length")} description={t("Controls how much detail the brief and chapters keep.")}>
          <Choice value={settings.summaryLength} label={t("Summary length")} onChange={(summaryLength) => save({ summaryLength })} options={[{ value: "concise", label: t("Concise") }, { value: "standard", label: t("Standard") }, { value: "detailed", label: t("Detailed") }]} />
        </Row>
        <Row title={t("Summary model")} description={t("Use the active chat model or a lower-cost model.")}>
          <div className="settings-control-stack">
            <select className="settings-select" value={settings.summaryModel} aria-label={t("Summary model")} onChange={(event) => save({ summaryModel: event.target.value as JourneySummaryModel })}>
              <option value="current">{t("Current chat model")}</option>
              <option value="economy" disabled>{t("Economy model · not configured")}</option>
            </select>
            <span className="settings-control-note">{t("Economy model becomes available after it is configured.")} <button onClick={onOpenModels}>{t("Open Models")}</button></span>
          </div>
        </Row>
        <Row title={t("Update on turn end")} description={t("Recompute the brief when a turn completes.")}>
          <Toggle checked={settings.updateOnTurnEnd} label={t("Update on turn end")} onChange={(updateOnTurnEnd) => save({ updateOnTurnEnd })} />
        </Row>
        <Row title={t("Update on approval or error")} description={t("Recompute when an approval appears or a tool fails.")}>
          <Toggle checked={settings.updateOnApproval} label={t("Update on approval or error")} onChange={(updateOnApproval) => save({ updateOnApproval })} />
        </Row>
      </div>
    </section>

    <section className="settings-section">
      <h3 className="settings-section-title">{t("Evidence and pins")}</h3>
      <div className="settings-group">
        <Row title={t("Evidence ledger")} description={t("Show sources, files, artifacts, and open items.")}>
          <Toggle checked={settings.evidenceLedger} label={t("Evidence ledger")} onChange={(evidenceLedger) => save({ evidenceLedger })} />
        </Row>
        <Row title={t("Open items")} description={t("Show approvals and errors that still need attention.")}>
          <Toggle checked={settings.openClaims} label={t("Open items")} onChange={(openClaims) => save({ openClaims })} />
        </Row>
        <Row title={t("Max pinned items")} description={t("Keep key chapters and episodes at the top.")}>
          <Stepper value={settings.maxPinned} unit={t("items")} min={3} max={10} label={t("Max pinned items")} onChange={(maxPinned) => save({ maxPinned })} />
        </Row>
      </div>
    </section>

    <section className="settings-section">
      <h3 className="settings-section-title">{t("Advanced")}</h3>
      <p className="settings-group-note">{t("Chapter boundaries still follow turns in this build. The setting is saved for AI grouping.")}</p>
      <div className="settings-group">
        <Row title={t("Chapter detection")} description={t("AI groups by intent. Turns group by conversation turn.")}>
          <Choice value={settings.chapterDetection} label={t("Chapter detection")} onChange={(chapterDetection) => save({ chapterDetection })} options={[{ value: "ai", label: t("AI") }, { value: "turns", label: t("Turns") }]} />
        </Row>
        <Row title={t("Summary token budget")} description={t("Upper bound for one summary call.")}>
          <Stepper value={settings.summaryTokenBudget} unit={t("tokens")} min={200} max={800} step={50} label={t("Summary token budget")} onChange={(summaryTokenBudget) => save({ summaryTokenBudget })} />
        </Row>
      </div>
    </section>

    <div className="settings-reset-row">
      <div><strong>{t("Reset Journey settings")}</strong><p>{t("Restore every Journey option to its default. This does not delete trajectory data.")}</p></div>
      <button className="settings-reset-button" onClick={() => void onReset()}>{t("Reset to defaults")}</button>
    </div>
  </div>;
}
