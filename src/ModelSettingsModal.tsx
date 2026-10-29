import { useEffect, useMemo, useState } from "react";
import {
  BrainCircuit,
  Check,
  ChevronDown,
  KeyRound,
  LoaderCircle,
  Network,
  RefreshCw,
  Route,
  Save,
  Server,
  Sparkles,
  X,
} from "lucide-react";
import anthropicLogo from "@lobehub/icons-static-svg/icons/anthropic.svg";
import geminiLogo from "@lobehub/icons-static-svg/icons/gemini-color.svg";
import minimaxLogo from "@lobehub/icons-static-svg/icons/minimax-color.svg";
import zaiLogo from "@lobehub/icons-static-svg/icons/zai.svg";
import deepseekLogo from "./assets/providers/deepseek.png";
import moonshotLogo from "./assets/providers/moonshot.jpg";
import openaiLogo from "./assets/providers/openai.png";
import qwenLogo from "./assets/providers/qwen.png";
import { useUISettings } from "./i18n";
import { useDialogFocus } from "./useDialogFocus";

type ProviderId = ModelProviderId;

function brandIcon(src: string, variant = "") {
  const logo = <img className="provider-brand-logo" src={src} alt="" aria-hidden="true" draggable={false} />;
  return variant ? <span className={`provider-brand-tile ${variant}`}>{logo}</span> : logo;
}

const providers: Array<{
  id: ProviderId;
  name: string;
  caption: string;
  baseUrl: string;
  models: string[];
  icon: React.ReactNode;
}> = [
  { id: "openai", name: "OpenAI", caption: "GPT and reasoning models", baseUrl: "https://api.openai.com/v1", models: ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.1", "gpt-5", "gpt-5-mini", "gpt-5-nano", "gpt-5.1-codex", "gpt-5.1-codex-max", "gpt-5-codex", "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano", "o3", "o4-mini", "o3-deep-research", "o4-mini-deep-research"], icon: brandIcon(openaiLogo) },
  { id: "anthropic", name: "Anthropic", caption: "Claude · native Messages API", baseUrl: "https://api.anthropic.com/v1", models: ["claude-fable-5-1", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5", "claude-opus-5", "claude-sonnet-5", "claude-opus-4-8", "claude-opus-4-7", "claude-opus-4-6", "claude-opus-4-5-20251101", "claude-sonnet-4-6", "claude-sonnet-4-5-20250929", "claude-haiku-4-5-20251001"], icon: brandIcon(anthropicLogo) },
  { id: "gemini", name: "Google Gemini", caption: "Gemini OpenAI-compatible API", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", models: ["gemini-4-argon", "gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-pro-preview", "gemini-3.1-flash-lite", "gemini-3-flash-preview", "gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemma-4-31b-it", "gemma-4-26b-a4b-it"], icon: brandIcon(geminiLogo) },
  { id: "glm", name: "Z.AI / GLM", caption: "GLM chat, reasoning, and vision models", baseUrl: "https://api.z.ai/api/paas/v4", models: ["glm-5.3", "glm-5.3-flashx", "glm-5.3-flash", "glm-5.2", "glm-5.1", "glm-5", "glm-4.7", "glm-4.7-flashx", "glm-4.7-flash", "glm-4.6", "glm-4.6v", "glm-4.6v-flashx", "glm-4.6v-flash", "glm-4.5", "glm-4.5-x", "glm-4.5-air", "glm-4.5-airx", "glm-4.5-flash", "glm-4.5v", "glm-4-32b-0414-128k"], icon: brandIcon(zaiLogo, "zai") },
  { id: "minimax", name: "MiniMax", caption: "MiniMax OpenAI-compatible API", baseUrl: "https://api.minimax.io/v1", models: ["MiniMax-M3.1-Flash-Preview", "MiniMax-M3", "MiniMax-M2.7", "MiniMax-M2.7-highspeed", "MiniMax-M2.5", "MiniMax-M2.5-highspeed", "MiniMax-M2.1", "MiniMax-M2.1-highspeed", "MiniMax-M2"], icon: brandIcon(minimaxLogo) },
  { id: "deepseek", name: "DeepSeek", caption: "Chat and reasoning models", baseUrl: "https://api.deepseek.com", models: ["deepseek-v4-flash", "deepseek-v4-pro", "deepseek-v4-flash-vision-exp", "deepseek-chat", "deepseek-reasoner"], icon: brandIcon(deepseekLogo) },
  { id: "qwen", name: "Qwen", caption: "DashScope compatible API", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", models: ["qwen3.8-max", "qwen3.7-max", "qwen3.7-plus", "qwen3.7-flash", "qwen3-max", "qwen-max", "qwen-plus", "qwen-flash", "qwen-turbo", "qwen3-coder-next", "qwen3-coder-plus", "qwen3-coder-flash", "qwen-coder-plus", "qwen-coder-turbo", "qwq-plus", "qwen-long", "qwen-math-plus", "qwen-math-turbo"], icon: brandIcon(qwenLogo) },
  { id: "moonshot", name: "Moonshot", caption: "Kimi OpenAI-compatible API", baseUrl: "https://api.moonshot.cn/v1", models: ["kimi-k3", "kimi-k2.7-code", "kimi-k2.7-code-turbo", "kimi-k2.6", "kimi-k2.5", "moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"], icon: brandIcon(moonshotLogo) },
  { id: "openrouter", name: "OpenRouter", caption: "Models from multiple providers", baseUrl: "https://openrouter.ai/api/v1", models: ["openrouter/auto", "openai/gpt-5.6-sol", "openai/gpt-5.6-terra", "openai/gpt-5.6-luna", "deepseek/deepseek-v4-pro", "deepseek/deepseek-v4-flash-0731", "qwen/qwen3.8-max", "moonshotai/kimi-k3"], icon: <Route size={17} /> },
  { id: "custom", name: "Custom", caption: "Any OpenAI-compatible endpoint", baseUrl: "", models: [], icon: <Network size={17} /> },
];

export default function ModelSettingsModal({ bridge, open, onClose, onSaved, embedded = false, role = "agent" }: { bridge: ResearchDeskBridge; open: boolean; onClose: () => void; onSaved: (config: PublicModelConfig) => void; embedded?: boolean; role?: ModelRole }) {
  const { t } = useUISettings();
  const proactiveRole = role === "proactive";
  const dialogRef = useDialogFocus<HTMLElement>(open && !embedded, onClose);
  const [provider, setProvider] = useState<ProviderId>("custom");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [savedConfig, setSavedConfig] = useState<PublicModelConfig | null>(null);
  const hasApiKey = Boolean(savedConfig?.hasApiKey && savedConfig.provider === provider && savedConfig.baseUrl === baseUrl);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error" | "idle"; text: string }>({ kind: "idle", text: "" });
  const [catalogModels, setCatalogModels] = useState<string[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const selected = useMemo(() => providers.find((item) => item.id === provider) ?? providers.at(-1)!, [provider]);
  const availableModels = useMemo(() => [...new Set([...selected.models, ...catalogModels, model].filter(Boolean))], [catalogModels, model, selected.models]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setFeedback({ kind: "idle", text: "" });
    void bridge.getModelConfig(role).then((config) => {
      setProvider(config.provider);
      setBaseUrl(config.baseUrl);
      setModel(config.model);
      setSavedConfig(config);
      setApiKey("");
      setCatalogModels([]);
      setCatalogError("");
      setModelMenuOpen(false);
      setModelSearch("");
    }).catch((error) => setFeedback({ kind: "error", text: String(error) })).finally(() => setLoading(false));
  }, [bridge, open, role]);

  function chooseProvider(next: typeof providers[number]) {
    setProvider(next.id);
    setApiKey("");
    if (next.id === "custom") {
      setBaseUrl(savedConfig?.provider === "custom" ? savedConfig.baseUrl : "");
      setModel(savedConfig?.provider === "custom" ? savedConfig.model : "");
    } else {
      setBaseUrl(next.baseUrl);
      setModel(next.models[0] || "");
    }
    setCatalogModels([]);
    setCatalogError("");
    setModelMenuOpen(false);
    setModelSearch("");
    setFeedback({ kind: "idle", text: "" });
  }

  async function refreshModelCatalog({ quiet = false } = {}) {
    if (catalogLoading || !baseUrl.trim()) return;
    if (!apiKey.trim() && !hasApiKey && provider !== "openrouter") {
      if (!quiet) setCatalogError("Add this provider's API key, then refresh to load the live catalog.");
      return;
    }
    setCatalogLoading(true);
    setCatalogError("");
    try {
      const result = await bridge.listProviderModels({ provider, baseUrl, apiKey }, role);
      setCatalogModels(result.models);
    } catch (error) {
      setCatalogError(String(error).replace(/^Error invoking remote method '[^']+': Error:\s*|^Error:\s*/, ""));
    } finally {
      setCatalogLoading(false);
    }
  }

  function toggleModelMenu() {
    const next = !modelMenuOpen;
    setModelMenuOpen(next);
    if (next) {
      setModelSearch("");
      void refreshModelCatalog({ quiet: true });
    }
  }

  async function testConnection() {
    setTesting(true);
    setFeedback({ kind: "idle", text: "" });
    try {
      const result = await bridge.testModelConfig({ provider, baseUrl, model, apiKey }, role);
      setFeedback({ kind: "success", text: `Connected in ${result.latencyMs} ms · ${result.resolvedModel}` });
    } catch (error) {
      setFeedback({ kind: "error", text: String(error).replace(/^Error:\s*/, "") });
    } finally {
      setTesting(false);
    }
  }

  async function save() {
    setSaving(true);
    setFeedback({ kind: "idle", text: "" });
    try {
      const config = await bridge.saveModelConfig({ provider, baseUrl, model, apiKey }, role);
      setProvider(config.provider);
      setBaseUrl(config.baseUrl);
      setModel(config.model);
      setSavedConfig(config);
      setApiKey("");
      onSaved(config);
      setFeedback({ kind: "success", text: proactiveRole ? `Saved ${config.model}. Proactive replies and live observation will use this model.` : `Saved ${config.model}. New Agent turns will use this model.` });
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
      const config = await bridge.saveModelConfig({ provider, baseUrl, model, apiKey, useAgent: true }, role);
      setProvider(config.provider);
      setBaseUrl(config.baseUrl);
      setModel(config.model);
      setSavedConfig(config);
      setApiKey("");
      onSaved(config);
      setFeedback({ kind: "success", text: "Proactive agent will inherit the main Agent's model." });
    } catch (error) {
      setFeedback({ kind: "error", text: String(error).replace(/^Error:\s*/, "") });
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;
  const content = <>
      {!embedded && <header className="model-settings-header">
        <div><span>{proactiveRole ? "Proactive runtime" : "Agent runtime"}</span><h2>{proactiveRole ? "Proactive model" : "Model providers"}</h2><p>{proactiveRole ? "Choose the model Proactive agent uses for replies and live observation." : "Choose the model Archimedes uses for new research turns."}</p></div>
        <button className="quiet-icon-button" onClick={onClose} title="Close model settings"><X size={17} /></button>
      </header>}

      <div className="model-settings-body">
        <nav className="provider-list" aria-label="Model providers">
          {providers.map((item) => <button key={item.id} className={item.id === provider ? "provider-option active" : "provider-option"} onClick={() => chooseProvider(item)}>
            <span className="provider-icon">{item.icon}</span>
            <span><strong>{item.name}</strong><small>{item.id === provider && model ? model : item.caption}</small></span>
            {item.id === provider && <Check size={14} />}
          </button>)}
        </nav>

        <div className="provider-config">
          {loading ? <div className="model-settings-loading"><LoaderCircle className="spin" size={19} />{t("Loading configuration")}</div> : <>
            {proactiveRole && savedConfig?.inheritedFromAgent && <div className="model-inherited-note"><Sparkles size={13} /><span>{t("Currently inheriting the main Agent model. Save below to give Proactive agent its own model.")}</span></div>}
            <div className="provider-config-title"><span className="provider-icon large">{selected.icon}</span><div><h3>{selected.name}</h3><p>{model || t(selected.caption)}</p></div></div>
            <label><span><Server size={14} />{t("Base URL")}</span><input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.example.com/v1" spellCheck={false} /></label>
            <label><span><KeyRound size={14} />{t("API key")}</span><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={hasApiKey ? t("Saved securely · enter a new key to replace") : t("Enter API key")} autoComplete="off" spellCheck={false} /></label>
            <label><span><BrainCircuit size={14} />{t("Model")}</span><div className="model-combobox">
              <input value={model} onChange={(event) => { setModel(event.target.value); setModelSearch(event.target.value); setModelMenuOpen(true); }} placeholder={t("Model identifier")} spellCheck={false} aria-expanded={modelMenuOpen} aria-controls="model-catalog" />
              <button type="button" className="model-catalog-toggle" onClick={toggleModelMenu} title={t("Show available models")} aria-label={t("Show available models")}><ChevronDown size={16} /></button>
              {modelMenuOpen && <div className="model-catalog" id="model-catalog">
                <div className="model-catalog-header"><span>{catalogModels.length ? t("{count} models · live catalog merged", { count: availableModels.length }) : t("{count} supported models", { count: availableModels.length })}</span><button type="button" onClick={() => void refreshModelCatalog()} disabled={catalogLoading} title={t("Refresh live catalog")}>{catalogLoading ? <LoaderCircle className="spin" size={13} /> : <RefreshCw size={13} />}{t("Refresh")}</button></div>
                {catalogError && <p className="model-catalog-note">{catalogError} {t("Showing the recommended list below.")}</p>}
                <div className="model-catalog-list">
                  {availableModels.filter((name) => name.toLowerCase().includes(modelSearch.toLowerCase())).map((name) => <button type="button" key={name} className={name === model ? "active" : ""} onClick={() => { setModel(name); setModelSearch(""); setModelMenuOpen(false); }}><span>{name}</span>{name === model && <Check size={13} />}</button>)}
                  {!availableModels.filter((name) => name.toLowerCase().includes(modelSearch.toLowerCase())).length && <p className="model-catalog-empty">{t("No matching model. Keep typing to use a custom identifier.")}</p>}
                </div>
              </div>}
            </div></label>
            <div className="model-security-note"><KeyRound size={13} /><span>{t("The API key is stored in Electron user data and never returned to the page.")}</span></div>
            {feedback.text && <div className={`model-feedback ${feedback.kind}`}>{feedback.kind === "success" ? <Check size={14} /> : <X size={14} />}<span>{feedback.text}</span></div>}
          </>}
        </div>
      </div>

      <footer className="model-settings-footer">
        <div className="model-settings-footer-left">
          <button className="secondary-button" onClick={() => void testConnection()} disabled={loading || testing || saving || !baseUrl.trim() || !model.trim()}>{testing ? <LoaderCircle className="spin" size={14} /> : <Network size={14} />}{t("Test connection")}</button>
          {proactiveRole && <button className="secondary-button" onClick={() => void useMainAgent()} disabled={loading || testing || saving || savedConfig?.inheritedFromAgent}>{t("Use main Agent model")}</button>}
        </div>
        <div>{!embedded && <button className="secondary-button" onClick={onClose}>{t("Cancel")}</button>}<button className="primary-button" onClick={() => void save()} disabled={loading || testing || saving || !baseUrl.trim() || !model.trim()}>{saving ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />}{t("Save model")}</button></div>
      </footer>
    </>;
  if (embedded) return <section className="settings-embedded model-settings-modal" aria-label="Model settings">{content}</section>;
  return <div className="modal-backdrop model-settings-backdrop" role="presentation" onMouseDown={onClose}>
    <section ref={dialogRef} tabIndex={-1} className="model-settings-modal" role="dialog" aria-modal="true" aria-label="Model settings" onMouseDown={(event) => event.stopPropagation()}>{content}</section>
  </div>;
}
