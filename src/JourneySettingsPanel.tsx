import { useEffect, useState } from "react";
import { useUISettings } from "./i18n";
import { SettingsChoiceGroup, SettingsRow, SettingsSection, SettingsSwitch } from "./SettingsPrimitives";

type JourneySettingsPanelProps = {
  settings: JourneySettings;
  onChange: (patch: Partial<JourneySettings>) => Promise<void>;
  onReset: () => Promise<void>;
  onOpenModels: () => void;
};

function TextField({ value, label, placeholder, onChange }: { value: string; label: string; placeholder: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const next = draft.trim();
    if (next !== value) onChange(next);
  };
  return <input
    className="settings-text-input"
    value={draft}
    aria-label={label}
    placeholder={placeholder}
    onChange={(event) => setDraft(event.target.value)}
    onBlur={commit}
    onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commit(); event.currentTarget.blur(); } }}
  />;
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

    <SettingsSection>
      <h3 className="settings-section-title">{t("View")}</h3>
      <div className="settings-group">
        <SettingsRow title={t("Default view")} description={t("Story reads like a brief. Outline is a tree for navigating long runs.")}>
          <SettingsChoiceGroup value={settings.defaultView} label={t("Default view")} onChange={(defaultView) => save({ defaultView })} options={[{ value: "story", label: t("Story") }, { value: "outline", label: t("Outline") }]} />
        </SettingsRow>
        <SettingsRow title={t("Map")} description={t("Open the structural map automatically when the journey gets long.")}>
          <SettingsChoiceGroup value={settings.mapMode} label={t("Map")} onChange={(mapMode) => save({ mapMode })} options={[{ value: "auto", label: t("Auto") }, { value: "always", label: t("Always") }, { value: "off", label: t("Off") }]} />
        </SettingsRow>
        <SettingsRow stacked title={t("Map threshold")} description={t("Auto opens the map at whichever threshold comes first.")}>
          <div className="settings-threshold">
            <Stepper value={settings.mapChapters} unit={t("chapters")} min={4} max={20} label={t("Map chapters")} disabled={settings.mapMode !== "auto"} onChange={(mapChapters) => save({ mapChapters })} />
            <span className="settings-threshold-or">{t("or")}</span>
            <Stepper value={settings.mapSteps} unit={t("steps")} min={50} max={500} step={10} label={t("Map steps")} disabled={settings.mapMode !== "auto"} onChange={(mapSteps) => save({ mapSteps })} />
          </div>
        </SettingsRow>
        <SettingsRow title={t("Since you left")} description={t("Show new steps, sources, and pending approvals after a break.")}>
          <SettingsSwitch checked={settings.sinceYouLeft} label={t("Since you left")} onChange={(sinceYouLeft) => save({ sinceYouLeft })} />
        </SettingsRow>
        <SettingsRow title={t("Follow live")} description={t("Keep new activity below your reading position. Jump to latest when you scroll up.")}>
          <SettingsSwitch checked={settings.followLive} label={t("Follow live")} onChange={(followLive) => save({ followLive })} />
        </SettingsRow>
      </div>
    </SettingsSection>

    <SettingsSection>
      <h3 className="settings-section-title">{t("Chapters")}</h3>
      <div className="settings-group">
        <SettingsRow title={t("Max chapters")} description={t("Older chapters merge after this limit.")}>
          <Stepper value={settings.maxChapters} unit={t("chapters")} min={6} max={16} label={t("Max chapters")} onChange={(maxChapters) => save({ maxChapters })} />
        </SettingsRow>
        <SettingsRow title={t("Auto-merge")} description={t("Merge completed chapters instead of hiding them.")}>
          <SettingsSwitch checked={settings.autoMerge} label={t("Auto-merge")} onChange={(autoMerge) => save({ autoMerge })} />
        </SettingsRow>
        <SettingsRow title={t("Collapse completed")} description={t("Keep only the current chapter expanded.")}>
          <SettingsSwitch checked={settings.collapseCompleted} label={t("Collapse completed")} onChange={(collapseCompleted) => save({ collapseCompleted })} />
        </SettingsRow>
        <SettingsRow title={t("Target episodes")} description={t("Used when chapter boundaries are proposed.")}>
          <Stepper value={settings.targetEpisodes} unit={t("episodes")} min={3} max={6} label={t("Target episodes")} onChange={(targetEpisodes) => save({ targetEpisodes })} />
        </SettingsRow>
      </div>
    </SettingsSection>

    <SettingsSection>
      <h3 className="settings-section-title">{t("Summaries")}</h3>
      <p className="settings-group-note">{t("Changes apply to the next summary. Cadence and length affect model cost.")}</p>
      <div className="settings-group">
        <SettingsRow title={t("Live summaries")} description={t("Update while the agent is running. Off updates only at turn end.")}>
          <SettingsSwitch checked={settings.liveSummaries} label={t("Live summaries")} onChange={(liveSummaries) => save({ liveSummaries })} />
        </SettingsRow>
        <SettingsRow title={t("Episode cadence")} description={t("Summarize after this many meaningful events.")}>
          <Stepper value={settings.episodeCadence} unit={t("events")} min={6} max={24} label={t("Episode cadence")} disabled={!settings.liveSummaries} onChange={(episodeCadence) => save({ episodeCadence })} />
        </SettingsRow>
        <SettingsRow title={t("Idle delay")} description={t("Or after this much quiet time.")}>
          <Stepper value={settings.idleDelay} unit={t("seconds")} min={20} max={180} step={10} label={t("Idle delay")} disabled={!settings.liveSummaries} onChange={(idleDelay) => save({ idleDelay })} />
        </SettingsRow>
        <SettingsRow title={t("Brief interval")} description={t("Refresh the top-level brief at this interval.")}>
          <Stepper value={settings.briefInterval} unit={t("minutes")} min={1} max={15} label={t("Brief interval")} onChange={(briefInterval) => save({ briefInterval })} />
        </SettingsRow>
        <SettingsRow title={t("Summary length")} description={t("Controls how much detail the brief and chapters keep.")}>
          <SettingsChoiceGroup value={settings.summaryLength} label={t("Summary length")} onChange={(summaryLength) => save({ summaryLength })} options={[{ value: "concise", label: t("Concise") }, { value: "standard", label: t("Standard") }, { value: "detailed", label: t("Detailed") }]} />
        </SettingsRow>
        <SettingsRow title={t("Summary model")} description={t("Use the active chat model or a lower-cost model.")}>
          <div className="settings-control-stack">
            <select className="settings-select" value={settings.summaryModel} aria-label={t("Summary model")} onChange={(event) => save({ summaryModel: event.target.value as JourneySummaryModel })}>
              <option value="current">{t("Current chat model")}</option>
              <option value="economy" disabled={!settings.economyModel}>{settings.economyModel ? t("Economy model") : t("Economy model · not configured")}</option>
            </select>
            <span className="settings-control-label">{t("Economy model name")}</span>
            <TextField
              value={settings.economyModel}
              label={t("Economy model name")}
              placeholder={t("e.g. gpt-4.1-mini")}
              onChange={(economyModel) => save({ economyModel, ...(economyModel ? {} : { summaryModel: "current" as JourneySummaryModel }) })}
            />
            <span className="settings-control-note">{t("Economy model uses the same provider and API key.")} <button onClick={onOpenModels}>{t("Open Models")}</button></span>
          </div>
        </SettingsRow>
        <SettingsRow title={t("Update on turn end")} description={t("Recompute the brief when a turn completes.")}>
          <SettingsSwitch checked={settings.updateOnTurnEnd} label={t("Update on turn end")} onChange={(updateOnTurnEnd) => save({ updateOnTurnEnd })} />
        </SettingsRow>
        <SettingsRow title={t("Update on approval or error")} description={t("Recompute when an approval appears or a tool fails.")}>
          <SettingsSwitch checked={settings.updateOnApproval} label={t("Update on approval or error")} onChange={(updateOnApproval) => save({ updateOnApproval })} />
        </SettingsRow>
      </div>
    </SettingsSection>

    <SettingsSection>
      <h3 className="settings-section-title">{t("Evidence and pins")}</h3>
      <div className="settings-group">
        <SettingsRow title={t("Evidence ledger")} description={t("Show sources, files, artifacts, and pending items.")}>
          <SettingsSwitch checked={settings.evidenceLedger} label={t("Evidence ledger")} onChange={(evidenceLedger) => save({ evidenceLedger })} />
        </SettingsRow>
        <SettingsRow title={t("Show claims")} description={t("Show claims and their evidence status.")}>
          <SettingsSwitch checked={settings.openClaims} label={t("Show claims")} onChange={(openClaims) => save({ openClaims })} />
        </SettingsRow>
        <SettingsRow title={t("Max pinned items")} description={t("Keep key chapters and episodes at the top.")}>
          <Stepper value={settings.maxPinned} unit={t("items")} min={3} max={10} label={t("Max pinned items")} onChange={(maxPinned) => save({ maxPinned })} />
        </SettingsRow>
      </div>
    </SettingsSection>

    <SettingsSection>
      <h3 className="settings-section-title">{t("Advanced")}</h3>
      <p className="settings-group-note">{t("AI groups adjacent chapters into narrative units. Turn grouping keeps one chapter per conversation turn.")}</p>
      <div className="settings-group">
        <SettingsRow title={t("Chapter detection")} description={t("Group adjacent chapters by intent, or keep one chapter per turn.")}>
          <SettingsChoiceGroup value={settings.chapterDetection} label={t("Chapter detection")} onChange={(chapterDetection) => save({ chapterDetection })} options={[{ value: "ai", label: t("AI") }, { value: "turns", label: t("Turns") }]} />
        </SettingsRow>
        <SettingsRow title={t("Summary token budget")} description={t("Upper bound for one summary call.")}>
          <Stepper value={settings.summaryTokenBudget} unit={t("tokens")} min={200} max={800} step={50} label={t("Summary token budget")} onChange={(summaryTokenBudget) => save({ summaryTokenBudget })} />
        </SettingsRow>
      </div>
    </SettingsSection>

    <div className="settings-reset-row">
      <div><strong>{t("Reset Journey settings")}</strong><p>{t("Restore every Journey option to its default. This does not delete trajectory data.")}</p></div>
      <button className="settings-reset-button" onClick={() => void onReset()}>{t("Reset to defaults")}</button>
    </div>
  </div>;
}
