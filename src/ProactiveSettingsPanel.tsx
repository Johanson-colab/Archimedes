import { useEffect, useState } from "react";
import { Check, LoaderCircle, Network, Save, X } from "lucide-react";
import { useUISettings } from "./i18n";
import { SettingsChoiceGroup, SettingsRow, SettingsSection, SettingsSwitch } from "./SettingsPrimitives";
import { providers } from "./ModelSettingsModal";
import type { ProactiveSettings } from "./proactive-types";

const MODES: Array<{ id: ProactiveSettings["mode"]; label: string; description: string }> = [
  { id: "off", label: "Off", description: "No signals, no suggestions. Nothing is collected." },
  { id: "manual", label: "Manual", description: "Only when you ask Proactive agent to look at the current context." },
  { id: "auto", label: "Auto", description: "Watch L0 signals and observe the active context in seconds-level bursts." },
  { id: "random", label: "Random", description: "Stay closed until Proactive agent has something to say, then pop up automatically." },
];

export default function ProactiveSettingsPanel({
  settings,
  onChange,
  onObserveOnce,
  onResetHistory,
  bridge,
  historyCount,
  canObserve,
}: {
  settings: ProactiveSettings;
  onChange: (patch: Partial<ProactiveSettings>) => void;
  onObserveOnce: () => void;
  onResetHistory: () => void;
  bridge: ResearchDeskBridge;
  historyCount: number;
  canObserve: boolean;
}) {
  const { t } = useUISettings();
  const setSource = (key: keyof ProactiveSettings["sources"], value: boolean) => {
    onChange({ sources: { ...settings.sources, [key]: value } });
  };
  const activeMode = MODES.find((mode) => mode.id === settings.mode) ?? MODES[0];
  const [modelConfig, setModelConfig] = useState<PublicModelConfig | null>(null);
  const [provider, setProvider] = useState<ModelProviderId>("custom");
  const [baseUrl, setBaseUrl] = useState("");
  const [modelName, setModelName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [modelLoading, setModelLoading] = useState(true);
  const [modelSaving, setModelSaving] = useState(false);
  const [modelTesting, setModelTesting] = useState(false);
  const [modelFeedback, setModelFeedback] = useState<{ kind: "idle" | "success" | "error"; text: string }>({ kind: "idle", text: "" });
  const selectedProvider = providers.find((item) => item.id === provider) ?? providers.at(-1)!;

  useEffect(() => {
    let cancelled = false;
    setModelLoading(true);
    void bridge.getModelConfig("proactive").then((config) => {
      if (cancelled) return;
      setModelConfig(config);
      setProvider(config.provider);
      setBaseUrl(config.baseUrl);
      setModelName(config.model);
      setApiKey("");
    }).catch((error) => {
      if (!cancelled) setModelFeedback({ kind: "error", text: String(error).replace(/^Error:\s*/, "") });
    }).finally(() => {
      if (!cancelled) setModelLoading(false);
    });
    return () => { cancelled = true; };
  }, [bridge]);

  function applyModelConfig(config: PublicModelConfig) {
    setModelConfig(config);
    setProvider(config.provider);
    setBaseUrl(config.baseUrl);
    setModelName(config.model);
    setApiKey("");
  }

  function chooseProvider(nextId: ModelProviderId) {
    setProvider(nextId);
    setApiKey("");
    setModelFeedback({ kind: "idle", text: "" });
    const next = providers.find((item) => item.id === nextId);
    if (next && next.id !== "custom") {
      setBaseUrl(next.baseUrl);
      setModelName(next.models[0] || "");
    } else {
      setBaseUrl("");
      setModelName("");
    }
  }

  async function saveModel() {
    setModelSaving(true);
    setModelFeedback({ kind: "idle", text: "" });
    try {
      const config = await bridge.saveModelConfig({ provider, baseUrl, model: modelName, apiKey }, "proactive");
      applyModelConfig(config);
      setModelFeedback({ kind: "success", text: `Saved ${config.model}. Proactive replies and live observation will use this model.` });
    } catch (error) {
      setModelFeedback({ kind: "error", text: String(error).replace(/^Error:\s*/, "") });
    } finally {
      setModelSaving(false);
    }
  }

  async function testModel() {
    setModelTesting(true);
    setModelFeedback({ kind: "idle", text: "" });
    try {
      const result = await bridge.testModelConfig({ provider, baseUrl, model: modelName, apiKey }, "proactive");
      setModelFeedback({ kind: "success", text: `Connected in ${result.latencyMs} ms · ${result.resolvedModel}` });
    } catch (error) {
      setModelFeedback({ kind: "error", text: String(error).replace(/^Error:\s*/, "") });
    } finally {
      setModelTesting(false);
    }
  }

  async function useMainAgentModel() {
    setModelSaving(true);
    setModelFeedback({ kind: "idle", text: "" });
    try {
      const config = await bridge.saveModelConfig({ provider, baseUrl, model: modelName, apiKey, useAgent: true }, "proactive");
      applyModelConfig(config);
      setModelFeedback({ kind: "success", text: "Proactive agent will inherit the main Agent's model." });
    } catch (error) {
      setModelFeedback({ kind: "error", text: String(error).replace(/^Error:\s*/, "") });
    } finally {
      setModelSaving(false);
    }
  }

  return <div className="settings-sections">
    <p className="settings-group-note">{t("A quiet research sidekick. It reads app context; screenshots are opt-in, app-only, and never written to disk.")}</p>

    <SettingsSection title={t("Mode")}>
      <div className="settings-group">
        <SettingsRow
          title={t("Proactive mode")}
          description={t("Proactive is opt-in. Off is the default.")}
          hint={t(activeMode.description)}
        >
          <SettingsChoiceGroup
            value={settings.mode}
            label={t("Proactive mode")}
            options={MODES.map((mode) => ({ value: mode.id, label: t(mode.label) }))}
            onChange={(mode) => onChange({ mode })}
          />
        </SettingsRow>
      </div>
    </SettingsSection>

    <SettingsSection title={t("Model")}>
      <div className="settings-group">
        <SettingsRow
          stacked
          className="proactive-model-row"
          controlClassName="proactive-model-form"
          title={t("Proactive model")}
          description={t("Replies and live observation use this model. It can inherit the main Agent model or use a cheaper one.")}
          hint={modelConfig?.inheritedFromAgent ? t("Currently inheriting the main Agent model.") : t("A dedicated Proactive model.")}
        >
            {modelLoading ? <div className="proactive-model-loading"><LoaderCircle className="spin" size={15} />{t("Loading configuration")}</div> : <>
              <label className="proactive-model-field">
                <span>{t("Provider")}</span>
                <select className="settings-select" value={provider} onChange={(event) => chooseProvider(event.target.value as ModelProviderId)}>
                  {providers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              <label className="proactive-model-field">
                <span>{t("Model")}</span>
                <input
                  className="settings-text-input"
                  value={modelName}
                  onChange={(event) => setModelName(event.target.value)}
                  list="proactive-model-catalog"
                  placeholder={t("Model identifier")}
                  spellCheck={false}
                />
                <datalist id="proactive-model-catalog">
                  {selectedProvider.models.map((name) => <option key={name} value={name} />)}
                </datalist>
              </label>
              <label className="proactive-model-field wide">
                <span>{t("Base URL")}</span>
                <input className="settings-text-input" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.example.com/v1" spellCheck={false} />
              </label>
              <label className="proactive-model-field wide">
                <span>{t("API key")}</span>
                <input className="settings-text-input" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={modelConfig?.hasApiKey ? t("Saved securely · enter a new key to replace") : t("Enter API key")} autoComplete="off" spellCheck={false} />
              </label>
              <label className="proactive-model-vision">
                <input
                  type="checkbox"
                  checked={settings.visionCapable}
                  onChange={(event) => onChange({ visionCapable: event.target.checked, ...(event.target.checked ? {} : { appCapture: false }) })}
                />
                <span>{t("This model accepts images")}</span>
              </label>
              <p className="proactive-model-vision-note">{t("Only vision-capable models can enable Visual observation below.")}</p>
              <div className="proactive-model-actions">
                <button className="secondary-button" onClick={() => void saveModel()} disabled={modelLoading || modelSaving || modelTesting || !baseUrl.trim() || !modelName.trim()}>
                  {modelSaving ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />}{t("Save model")}
                </button>
                <button className="secondary-button" onClick={() => void testModel()} disabled={modelLoading || modelSaving || modelTesting || !baseUrl.trim() || !modelName.trim()}>
                  {modelTesting ? <LoaderCircle className="spin" size={14} /> : <Network size={14} />}{t("Test connection")}
                </button>
                <button className="secondary-button" onClick={() => void useMainAgentModel()} disabled={modelLoading || modelSaving || modelTesting || modelConfig?.inheritedFromAgent}>
                  {t("Use main Agent model")}
                </button>
              </div>
              {modelFeedback.text && <div className={`model-feedback ${modelFeedback.kind}`}>{modelFeedback.kind === "success" ? <Check size={14} /> : <X size={14} />}<span>{modelFeedback.text}</span></div>}
            </>}
        </SettingsRow>
      </div>
      <p className="settings-group-note">{t("The API key stays in Electron user data. Proactive never shares the main Agent's conversation unless it is part of the current context.")}</p>
    </SettingsSection>

    <SettingsSection title={t("What it watches")}>
      <p className="settings-group-note">{t("Only L0 signals from inside Archimedes.")}</p>
      <div className="settings-group">
        <SettingsRow title={t("Search with 0 results")} description={t("Offer the likely term when a paper search misses.")} hint={t("L0 · app context")}>
          <SettingsSwitch checked={settings.sources.search} label={t("Search with 0 results")} onChange={(value) => setSource("search", value)} />
        </SettingsRow>
        <SettingsRow title={t("Repeated passage selection")} description={t("Notice when the same passage is selected more than once.")} hint={t("L0 · app context")}>
          <SettingsSwitch checked={settings.sources.selection} label={t("Repeated passage selection")} onChange={(value) => setSource("selection", value)} />
        </SettingsRow>
        <SettingsRow title={t("LaTeX build failure")} description={t("Turn the first diagnostic into a fix request with the file and line.")} hint={t("L0 · app context")}>
          <SettingsSwitch checked={settings.sources.latex} label={t("LaTeX build failure")} onChange={(value) => setSource("latex", value)} />
        </SettingsRow>
        <SettingsRow title={t("Uncited claims")} description={t("Manual review of the latest answer; never runs on its own.")} hint={t("Manual only")}>
          <SettingsSwitch checked={settings.sources.citation} label={t("Uncited claims")} onChange={(value) => setSource("citation", value)} />
        </SettingsRow>
        <SettingsRow title={t("Library radar")} description={t("Sum up papers added to your library in the last 24 hours.")} hint={t("Once a day")}>
          <SettingsSwitch checked={settings.sources.library} label={t("Library radar")} onChange={(value) => setSource("library", value)} />
        </SettingsRow>
      </div>
      <p className="settings-group-note">{t("Activity metadata stays local. Window titles and keystroke content are never read.")}</p>
    </SettingsSection>

    <SettingsSection title={t("Visual observation")}>
      <div className="settings-group">
        <SettingsRow
          title={t("App screenshots")}
          description={t("Capture only Archimedes' own window while you are active. Images are sent to the Proactive model in memory and discarded after the call.")}
          hint={settings.visionCapable ? t("L2 · Archimedes window only") : t("Requires a vision-capable model")}
        >
          <SettingsSwitch checked={settings.appCapture} label={t("App screenshots")} disabled={!settings.visionCapable} onChange={(appCapture) => onChange({ appCapture })} />
        </SettingsRow>
      </div>
      {!settings.visionCapable && <p className="settings-group-note warning">{t("Mark the Proactive model as vision-capable above before enabling Visual observation.")}</p>}
      <p className="settings-group-note">{t("No desktop capture and no other windows. The floating Proactive panel is hidden before each capture; the image is never written to disk.")}</p>
    </SettingsSection>

    <SettingsSection title={t("Rhythm")}>
      <div className="settings-group">
        <SettingsRow title={t("Daily budget")} description={t("Auto suggestions created per day. Manual reviews are not counted.")}>
          <input
            className="settings-text-input proactive-budget-input"
            type="number"
            min={1}
            max={20}
            value={settings.dailyBudget}
            aria-label={t("Daily budget")}
            onChange={(event) => onChange({ dailyBudget: Math.min(20, Math.max(1, Number(event.target.value) || 1)) })}
          />
        </SettingsRow>
        <SettingsRow title={t("Live observation")} description={t("While you are active, look at the current context every few seconds. The interval follows pointer and typing activity.")}>
          <SettingsSwitch checked={settings.liveObservation} label={t("Live observation")} onChange={(liveObservation) => onChange({ liveObservation })} />
        </SettingsRow>
        <SettingsRow title={t("Live observation budget")} description={t("Model calls per day for live observation. Suggestions have their own budget above.")}>
          <input
            className="settings-text-input proactive-budget-input"
            type="number"
            min={0}
            max={1000}
            value={settings.liveObservationBudget}
            aria-label={t("Live observation budget")}
            onChange={(event) => onChange({ liveObservationBudget: Math.min(1000, Math.max(0, Number(event.target.value) || 0)) })}
          />
        </SettingsRow>
        <SettingsRow title={t("Quiet hours")} description={t("Suggestions stay queued and only light the toolbar badge.")}>
          <div className="settings-inline-control">
            <SettingsSwitch checked={settings.quietHours.enabled} label={t("Quiet hours")} onChange={(enabled) => onChange({ quietHours: { ...settings.quietHours, enabled } })} />
            <input className="settings-text-input proactive-time-input" type="time" value={settings.quietHours.start} disabled={!settings.quietHours.enabled} aria-label={t("Quiet hours start")} onChange={(event) => onChange({ quietHours: { ...settings.quietHours, start: event.target.value } })} />
            <span className="settings-control-label">{t("to")}</span>
            <input className="settings-text-input proactive-time-input" type="time" value={settings.quietHours.end} disabled={!settings.quietHours.enabled} aria-label={t("Quiet hours end")} onChange={(event) => onChange({ quietHours: { ...settings.quietHours, end: event.target.value } })} />
          </div>
        </SettingsRow>
      </div>
      <p className="settings-group-note">{t("Composer focused → badge only · 3 dismissals → 2h pause · No evidence → never shown")}</p>
    </SettingsSection>

    <SettingsSection title={t("Manual review")}>
      <div className="settings-group">
        <SettingsRow title={t("Review the current context")} description={t("Run one full observation now: current view, selection, recent answers, and activity. Nothing continues in the background.")}>
          <button className="secondary-button" onClick={onObserveOnce} disabled={!canObserve}>{t("Observe once")}</button>
        </SettingsRow>
        <SettingsRow title={t("Suggestion history")} description={t("{count} suggestions retained for 30 days", { count: historyCount })}>
          <button className="settings-reset-button" onClick={onResetHistory} disabled={!historyCount}>{t("Clear history")}</button>
        </SettingsRow>
      </div>
    </SettingsSection>
  </div>;
}
