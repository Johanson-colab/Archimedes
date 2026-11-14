import type { CSSProperties } from "react";
import { TEXT_SIZE_SCALE, useUISettings, type ChatVerbosity, type Language, type TextSize } from "../i18n";
import { SettingsChoiceGroup, SettingsRow, SettingsSection } from "../SettingsPrimitives";
import ArchimedesMark from "../brand/ArchimedesMark";

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

export default function GeneralSettingsPanel() {
  const { language, setLanguage, textSize, setTextSize, chatVerbosity, setChatVerbosity, t } = useUISettings();
  const sizeIndex = Math.max(0, textSizeSteps.findIndex((item) => item.id === textSize));
  const activeSize = textSizeSteps[sizeIndex] ?? textSizeSteps[2];
  const activeVerbosity = verbosityOptions.find((item) => item.id === chatVerbosity) ?? verbosityOptions[1];

  return <div className="settings-sections">
    <SettingsSection title={t("Interface")}>
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
              style={{ "--settings-slider-progress": `${(sizeIndex / (textSizeSteps.length - 1)) * 100}%` } as CSSProperties}
              onChange={(event) => setTextSize(textSizeSteps[Number(event.target.value)]?.id ?? "default")}
            />
            <div className="settings-slider-scale">
              {textSizeSteps.map((item) => <button key={item.id} type="button" className={textSize === item.id ? "active" : ""} aria-pressed={textSize === item.id} onClick={() => setTextSize(item.id)}>{t(item.label)}</button>)}
            </div>
          </div>
        </SettingsRow>
      </div>
    </SettingsSection>

    <SettingsSection title={t("Conversation")}>
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
    </SettingsSection>

    <SettingsSection title={t("About")}>
      <div className="settings-about settings-about-section">
        <ArchimedesMark className="settings-about-logo" size={88} decorative />
        <strong>Archimedes</strong>
        <p>{t("Local-first AI for research.")}</p>
        <dl><dt>{t("Version")}</dt><dd>0.1.0</dd></dl>
      </div>
    </SettingsSection>
  </div>;
}
