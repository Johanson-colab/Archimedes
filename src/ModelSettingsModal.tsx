import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Brain,
  Check,
  ChevronDown,
  Key,
  LoaderCircle,
  Network,
  RefreshCw,
  Route,
  Save,
  Server,
  Sparkle,
  Workflow,
  X,
} from "lucide-react";
import anthropicLogo from "@lobehub/icons-static-svg/icons/claude-color.svg";
import geminiLogo from "@lobehub/icons-static-svg/icons/gemini-color.svg";
import minimaxLogo from "@lobehub/icons-static-svg/icons/minimax-color.svg";
import zaiLogo from "@lobehub/icons-static-svg/icons/zai.svg";
import deepseekLogo from "@lobehub/icons-static-svg/icons/deepseek-color.svg";
import moonshotLogo from "@lobehub/icons-static-svg/icons/kimi-color.svg";
import openaiLogo from "@lobehub/icons-static-svg/icons/openai.svg";
import opencodeLogo from "@lobehub/icons-static-svg/icons/opencode.svg";
import qwenLogo from "@lobehub/icons-static-svg/icons/qwen-color.svg";
import packageMetadata from "../package.json";
import { useUISettings } from "./i18n";
import { MenuSurface } from "./Menu";
import AgentBackendSettings from "./AgentBackendSettings";
import { Tab, Tabs } from "./Tabs";
import { SettingsRow, SettingsSwitch } from "./SettingsPrimitives";

type ProviderId = ModelProviderId;
export type ModelExecutionPreferences = {
  reasoningEffort: ReasoningEffort;
  contextLength: ContextLength;
  capabilities: ModelCapabilities;
  onReasoningEffort: (value: ReasoningEffort) => void;
  onContextLength: (value: ContextLength) => void;
};

function brandIcon(src: string, monochrome = false) {
  return <img className={`provider-brand-logo${monochrome ? " provider-brand-mono" : ""}`} src={src} alt="" aria-hidden="true" draggable={false} />;
}

const providers: Array<{
  id: ProviderId;
  name: string;
  caption: string;
  baseUrl: string;
  models: string[];
  icon?: React.ReactNode;
  sessionHeader?: ModelSessionHeaderConfig;
  userAgent?: string;
}> = [
  { id: "openai", name: "OpenAI", caption: "GPT and reasoning models", baseUrl: "https://api.openai.com/v1", models: ["gpt-6.2-sol", "gpt-6.2-astra", "gpt-6.1-terra", "gpt-6-luna", "gpt-5.4-mini", "gpt-4.1-mini"], icon: brandIcon(openaiLogo, true) },
  { id: "anthropic", name: "Anthropic", caption: "Claude · native Messages API", baseUrl: "https://api.anthropic.com/v1", models: ["claude-fable-5-1", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5", "claude-opus-5", "claude-sonnet-5", "claude-opus-4-8", "claude-opus-4-7", "claude-opus-4-6", "claude-opus-4-5-20251101", "claude-sonnet-4-6", "claude-sonnet-4-5-20250929", "claude-haiku-4-5-20251001"], icon: brandIcon(anthropicLogo) },
  { id: "gemini", name: "Google Gemini", caption: "Gemini OpenAI-compatible API", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", models: ["gemini-4-argon", "gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-pro-preview", "gemini-3.1-flash-lite", "gemini-3-flash-preview", "gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemma-4-31b-it", "gemma-4-26b-a4b-it"], icon: brandIcon(geminiLogo) },
  { id: "glm", name: "Z.AI / GLM", caption: "GLM chat, reasoning, and vision models", baseUrl: "https://api.z.ai/api/paas/v4", models: ["glm-5.3", "glm-5.3-flashx", "glm-5.3-flash", "glm-5.2", "glm-5.1", "glm-5", "glm-4.7", "glm-4.7-flashx", "glm-4.7-flash", "glm-4.6", "glm-4.6v", "glm-4.6v-flashx", "glm-4.6v-flash", "glm-4.5", "glm-4.5-x", "glm-4.5-air", "glm-4.5-airx", "glm-4.5-flash", "glm-4.5v", "glm-4-32b-0414-128k"], icon: brandIcon(zaiLogo, true) },
  { id: "minimax", name: "MiniMax", caption: "MiniMax OpenAI-compatible API", baseUrl: "https://api.minimax.io/v1", models: ["MiniMax-M3.1-Flash-Preview", "MiniMax-M3", "MiniMax-M2.7", "MiniMax-M2.7-highspeed", "MiniMax-M2.5", "MiniMax-M2.5-highspeed", "MiniMax-M2.1", "MiniMax-M2.1-highspeed", "MiniMax-M2"], icon: brandIcon(minimaxLogo) },
  { id: "deepseek", name: "DeepSeek", caption: "Chat and reasoning models", baseUrl: "https://api.deepseek.com", models: ["deepseek-v4-flash", "deepseek-v4-pro", "deepseek-v4-flash-vision-exp", "deepseek-chat", "deepseek-reasoner"], icon: brandIcon(deepseekLogo) },
  { id: "qwen", name: "Qwen", caption: "DashScope compatible API", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", models: ["qwen3.8-max", "qwen3.7-max", "qwen3.7-plus", "qwen3.7-flash", "qwen3-max", "qwen-max", "qwen-plus", "qwen-flash", "qwen-turbo", "qwen3-coder-next", "qwen3-coder-plus", "qwen3-coder-flash", "qwen-coder-plus", "qwen-coder-turbo", "qwq-plus", "qwen-long", "qwen-math-plus", "qwen-math-turbo"], icon: brandIcon(qwenLogo) },
  { id: "moonshot", name: "Moonshot", caption: "Kimi OpenAI-compatible API", baseUrl: "https://api.moonshot.cn/v1", models: ["kimi-k3", "kimi-k2.7-code", "kimi-k2.7-code-turbo", "kimi-k2.6", "kimi-k2.5", "moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"], icon: brandIcon(moonshotLogo) },
  { id: "openrouter", name: "OpenRouter", caption: "Models from multiple providers", baseUrl: "https://openrouter.ai/api/v1", models: ["openrouter/auto", "openai/gpt-5.6-sol", "openai/gpt-5.6-terra", "openai/gpt-5.6-luna", "deepseek/deepseek-v4-pro", "deepseek/deepseek-v4-flash-0731", "qwen/qwen3.8-max", "moonshotai/kimi-k3"], icon: <Route size={17} /> },
  { id: "opencode-go", name: "OpenCode Go", caption: "OpenAI-compatible Go API", baseUrl: "https://opencode.ai/inference/go/openai/v1", models: ["hy4-flash-free", "hy4", "qwen3.7-plus"], icon: brandIcon(opencodeLogo, true), sessionHeader: { name: "x-opencode-session", strategy: "thread" }, userAgent: `Archimedes/${packageMetadata.version}` },
  { id: "custom", name: "Custom", caption: "Any OpenAI-compatible endpoint", baseUrl: "", models: [] },
];

export function formatModelConnectionError(error: unknown, t: ReturnType<typeof useUISettings>["t"]) {
  const message = error instanceof Error ? error.message : String(error);
  const detail = message.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?|^Error:\s*/, "");
  const missingSession = /^Connection failed \((\d+)\): MissingSessionID$/.exec(detail);
  if (missingSession) return t("Connection failed ({status}). In Settings → Models, select OpenCode Go or set Session header to x-opencode-session and Strategy to Thread.", { status: missingSession[1] });
  const failedStatus = /^Connection failed \((\d+)\)/.exec(detail);
  return failedStatus ? t("Connection failed ({status}). Check the provider, model, and API key.", { status: failedStatus[1] }) : t(detail);
}

export function useModelConnectionTest(t: ReturnType<typeof useUISettings>["t"]) {
  const [state, setState] = useState<{ kind: "testing" | "success" | "error"; text: string } | null>(null);
  const revision = useRef(0);
  const reset = useCallback(() => { revision.current++; setState(null); }, []);
  useEffect(() => () => { revision.current++; }, []);

  async function run(test: () => Promise<ModelConnectionResult>) {
    const id = ++revision.current;
    setState({ kind: "testing", text: t("Testing model connection…") });
    try {
      const result = await test();
      if (id === revision.current) setState({ kind: "success", text: t("Connected in {latency} ms · {model}", { latency: result.latencyMs, model: result.resolvedModel }) });
    } catch (error) {
      if (id === revision.current) setState({ kind: "error", text: formatModelConnectionError(error, t) });
    }
  }

  return { state, reset, run };
}

const modelProfilesPreference = "archimedes-advanced-model-profiles";

export function modelProfilesEnabled() {
  return window.localStorage.getItem(modelProfilesPreference) === "true";
}

export default function ModelSettingsModal({ bridge, open, onClose, onSaved, embedded = false, role = "agent", executionPreferences, workspace }: { bridge: ResearchDeskBridge; open: boolean; onClose: () => void; onSaved: () => void; embedded?: boolean; role?: ModelRole; executionPreferences?: ModelExecutionPreferences; workspace?: string }) {
  const { t } = useUISettings();
  const proactiveRole = role === "proactive";
  const [settingsPage, setSettingsPage] = useState("api");
  const [activeBackend, setActiveBackend] = useState<AgentBackendConfig["backend"] | null>(null);
  const panelId = useId();
  const [provider, setProvider] = useState<ProviderId>("custom");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [headersText, setHeadersText] = useState("");
  const [sessionHeaderName, setSessionHeaderName] = useState("");
  const [sessionStrategy, setSessionStrategy] = useState<ModelSessionHeaderConfig["strategy"]>("thread");
  const [sessionHeaderValue, setSessionHeaderValue] = useState("");
  const [userAgent, setUserAgent] = useState("");
  const [contextWindowTokens, setContextWindowTokens] = useState("");
  const [maxOutputTokens, setMaxOutputTokens] = useState("");
  const canUseProfiles = typeof bridge.listModelProfiles === "function";
  const [advancedProfiles, setAdvancedProfiles] = useState(() => canUseProfiles && modelProfilesEnabled());
  const [profileName, setProfileName] = useState("");
  const [profiles, setProfiles] = useState<PublicModelProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>();
  const [savedConfig, setSavedConfig] = useState<PublicModelConfig | null>(null);
  const savedConnection = !advancedProfiles || selectedProfileId === undefined ? savedConfig : profiles.find((profile) => profile.id === selectedProfileId);
  const sameConnection = savedConnection?.provider === provider && savedConnection.baseUrl === baseUrl.trim().replace(/\/+$/, "");
  const hasApiKey = Boolean(sameConnection && savedConnection?.hasApiKey);
  const hasCustomHeaders = Boolean(sameConnection && savedConnection?.hasCustomHeaders);
  const hasFixedSessionValue = Boolean(sameConnection && savedConnection?.sessionHeader?.hasValue &&
    savedConnection.sessionHeader.name.toLowerCase() === sessionHeaderName.trim().toLowerCase());
  const [loading, setLoading] = useState(false);
  const { state: connectionResult, reset: resetConnectionTest, run: runConnectionTest } = useModelConnectionTest(t);
  const testing = connectionResult?.kind === "testing";
  const catalogRevision = useRef(0);
  useLayoutEffect(resetConnectionTest, [resetConnectionTest, open, role, settingsPage, provider, baseUrl, model, apiKey, headersText, sessionHeaderName, sessionStrategy, sessionHeaderValue, userAgent, selectedProfileId, advancedProfiles]);
  useLayoutEffect(() => {
    catalogRevision.current++;
    setCatalogModels([]);
    setCatalogError("");
    setCatalogLoading(false);
    return () => { catalogRevision.current++; };
  }, [open, role, settingsPage, provider, baseUrl, apiKey, headersText, sessionHeaderName, sessionStrategy, sessionHeaderValue, userAgent, selectedProfileId]);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error" | "idle"; text: string }>({ kind: "idle", text: "" });
  const [catalogModels, setCatalogModels] = useState<string[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [activeModelIndex, setActiveModelIndex] = useState(0);
  const modelInputRef = useRef<HTMLInputElement | null>(null);
  const modelAnchorRef = useRef<HTMLDivElement | null>(null);
  const selected = useMemo(() => providers.find((item) => item.id === provider) ?? providers.at(-1)!, [provider]);
  const availableModels = useMemo(() => [...new Set([...selected.models, ...catalogModels, model].filter(Boolean))], [catalogModels, model, selected.models]);
  const filteredModels = useMemo(() => availableModels.filter((name) => name.toLowerCase().includes(modelSearch.toLowerCase())), [availableModels, modelSearch]);
  const activeModel = filteredModels[Math.min(activeModelIndex, Math.max(0, filteredModels.length - 1))] ?? "";

  async function loadProfiles() {
    const list = await bridge.listModelProfiles();
    setProfiles(list);
    return list;
  }

  function selectProfile(profile: PublicModelProfile) {
    setSelectedProfileId(profile.id);
    setProfileName(profile.label === profile.model ? "" : profile.label);
    loadConnectionFields(profile);
    setFeedback({ kind: "idle", text: "" });
  }

  function newProfile() {
    setSelectedProfileId(null);
    setProfileName("");
    loadConnectionFields({ provider: "custom", baseUrl: "", model: "" });
    setFeedback({ kind: "idle", text: "" });
  }

  async function deleteProfile() {
    if (!selectedProfileId) return;
    setSaving(true);
    try {
      await bridge.deleteModelProfile(selectedProfileId);
      onSaved();
      const list = await loadProfiles();
      const config = await bridge.getModelConfig(role);
      setSavedConfig(config);
      const currentProfile = list.find((profile) => profile.id === config.modelId) || list[0];
      if (currentProfile) selectProfile(currentProfile);
      else newProfile();
      setFeedback({ kind: "success", text: t("Model profile deleted.") });
    } catch (error) {
      setFeedback({ kind: "error", text: String(error).replace(/^Error:\s*/, "") });
    } finally {
      setSaving(false);
    }
  }

  async function assignRole(targetRole: ModelRole) {
    if (!selectedProfileId) return;
    setSaving(true);
    try {
      const config = await bridge.setModelRole(targetRole, selectedProfileId);
      if (targetRole === role) setSavedConfig(config);
      onSaved();
      setFeedback({ kind: "success", text: t("Assigned model profile to {role}.", { role: targetRole === "agent" ? "Agent" : "Proactive" }) });
    } catch (error) {
      setFeedback({ kind: "error", text: String(error).replace(/^Error:\s*/, "") });
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setFeedback({ kind: "idle", text: "" });
    void Promise.all([
      bridge.getModelConfig(role),
      advancedProfiles ? bridge.listModelProfiles() : undefined,
    ]).then(([config, profiles]) => {
      if (cancelled) return;
      setSavedConfig(config);
      setProfiles(profiles ?? []);
      setSelectedProfileId(advancedProfiles ? config.modelId || null : undefined);
      setProfileName(config.modelLabel === config.model ? "" : config.modelLabel || "");
      loadConnectionFields(config);
    }).catch((error) => {
      if (!cancelled) setFeedback({ kind: "error", text: String(error) });
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [bridge, open, role, advancedProfiles]);

  function toggleAdvancedProfiles(enabled: boolean) {
    window.localStorage.setItem(modelProfilesPreference, String(enabled));
    setAdvancedProfiles(enabled);
    onSaved();
  }

  function loadConnectionFields(config: Pick<PublicModelConfig, "provider" | "baseUrl" | "model" | "sessionHeader" | "userAgent" | "contextWindowTokens" | "maxOutputTokens">) {
    setProvider(config.provider);
    setBaseUrl(config.baseUrl);
    setModel(config.model);
    setApiKey("");
    setHeadersText("");
    setSessionHeaderName(config.sessionHeader?.name || "");
    setSessionStrategy(config.sessionHeader?.strategy || "thread");
    setSessionHeaderValue("");
    setUserAgent(config.userAgent || "");
    setContextWindowTokens(String(config.contextWindowTokens || ""));
    setMaxOutputTokens(String(config.maxOutputTokens || ""));
    setCatalogModels([]);
    setCatalogError("");
    setModelMenuOpen(false);
    setModelSearch("");
  }

  function chooseProvider(next: typeof providers[number]) {
    if (next.id === provider) return;
    if (savedConnection?.provider === next.id) {
      loadConnectionFields(savedConnection);
    } else {
      setProvider(next.id);
      setApiKey("");
      setBaseUrl(next.baseUrl);
      setModel(next.models[0] || "");
      setHeadersText("");
      setSessionHeaderName(next.sessionHeader?.name || "");
      setSessionStrategy(next.sessionHeader?.strategy || "thread");
      setSessionHeaderValue("");
      setUserAgent(next.userAgent || "");
    }
    setCatalogModels([]);
    setCatalogError("");
    setModelMenuOpen(false);
    setModelSearch("");
    setFeedback({ kind: "idle", text: "" });
  }

  function requestExtras() {
    let headers: Record<string, string> | undefined;
    const text = headersText.trim();
    if (text) {
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch {
        throw new Error(t("Custom headers must be a JSON object with text values."));
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.values(parsed).some((value) => typeof value !== "string")) {
        throw new Error(t("Custom headers must be a JSON object with text values."));
      }
      headers = parsed as Record<string, string>;
    }
    const name = sessionHeaderName.trim();
    const value = sessionHeaderValue.trim();
    if (name && sessionStrategy === "fixed" && !value && !hasFixedSessionValue) throw new Error(t("Enter a fixed session header value."));
    return {
      ...(advancedProfiles ? {
        id: selectedProfileId,
        label: profileName.trim() || model.trim(),
        contextWindowTokens: Number(contextWindowTokens) || 0,
        maxOutputTokens: Number(maxOutputTokens) || 0,
      } : {}),
      headers,
      sessionHeader: name ? { name, strategy: sessionStrategy, ...(sessionStrategy === "fixed" && value ? { value } : {}) } : null,
      userAgent: userAgent.trim(),
    };
  }

  async function refreshModelCatalog({ quiet = false } = {}) {
    if (catalogLoading || !baseUrl.trim()) return;
    if (!apiKey.trim() && !hasApiKey && provider !== "openrouter" && provider !== "opencode-go") {
      if (!quiet) setCatalogError(t("Add this provider's API key, then refresh to load the live catalog."));
      return;
    }
    const request = ++catalogRevision.current;
    setCatalogLoading(true);
    setCatalogError("");
    try {
      const result = await bridge.listProviderModels({ provider, baseUrl, apiKey, ...requestExtras(), ...(!proactiveRole ? { purpose: "work" as const } : {}) }, role);
      if (request === catalogRevision.current) setCatalogModels(result.models);
    } catch (error) {
      if (request === catalogRevision.current) setCatalogError(formatModelConnectionError(error, t));
    } finally {
      if (request === catalogRevision.current) setCatalogLoading(false);
    }
  }

  function toggleModelMenu() {
    const next = !modelMenuOpen;
    setModelMenuOpen(next);
    setActiveModelIndex(0);
    if (next) {
      setModelSearch("");
      void refreshModelCatalog({ quiet: true });
      requestAnimationFrame(() => modelInputRef.current?.focus());
    }
  }

  function chooseModel(name: string) {
    setFeedback({ kind: "idle", text: "" });
    setModel(name);
    setModelSearch("");
    setModelMenuOpen(false);
    requestAnimationFrame(() => modelInputRef.current?.focus());
  }

  function onModelInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!modelMenuOpen) {
        setModelMenuOpen(true);
        setModelSearch("");
        setActiveModelIndex(0);
        void refreshModelCatalog({ quiet: true });
        return;
      }
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setActiveModelIndex((current) => {
        if (!filteredModels.length) return 0;
        return (current + delta + filteredModels.length) % filteredModels.length;
      });
      return;
    }
    if (!modelMenuOpen) return;
    if (event.key === "Enter" && activeModel) {
      event.preventDefault();
      chooseModel(activeModel);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setModelMenuOpen(false);
    }
  }

  async function testConnection() {
    setFeedback({ kind: "idle", text: "" });
    await runConnectionTest(async () => bridge.testModelConfig({ provider, baseUrl, model, apiKey, ...requestExtras() }, role));
  }

  async function save() {
    resetConnectionTest();
    setSaving(true);
    setFeedback({ kind: "idle", text: "" });
    try {
      const input = { provider, baseUrl, model, apiKey, ...requestExtras() };
      if (advancedProfiles) {
        const profile = await bridge.saveModelProfile(input);
        onSaved();
        await loadProfiles();
        selectProfile(profile);
        setFeedback({ kind: "success", text: t("Model profile saved.") });
      } else {
        const config = await bridge.saveModelConfig(input, role);
        onSaved();
        setSavedConfig(config);
        loadConnectionFields(config);
        setFeedback({ kind: "success", text: proactiveRole ? `Saved ${config.model}. Proactive replies and live observation will use this model.` : t("Saved {model}. API-backed features will use this model.", { model: config.model }) });
      }
    } catch (error) {
      setFeedback({ kind: "error", text: String(error).replace(/^Error:\s*/, "") });
    } finally {
      setSaving(false);
    }
  }

  async function useMainAgent() {
    setSaving(true);
    setFeedback({ kind: "idle", text: "" });
    try {
      const config = await bridge.saveModelConfig({ provider, baseUrl, model, useAgent: true }, role);
      setSavedConfig(config);
      setSelectedProfileId(undefined);
      loadConnectionFields(config);
      onSaved();
      setFeedback({ kind: "success", text: "Proactive agent will inherit the main Agent's model." });
    } catch (error) {
      setFeedback({ kind: "error", text: String(error).replace(/^Error:\s*/, "") });
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;
  const displayedFeedback = connectionResult || feedback;
  const content = <>
      {!embedded && <header className="model-settings-header">
        <div><span>{proactiveRole ? "Proactive runtime" : "Agent runtime"}</span><h2>{proactiveRole ? "Proactive model" : "Model providers"}</h2><p>{proactiveRole ? "Choose the model Proactive agent uses for replies and live observation." : "Choose the model Archimedes uses for new research turns."}</p></div>
        <button className="quiet-icon-button" onClick={onClose} title="Close model settings"><X size={17} /></button>
      </header>}

      <div className="model-settings-content">
      {!proactiveRole && <Tabs value={settingsPage} onChange={(page) => { setModelMenuOpen(false); setSettingsPage(page); }} label={t("Model connection type")} className="model-connection-tabs">
        <Tab value="api" id={`${panelId}-api-tab`} controls={`${panelId}-api`} icon={<Key size={16} />}>{t("API models")}</Tab>
        <Tab value="agents" id={`${panelId}-agents-tab`} controls={`${panelId}-agents`} icon={<Workflow size={16} />} badge={activeBackend && activeBackend !== "api" ? ({ codex: "Codex", claude: "Claude Code", opencode: "OpenCode", antigravity: "Antigravity" }[activeBackend]) : undefined}>{t("Harnesses")}</Tab>
      </Tabs>}
      <div className="model-settings-panel" onChangeCapture={() => setFeedback({ kind: "idle", text: "" })} id={`${panelId}-api`} role={proactiveRole ? undefined : "tabpanel"} aria-labelledby={proactiveRole ? undefined : `${panelId}-api-tab`} hidden={!proactiveRole && settingsPage !== "api"}>
      {!proactiveRole && <p className="model-connection-description">{t("Connect model providers with an API key. Archimedes manages the tools and research workflow.")}</p>}
      <div className="model-settings-body">
        <nav className="provider-list" aria-label="Model providers">
          {providers.map((item) => <button key={item.id} className={`${item.id === provider ? "provider-option active" : "provider-option"}${item.icon ? "" : " no-icon"}`} onClick={() => chooseProvider(item)}>
            {item.icon && <span className="provider-icon">{item.icon}</span>}
            <span><strong>{item.name}</strong><small>{item.id === provider && model ? model : t(item.caption)}</small></span>
            {item.id === provider && <Check size={14} />}
          </button>)}
        </nav>

        <div className="provider-config">
          {loading ? <div className="model-settings-loading"><LoaderCircle className="spin" size={19} />{t("Loading configuration")}</div> : <>
            <div className="provider-config-title">
              {selected.icon && <span className="provider-icon large">{selected.icon}</span>}
              <div><h3>{model || t(selected.name)}</h3><p>{model ? t("Provider: {provider}", { provider: t(selected.name) }) : t(selected.caption)}</p></div>
            </div>
            {canUseProfiles && <SettingsRow className="model-profiles-setting" title={t("Advanced model profiles")}>
              <SettingsSwitch label={t("Advanced model profiles")} checked={advancedProfiles} onChange={toggleAdvancedProfiles} disabled={saving || testing} />
            </SettingsRow>}
            {advancedProfiles && <div className="model-registry-bar">
              <label><span>{t("Saved models")}</span>
                <select className="settings-select" disabled={saving || testing} value={selectedProfileId || ""} onChange={(event) => {
                  const profile = profiles.find((item) => item.id === event.target.value);
                  if (profile) selectProfile(profile);
                  else newProfile();
                }}>
                  <option value="">{t("New model")}</option>
                  {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.label}</option>)}
                </select>
              </label>
              {selectedProfileId && <div className="model-registry-actions">
                <button type="button" className="secondary-button" disabled={saving || testing} onClick={() => void assignRole("agent")}>{t("Use for Agent")}</button>
                <button type="button" className="secondary-button" disabled={saving || testing} onClick={() => void assignRole("proactive")}>{t("Use for Proactive")}</button>
                <button type="button" className="secondary-button" disabled={saving || testing} onClick={() => void deleteProfile()}>{t("Delete")}</button>
              </div>}
            </div>}
            {proactiveRole && savedConfig?.inheritedFromAgent && <div className="model-inherited-note"><Sparkle size={13} /><span>{t("Currently inheriting the main Agent model. Save below to give Proactive agent its own model.")}</span></div>}
            {advancedProfiles && <label><span>{t("Profile name")}</span><input value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder={model} maxLength={120} /></label>}
            <label><span><Server size={14} />{t("Base URL")}</span><input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.example.com/v1" spellCheck={false} /><small className="model-field-hint">{t("Enter the base URL. Archimedes appends {endpoint}.", { endpoint: provider === "anthropic" ? "/messages" : "/chat/completions" })}</small></label>
            <label><span><Key size={14} />{t("API key")}</span><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={hasApiKey ? t("Saved securely · enter a new key to replace") : t("Enter API key")} autoComplete="off" spellCheck={false} /></label>
            <label><span><Brain size={14} />{t("Model")}</span><div className="model-combobox" ref={modelAnchorRef}>
              <input
                ref={modelInputRef}
                role="combobox"
                aria-autocomplete="list"
                aria-haspopup="listbox"
                aria-expanded={modelMenuOpen}
                aria-controls="model-catalog"
                aria-activedescendant={modelMenuOpen && activeModel ? `model-option-${activeModel.replace(/[^a-zA-Z0-9_-]/g, "-")}` : undefined}
                value={model}
                onKeyDown={onModelInputKeyDown}
                onChange={(event) => { setModel(event.target.value); setModelSearch(event.target.value); setModelMenuOpen(true); setActiveModelIndex(0); }}
                placeholder={t("Model identifier")}
                spellCheck={false}
              />
              <button type="button" className="model-catalog-toggle" onClick={toggleModelMenu} title={t("Show available models")} aria-label={t("Show available models")} aria-haspopup="listbox" aria-expanded={modelMenuOpen}><ChevronDown size={16} /></button>
              <MenuSurface open={modelMenuOpen && (proactiveRole || settingsPage === "api")} onClose={() => { setModelMenuOpen(false); modelInputRef.current?.focus(); }} anchorRef={modelAnchorRef} placement="bottom-start" width="anchor" maxHeight={320} role="listbox" ariaLabel={t("Available models")} id="model-catalog" focus="none" className="model-catalog">
                <div className="model-catalog-header" role="presentation"><span>{catalogModels.length ? t("{count} models · live catalog merged", { count: availableModels.length }) : t("{count} supported models", { count: availableModels.length })}</span><button type="button" onClick={() => void refreshModelCatalog()} disabled={catalogLoading} title={t("Refresh live catalog")}>{catalogLoading ? <LoaderCircle className="spin" size={13} /> : <RefreshCw size={13} />}{t("Refresh")}</button></div>
                {catalogError && <p className="model-catalog-note" role="presentation">{catalogError} {t("Showing the recommended list below.")}</p>}
                <div className="model-catalog-list" role="presentation">
                  {filteredModels.map((name, index) => <button type="button" key={name} id={`model-option-${name.replace(/[^a-zA-Z0-9_-]/g, "-")}`} role="option" aria-selected={name === model} data-menu-item className={name === model ? "menu-item model-option active" : (index === activeModelIndex ? "menu-item model-option active" : "menu-item model-option")} onMouseEnter={() => setActiveModelIndex(index)} onClick={() => chooseModel(name)}><span>{name}</span>{name === model && <Check size={13} />}</button>)}
                  {!filteredModels.length && <p className="model-catalog-empty" role="presentation">{t("No matching model. Keep typing to use a custom identifier.")}</p>}
                </div>
              </MenuSurface>
            </div></label>
            <label><span>{t("Custom headers (JSON)")}</span><textarea className="model-headers-input" rows={3} value={headersText} onChange={(event) => setHeadersText(event.target.value)} placeholder={hasCustomHeaders ? t("Saved. Enter new headers to replace them or {} to clear them.") : "{}"} autoComplete="off" spellCheck={false} /></label>
            <div className="model-session-header">
              <label><span>{t("Session header")}</span><input value={sessionHeaderName} onChange={(event) => setSessionHeaderName(event.target.value)} placeholder="x-opencode-session" spellCheck={false} /></label>
              <label><span>{t("Strategy")}</span><select className="settings-select" value={sessionStrategy} onChange={(event) => setSessionStrategy(event.target.value as ModelSessionHeaderConfig["strategy"])}><option value="thread">{t("Thread")}</option><option value="fixed">{t("Fixed")}</option><option value="disabled">{t("Disabled")}</option></select></label>
            </div>
            {sessionStrategy === "fixed" && <label><span>{t("Fixed session header value")}</span><input type="password" value={sessionHeaderValue} onChange={(event) => setSessionHeaderValue(event.target.value)} placeholder={hasFixedSessionValue ? t("Saved securely · enter a new value to replace") : ""} autoComplete="off" spellCheck={false} /></label>}
            <label><span>{t("User-Agent")}</span><input value={userAgent} onChange={(event) => setUserAgent(event.target.value)} placeholder={`Archimedes/${packageMetadata.version}`} spellCheck={false} /></label>
            {advancedProfiles && <div className="model-profile-limits">
              <label><span>{t("Context window (tokens)")}</span><input type="number" min={0} value={contextWindowTokens} onChange={(event) => setContextWindowTokens(event.target.value)} placeholder="128000" /></label>
              <label><span>{t("Max output (tokens)")}</span><input type="number" min={0} value={maxOutputTokens} onChange={(event) => setMaxOutputTokens(event.target.value)} placeholder="8192" /></label>
            </div>}
            <div className="model-security-note"><Key size={13} /><span>{t("The API key is stored in Electron user data and never returned to the page.")}</span></div>
            {!proactiveRole && executionPreferences && <div className="model-execution-preferences">
              {executionPreferences.capabilities.thinkingEfforts.length > 0 && <label><span>{t("Thinking effort")}</span><select className="settings-select" aria-label={t("Thinking effort")} value={executionPreferences.reasoningEffort} onChange={(event) => executionPreferences.onReasoningEffort(event.target.value as ReasoningEffort)}>{executionPreferences.capabilities.thinkingEfforts.map((value) => <option key={value} value={value}>{t(value === "low" ? "Low" : value === "high" ? "High" : "Medium")}</option>)}</select></label>}
              {executionPreferences.capabilities.contextLengths.length > 0 && <label><span>{t("Context length")}</span><select className="settings-select" aria-label={t("Context length")} value={executionPreferences.contextLength} onChange={(event) => executionPreferences.onContextLength(event.target.value as ContextLength)}>{executionPreferences.capabilities.contextLengths.map((value) => <option key={value} value={value}>{t(value === "extra-long" ? "Extra Long" : "Standard")}</option>)}</select></label>}
            </div>}
          </>}
        </div>
      </div>

      {displayedFeedback.text && <div className={`model-feedback ${displayedFeedback.kind}`} role={displayedFeedback.kind === "error" ? "alert" : "status"}>{displayedFeedback.kind === "success" ? <Check size={14} /> : displayedFeedback.kind === "error" ? <X size={14} /> : null}<span>{displayedFeedback.text}</span></div>}
      <footer className="model-settings-footer">
        <div className="model-settings-footer-left">
          <button className="secondary-button" onClick={() => void testConnection()} disabled={loading || testing || saving || !baseUrl.trim() || !model.trim()}>{testing ? <LoaderCircle className="spin" size={14} /> : <Network size={14} />}{t(testing ? "Testing…" : "Test connection")}</button>
          {proactiveRole && <button className="secondary-button" onClick={() => void useMainAgent()} disabled={loading || testing || saving || savedConfig?.inheritedFromAgent}>{t("Use main Agent model")}</button>}
        </div>
        <div>{!embedded && <button className="secondary-button" onClick={onClose}>{t("Cancel")}</button>}<button className="primary-button" onClick={() => void save()} disabled={loading || testing || saving || !baseUrl.trim() || !model.trim()}>{saving ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />}{t(advancedProfiles ? "Save profile" : "Save model")}</button></div>
      </footer>
      </div>
      {!proactiveRole && <div className="model-settings-panel model-settings-panel-agents" id={`${panelId}-agents`} role="tabpanel" aria-labelledby={`${panelId}-agents-tab`} hidden={settingsPage !== "agents"}>
        <AgentBackendSettings bridge={bridge} onBackendChange={setActiveBackend} workspace={workspace} />
      </div>}
      </div>
    </>;
  return <section className="settings-embedded model-settings-modal" aria-label="Model settings">{content}</section>;
}

export { providers };

