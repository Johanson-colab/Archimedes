import { useEffect, useId, useState } from "react";
import { Check, ChevronDown, LoaderCircle, Network, Save } from "lucide-react";
import openaiLogo from "./assets/providers/openai.png";
import { SettingsGroup, SettingsRow, SettingsSection } from "./SettingsPrimitives";
import { useUISettings } from "./i18n";

export default function AgentBackendSettings({ bridge, onBackendChange }: { bridge: ResearchDeskBridge; onBackendChange?: (backend: AgentBackendConfig["backend"]) => void }) {
  const { t } = useUISettings();
  const id = useId();
  const [config, setConfig] = useState<AgentBackendConfig>({ backend: "api", binary: "codex", model: "", effort: "", permissionMode: "read-only" });
  const [savedConfig, setSavedConfig] = useState<AgentBackendConfig | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState<"check" | "save" | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [connection, setConnection] = useState<"unchecked" | "connected" | "error">("unchecked");
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);
  const [models, setModels] = useState<NativeAgentModel[]>([]);
  useEffect(() => {
    let active = true;
    setSavedConfig(null);
    setLoadError("");
    void bridge.getAgentBackendConfig().then((value) => {
      if (active) { setConfig(value); setSavedConfig(value); onBackendChange?.(value.backend); }
    }).catch((error) => { if (active) setLoadError(String(error)); });
    return () => { active = false; };
  }, [bridge, loadAttempt, onBackendChange]);

  function edit(field: "binary" | "model", value: string) {
    setConfig((current) => ({ ...current, [field]: value, ...(field === "model" ? { effort: "" } : {}) }));
    setFeedback(null);
    setConnection("unchecked");
    if (field === "binary") setModels([]);
  }

  async function apply(action: "check" | "api" | "codex") {
    if (!savedConfig || busy) return;
    setBusy(action === "check" ? "check" : "save");
    setFeedback(null);
    try {
      if (action === "check") {
        const result = await bridge.checkAgentBackend({ ...config, backend: "codex" });
        setModels(result.models);
        setConnection(result.ready ? "connected" : "error");
        setFeedback({ error: !result.ready, text: t(result.message) });
      } else {
        const saved = await bridge.saveAgentBackendConfig({ ...(action === "api" ? savedConfig : config), backend: action });
        if (saved.binary !== config.binary || saved.model !== config.model) setConnection("unchecked");
        if (saved.binary !== config.binary) setModels([]);
        setConfig(saved);
        setSavedConfig(saved);
        onBackendChange?.(saved.backend);
        setFeedback({ error: false, text: t("Backend saved. Changes apply to the next main Work turn.") });
      }
    } catch (error) {
      if (action === "check") setConnection("error");
      setFeedback({ error: true, text: String(error).replace(/^Error invoking remote method '[^']+': Error:\s*|^Error:\s*/, "") });
    } finally { setBusy(null); }
  }

  const disabled = !savedConfig || busy !== null;
  const connectionLabel = busy === "check" ? t("Checking connection") : connection === "connected" ? t("Connected") : connection === "error" ? t("Connection failed") : t("Connection not checked");
  return <div className="agent-backend-settings">
    <p className="model-connection-description">{t("Use an installed agent with its own login, model configuration and native tools.")}</p>
    <SettingsSection>
      <SettingsGroup>
        <SettingsRow title={<>{t("Main Work runtime")} · {savedConfig ? (savedConfig.backend === "codex" ? "Codex" : t("API harness")) : t("Loading configuration")}</>} description={t("Paper chat, internal research workers and Proactive keep using API models.")}>
          {savedConfig?.backend === "api" ? <span className="agent-runtime-status agent-backend-active"><Check size={14} />{t("API harness active")}</span> : <button type="button" className="secondary-button" disabled={disabled} onClick={() => void apply("api")}>{t("Use API harness")}</button>}
        </SettingsRow>
      </SettingsGroup>
    </SettingsSection>

    {loadError && <div className="agent-backend-feedback error" role="alert"><span>{loadError}</span><button type="button" className="secondary-button" onClick={() => setLoadAttempt((value) => value + 1)}>{t("Reload configuration")}</button></div>}

    <section className="agent-backend-card" aria-label="Codex">
      <button type="button" className="agent-backend-card-toggle" aria-expanded={expanded} aria-controls={`${id}-config`} onClick={() => setExpanded((value) => !value)}>
        <span className="provider-icon large"><img className="provider-brand-logo" src={openaiLogo} alt="" /></span>
        <span className="agent-backend-card-copy"><strong>Codex</strong><small>{t("Local CLI · uses your existing Codex login")}</small></span>
        <span className={`agent-connection-status ${connection}`} aria-live="polite">{busy === "check" && <LoaderCircle className="spin" size={13} />}{connectionLabel}</span>
        {savedConfig?.backend === "codex" && <span className="agent-backend-active">{t("Backend active")}</span>}
        <ChevronDown className={expanded ? "expanded" : ""} size={17} />
      </button>
      <div id={`${id}-config`} hidden={!expanded}>
        <div className="agent-backend-fields">
          <SettingsRow stacked title={<label htmlFor={`${id}-binary`}>{t("Codex executable")}</label>} description={t("Use codex from PATH or an absolute executable path. Run codex login in a terminal first.")}>
            <input id={`${id}-binary`} className="settings-text-input settings-text-input-wide" disabled={disabled} value={config.binary} spellCheck={false} onChange={(event) => edit("binary", event.target.value)} />
          </SettingsRow>
          <SettingsRow stacked title={<label htmlFor={`${id}-model`}>{t("Codex model")}</label>} description={t("Leave empty to use your Codex configuration. API model settings do not select the Codex model.")}>
            <input id={`${id}-model`} className="settings-text-input settings-text-input-wide" disabled={disabled} list={`${id}-models`} value={config.model} spellCheck={false} onChange={(event) => edit("model", event.target.value)} />
            <datalist id={`${id}-models`}>{models.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</datalist>
          </SettingsRow>
          <SettingsRow stacked title={<label htmlFor={`${id}-effort`}>{t("Codex thinking effort")}</label>} description={t("Native model capabilities come from Check Codex. Leave default to use Codex configuration.")}>
            <select id={`${id}-effort`} className="settings-select" disabled={disabled} value={config.effort || ""} onChange={(event) => setConfig((current) => ({ ...current, effort: event.target.value }))}>
              <option value="">{t("Codex default")}</option>
              {models.find((item) => item.id === config.model)?.efforts?.map((effort) => <option value={effort} key={effort}>{effort}</option>)}
              {config.effort && !models.find((item) => item.id === config.model)?.efforts?.includes(config.effort) && <option value={config.effort}>{config.effort}</option>}
            </select>
          </SettingsRow>
          <SettingsRow stacked title={<label htmlFor={`${id}-permissions`}>{t("Codex permissions")}</label>} description={t("Read-only allows inspection. Workspace write allows edits and commands in the project. Additional access uses native approval.")}>
            <select id={`${id}-permissions`} className="settings-select" disabled={disabled} value={config.permissionMode || "read-only"} onChange={(event) => setConfig((current) => ({ ...current, permissionMode: event.target.value as AgentBackendConfig["permissionMode"] }))}>
              <option value="read-only">{t("Read-only")}</option>
              <option value="workspace-write">{t("Workspace write")}</option>
            </select>
          </SettingsRow>
        </div>
        <details className="agent-backend-limits">
          <summary>{t("Capabilities and permissions")}</summary>
          <p>{t("Codex owns execution and context. Archimedes displays native tool activity and approval requests. Plugin/skill attachments are not supported; source metadata does not mean a paper has been read.")}</p>
          <p>{t("Configured Codex MCP tools may access external services. Read-only does not prevent remote side effects.")}</p>
        </details>
        <div className="agent-backend-actions">
          <button type="button" className="secondary-button" disabled={disabled || !config.binary.trim()} onClick={() => void apply("check")}>{busy === "check" ? <LoaderCircle className="spin" size={14} /> : <Network size={14} />}{t("Check Codex")}</button>
          <button type="button" className="primary-button" disabled={disabled || !config.binary.trim()} onClick={() => void apply("codex")}>{busy === "save" ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />}{savedConfig?.backend === "codex" ? t("Save backend") : t("Use Codex")}</button>
        </div>
      </div>
    </section>
    {feedback && <div className={`agent-backend-feedback${feedback.error ? " error" : ""}`} role={feedback.error ? "alert" : "status"}>{feedback.text}</div>}
    <p className="agent-backend-note">{t("No Codex credentials are copied. Native tools differ from the API harness; failures never silently switch backends.")}</p>
  </div>;
}
