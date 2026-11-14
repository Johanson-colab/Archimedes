import { useUISettings } from "../i18n";
import { SettingsChoiceGroup, SettingsRow, SettingsSection, SettingsSwitch } from "../SettingsPrimitives";
import type { SessionSnapshotFormat, SessionToolPreferences } from "../session-tools";

type PanelProps = {
  preferences: SessionToolPreferences;
  onChange: (patch: Partial<SessionToolPreferences>) => void;
};

export function CommentsSettingsPanel({ preferences, onChange }: PanelProps) {
  const { t } = useUISettings();
  return <div className="settings-sections">
    <SettingsSection title={t("Conversation toolbar")}>
      <div className="settings-group">
        <SettingsRow
          title={t("Show comments button")}
          description={t("Add the comments tool to the conversation toolbar.")}
        >
          <SettingsSwitch checked={preferences.showComments} label={t("Show comments button")} onChange={(showComments) => onChange({ showComments })} />
        </SettingsRow>
        <SettingsRow
          title={t("Show resolved comments by default")}
          description={t("Open comments with resolved threads visible.")}
        >
          <SettingsSwitch checked={preferences.commentsShowResolved} label={t("Show resolved comments by default")} onChange={(commentsShowResolved) => onChange({ commentsShowResolved })} />
        </SettingsRow>
      </div>
    </SettingsSection>
    <p className="settings-group-note">{t("Comments stay with the project and sync only when collaboration is available.")}</p>
  </div>;
}

const FORMATS: Array<{ value: SessionSnapshotFormat; label: string }> = [
  { value: "md", label: "Markdown" },
  { value: "json", label: "JSON" },
  { value: "png", label: "Long image (PNG)" },
];

export function SnapshotSettingsPanel({ preferences, onChange }: PanelProps) {
  const { t } = useUISettings();
  return <div className="settings-sections">
    <SettingsSection title={t("Conversation toolbar")}>
      <div className="settings-group">
        <SettingsRow
          title={t("Show snapshot button")}
          description={t("Add the session snapshot tool to the conversation toolbar.")}
        >
          <SettingsSwitch checked={preferences.showSnapshots} label={t("Show snapshot button")} onChange={(showSnapshots) => onChange({ showSnapshots })} />
        </SettingsRow>
      </div>
    </SettingsSection>

    <SettingsSection title={t("Export defaults")}>
      <div className="settings-group">
        <SettingsRow
          title={t("Default export format")}
          description={t("Used when the snapshot dialog opens.")}
        >
          <SettingsChoiceGroup
            value={preferences.snapshotFormat}
            label={t("Default export format")}
            options={FORMATS.map((format) => ({ value: format.value, label: t(format.label) }))}
            onChange={(snapshotFormat) => onChange({ snapshotFormat })}
          />
        </SettingsRow>
        <SettingsRow
          title={t("Include sources by default")}
          description={t("Start new exports with referenced sources included.")}
        >
          <SettingsSwitch checked={preferences.snapshotSources} label={t("Include sources by default")} onChange={(snapshotSources) => onChange({ snapshotSources })} />
        </SettingsRow>
        <SettingsRow
          title={t("Include diagnostic events by default")}
          description={t("Diagnostics may include local paths and commands. Leave this off unless you need them.")}
          hint={t("Only affects new exports; you can still change it per export.")}
        >
          <SettingsSwitch checked={preferences.snapshotDiagnostics} label={t("Include diagnostic events by default")} onChange={(snapshotDiagnostics) => onChange({ snapshotDiagnostics })} />
        </SettingsRow>
      </div>
      <p className="settings-group-note">{t("Snapshots are exported locally. Guest links remain separate and can be revoked.")}</p>
    </SettingsSection>
  </div>;
}
