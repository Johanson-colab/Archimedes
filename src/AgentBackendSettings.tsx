import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, LoaderCircle, Network, Save } from "lucide-react";
import openaiLogo from "./assets/providers/openai.png";
import claudeLogo from "@lobehub/icons-static-svg/icons/claude-color.svg";
import opencodeLogo from "@lobehub/icons-static-svg/icons/opencode.svg";
import { SettingsGroup, SettingsRow, SettingsSection } from "./SettingsPrimitives";
import { useUISettings } from "./i18n";
import { MenuItem, MenuSurface } from "./Menu";

export default function AgentBackendSettings({ bridge, onBackendChange, active = true }: { bridge: ResearchDeskBridge; active?: boolean; onBackendChange?: (backend: AgentBackendConfig["backend"]) => void }) {
  const { t } = useUISettings();
  const id = useId();
  const [config, setConfig] = useState<AgentBackendConfig>({ backend: "api", binary: "codex", model: "", effort: "", permissionMode: "ask" });
  const [savedConfig, setSavedConfig] = useState<AgentBackendConfig | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState<"check" | "save" | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [effortOpen, setEffortOpen] = useState(false);
  const effortTrigger = useRef<HTMLButtonElement>(null);
  const [effectiveModelId, setEffectiveModelId] = useState<string>();
  useEffect(() => { if (!active) setEffortOpen(false); }, [active]);
  const [connections, setConnections] = useState<Partial<Record<"codex" | "claude" | "opencode", "unchecked" | "connected" | "error">>>({});
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);
  const [catalogs, setCatalogs] = useState<Partial<Record<"codex" | "claude" | "opencode", NativeAgentModel[]>>>({});
  const [selected, setSelected] = useState<"codex" | "claude" | "opencode">("codex");
  const [drafts, setDrafts] = useState<AgentBackendConfig["profiles"]>({});
  const labels = { codex: "Codex", claude: "Claude Code", opencode: "OpenCode", api: "Archimedes" };
  const name = labels[selected];
  const models = catalogs[selected] || [];
  const nativeModel = models.find((model) => model.id === (config.model || effectiveModelId));
  const effortLabel = (effort: string) => ({ low: "Low", medium: "Medium", high: "High", xhigh: "XHigh", max: "Max", ultra: "Ultra", minimal: "Minimal", none: "None" }[effort] || effort);
  const setModels = (value: NativeAgentModel[]) => setCatalogs((current) => ({ ...current, [selected]: value }));
  const setConnection = (value: "unchecked" | "connected" | "error") => setConnections((current) => ({ ...current, [selected]: value }));
  const fields = (value: AgentBackendProfile): AgentBackendProfile => ({ binary: value.binary, model: value.model, ...(value.effort !== undefined ? { effort: value.effort } : {}), ...(value.permissionMode ? { permissionMode: value.permissionMode } : {}) });
  function choose(next: typeof selected) {
    const profiles = { ...drafts, [selected]: fields(config) };
    setDrafts(profiles);
    setEffortOpen(false);
    setSelected(next);
    setConfig({ backend: next, binary: next, model: "", effort: "", ...profiles[next], permissionMode: next === "codex" && ["read-only", "workspace-write"].includes(profiles[next]?.permissionMode || "") ? "ask" : profiles[next]?.permissionMode || "ask" });
    setFeedback(null);
  }
  useEffect(() => {
    let active = true;
    setSavedConfig(null);
    setLoadError("");
    void bridge.getAgentBackendConfig().then((value) => {
      if (active) {
        const next = value.backend === "api" ? "codex" : value.backend;
        setSelected(next); setConfig({ backend: next, ...fields(value), permissionMode: next === "codex" && ["read-only", "workspace-write"].includes(value.permissionMode || "") ? "ask" : value.permissionMode || "ask" }); setDrafts(value.profiles || {});
        setSavedConfig(value); onBackendChange?.(value.backend);
      }
    }).catch((error) => { if (active) setLoadError(String(error)); });
    return () => { active = false; };
  }, [bridge, loadAttempt, onBackendChange]);

  function edit(field: "binary" | "model", value: string) {
    setConfig((current) => ({ ...current, [field]: value, ...(field === "model" ? { effort: "" } : {}) }));
    setFeedback(null);
    if (field === "model") setEffectiveModelId(undefined);
    setConnection("unchecked");
    if (field === "binary") { setModels([]); setEffectiveModelId(undefined); }
  }

  async function apply(action: "check" | AgentBackendConfig["backend"]) {
    if (!savedConfig || busy) return;
    setBusy(action === "check" ? "check" : "save");
    setFeedback(null);
    try {
      if (action === "check") {
        const result = await bridge.checkAgentBackend({ ...config, backend: selected });
        setModels(result.models);
        setEffectiveModelId(result.effectiveModelId);
        setConnection(result.ready ? "connected" : "error");
        setFeedback({ error: !result.ready, text: t(result.message) });
      } else {
        const apiProfile = savedConfig.profiles?.codex || (savedConfig.backend === "codex" || savedConfig.backend === "api" ? savedConfig : { binary: "codex", model: "", effort: "", permissionMode: "ask" as const });
        const saved = await bridge.saveAgentBackendConfig({ ...fields(action === "api" ? apiProfile : config), backend: action });
        if (action !== "api") {
          if (saved.binary !== config.binary || saved.model !== config.model) setConnection("unchecked");
          if (saved.binary !== config.binary) setModels([]);
          setConfig({ backend: action, ...fields(saved) });
        }
        setSavedConfig(saved);
        setDrafts((current) => ({ ...current, [selected]: fields(config) }));
        onBackendChange?.(saved.backend);
        setFeedback({ error: false, text: t("Backend saved. Changes apply to the next main Work turn.") });
      }
    } catch (error) {
      if (action === "check") setConnection("error");
      setFeedback({ error: true, text: String(error).replace(/^Error invoking remote method '[^']+': Error:\s*|^Error:\s*/, "") });
    } finally { setBusy(null); }
  }

  const disabled = !savedConfig || busy !== null;
  const connectionLabel = (item: typeof selected) => busy === "check" && selected === item ? t("Checking connection") : connections[item] === "connected" ? t("Connected") : connections[item] === "error" ? t("Connection failed") : t("Connection not checked");
  return <div className="agent-backend-settings">
    <p className="model-connection-description">{t("Use an installed agent with its own login, model configuration and native tools.")}</p>
    <SettingsSection>
      <SettingsGroup>
        <SettingsRow title={<>{t("Main Work runtime")} · {savedConfig ? labels[savedConfig.backend] : t("Loading configuration")}</>} description={t("Paper chat, internal research workers and Proactive keep using API models.")}>
          {savedConfig?.backend === "api" ? <span className="agent-runtime-status agent-backend-active"><Check size={14} />{t("API harness active")}</span> : <button type="button" className="secondary-button" disabled={disabled} onClick={() => void apply("api")}>{t("Use API harness")}</button>}
        </SettingsRow>
      </SettingsGroup>
    </SettingsSection>

    {loadError && <div className="agent-backend-feedback error" role="alert"><span>{loadError}</span><button type="button" className="secondary-button" onClick={() => setLoadAttempt((value) => value + 1)}>{t("Reload configuration")}</button></div>}

    <div className="agent-backend-list">
    {(["codex", "claude", "opencode"] as const).map((item) => <section key={item} className="agent-backend-card" aria-label={labels[item]}>
      <button type="button" className="agent-backend-card-toggle" disabled={disabled} aria-label={labels[item]} aria-expanded={expanded && selected === item} aria-controls={`${id}-${item}-config`} onClick={() => {
        setEffortOpen(false);
        if (selected === item) setExpanded((value) => !value);
        else { choose(item); setExpanded(true); }
      }}>
        <span className="provider-icon large"><img className="provider-brand-logo" src={item === "codex" ? openaiLogo : item === "claude" ? claudeLogo : opencodeLogo} alt="" /></span>
        <span className="agent-backend-card-copy"><strong>{labels[item]}</strong><small>{item === "codex" ? t("Local CLI · uses your existing Codex login") : t("Local CLI · uses its existing login and configuration")}</small></span>
        <span className="agent-backend-card-status">
          <span className={`agent-connection-status ${connections[item] || "unchecked"}`} aria-live="polite">{busy === "check" && selected === item && <LoaderCircle className="spin" size={13} />}{connectionLabel(item)}</span>
          {savedConfig?.backend === item && <span className="agent-backend-active">{t("Backend active")}</span>}
        </span>
        <ChevronDown className={expanded && selected === item ? "expanded" : ""} size={17} />
      </button>
      <div className="agent-backend-panel" id={`${id}-${item}-config`} hidden={!expanded || selected !== item}>
      {selected === item && <>
        <div className="agent-backend-fields">
          <SettingsRow stacked title={<label htmlFor={`${id}-binary`}>{t(`${name} executable`)}</label>} description={selected === "codex" ? t("Use codex from PATH or an absolute executable path. Run codex login in a terminal first.") : t("Use the CLI name or an absolute executable path. Sign in through its terminal command first.")}>
            <input id={`${id}-binary`} className="settings-text-input settings-text-input-wide" disabled={disabled} value={config.binary} spellCheck={false} onChange={(event) => edit("binary", event.target.value)} />
          </SettingsRow>
          <SettingsRow stacked title={<label htmlFor={`${id}-model`}>{t(`${name} model`)}</label>} description={selected === "codex" ? t("Leave empty to use your Codex configuration. API model settings do not select the Codex model.") : selected === "claude" ? t("Leave empty to use your Claude Code configuration.") : t("Leave empty to use native configuration. OpenCode model IDs use provider/model.")}>
            <input id={`${id}-model`} className="settings-text-input settings-text-input-wide" disabled={disabled} list={`${id}-models`} value={config.model} spellCheck={false} onChange={(event) => edit("model", event.target.value)} />
            <datalist id={`${id}-models`}>{models.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</datalist>
          </SettingsRow>
          {selected === "codex" && <SettingsRow stacked title={<label htmlFor={`${id}-effort`}>{t("Codex thinking effort")}</label>} description={t("Choose from the selected Codex model's native reasoning efforts.")}>
            <button ref={effortTrigger} id={`${id}-effort`} type="button" className="settings-select native-effort-select" disabled={disabled} aria-haspopup="menu" aria-expanded={effortOpen} onClick={() => {
              setEffortOpen((open) => !open);
              if (!effortOpen && (!models.length || (!config.model && !effectiveModelId))) void apply("check");
            }}>{config.effort ? effortLabel(config.effort) : t("Codex default")}<ChevronDown size={14} /></button>
            <MenuSurface open={active && effortOpen && expanded} onClose={() => setEffortOpen(false)} anchorRef={effortTrigger} width="anchor" ariaLabel={t("Codex thinking effort")}>
              <MenuItem checked={!config.effort} onClick={() => { setConfig((current) => ({ ...current, effort: "" })); setEffortOpen(false); }}>{t("Codex default")}</MenuItem>
              {nativeModel?.efforts?.map((effort) => <MenuItem key={effort} checked={config.effort === effort} onClick={() => { setConfig((current) => ({ ...current, effort })); setEffortOpen(false); }}>{effortLabel(effort)}{effort === nativeModel.defaultEffort ? ` · ${t("Default")}` : ""}</MenuItem>)}
              {busy === "check" ? <MenuItem disabled icon={<LoaderCircle className="spin" size={13} />}>{t("Loading Codex model options…")}</MenuItem> : !nativeModel && <MenuItem onClick={() => void apply("check")}>{t("Reload Codex model options")}</MenuItem>}
            </MenuSurface>
          </SettingsRow>}
          {selected === "codex" && <SettingsRow stacked title={<label htmlFor={`${id}-permissions`}>{t("Codex permissions")}</label>} description={t(config.permissionMode === "full-access" ? "Run without sandbox or approval prompts." : config.permissionMode === "auto-review" ? "Codex reviews approval requests automatically." : "Ask before commands that need elevated access.")}>
            <select id={`${id}-permissions`} className="settings-select" disabled={disabled} value={config.permissionMode || "ask"} onChange={(event) => setConfig((current) => ({ ...current, permissionMode: event.target.value as AgentBackendConfig["permissionMode"] }))}>
              <option value="ask">{t("Ask for approval")}</option>
              <option value="auto-review">{t("Approve for me")}</option>
              <option value="full-access">{t("Full access")}</option>
            </select>
          </SettingsRow>}
        </div>
        {selected !== "codex" && <div className="agent-backend-permissions">
          <strong>{t("Permissions")}</strong>
          <p>{t(selected === "claude" ? "Uses your Claude Code permission settings. When Claude Code requests approval, you can respond in the conversation." : "Uses your OpenCode permission settings. When OpenCode requests approval, you can respond in the conversation.")}</p>
        </div>}
        <div className="agent-backend-actions">
          <button type="button" className="secondary-button" disabled={disabled || !config.binary.trim()} onClick={() => void apply("check")}>{busy === "check" ? <LoaderCircle className="spin" size={14} /> : <Network size={14} />}{t(`Check ${name}`)}</button>
          <button type="button" className="primary-button" disabled={disabled || !config.binary.trim()} onClick={() => void apply(selected)}>{busy === "save" ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />}{savedConfig?.backend === selected ? t("Save backend") : t(`Use ${name}`)}</button>
        </div>
      </>}
      </div>
    </section>)}
    </div>
    {feedback && <div className={`agent-backend-feedback${feedback.error ? " error" : ""}`} role={feedback.error ? "alert" : "status"}>{feedback.text}</div>}
    <p className="agent-backend-note">{t("Credentials stay with each CLI. Native tools differ from the API harness; failures never silently switch backends.")}</p>
  </div>;
}
