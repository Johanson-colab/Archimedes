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
  X,
} from "lucide-react";
import deepseekLogo from "./assets/providers/deepseek.png";
import moonshotLogo from "./assets/providers/moonshot.jpg";
import openaiLogo from "./assets/providers/openai.png";
import qwenLogo from "./assets/providers/qwen.png";

type ProviderId = ModelProviderId;

function brandIcon(src: string) {
  return <img className="provider-brand-logo" src={src} alt="" aria-hidden="true" draggable={false} />;
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
  { id: "deepseek", name: "DeepSeek", caption: "Chat and reasoning models", baseUrl: "https://api.deepseek.com", models: ["deepseek-v4-flash", "deepseek-v4-pro", "deepseek-v4-flash-vision-exp", "deepseek-chat", "deepseek-reasoner"], icon: brandIcon(deepseekLogo) },
  { id: "qwen", name: "Qwen", caption: "DashScope compatible API", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", models: ["qwen3.8-max", "qwen3.7-max", "qwen3.7-plus", "qwen3.7-flash", "qwen3-max", "qwen-max", "qwen-plus", "qwen-flash", "qwen-turbo", "qwen3-coder-next", "qwen3-coder-plus", "qwen3-coder-flash", "qwen-coder-plus", "qwen-coder-turbo", "qwq-plus", "qwen-long", "qwen-math-plus", "qwen-math-turbo"], icon: brandIcon(qwenLogo) },
  { id: "moonshot", name: "Moonshot", caption: "Kimi OpenAI-compatible API", baseUrl: "https://api.moonshot.cn/v1", models: ["kimi-k3", "kimi-k2.7-code", "kimi-k2.7-code-turbo", "kimi-k2.6", "kimi-k2.5", "moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"], icon: brandIcon(moonshotLogo) },
  { id: "openrouter", name: "OpenRouter", caption: "Models from multiple providers", baseUrl: "https://openrouter.ai/api/v1", models: ["openrouter/auto", "openai/gpt-5.6-sol", "openai/gpt-5.6-terra", "openai/gpt-5.6-luna", "deepseek/deepseek-v4-pro", "deepseek/deepseek-v4-flash-0731", "qwen/qwen3.8-max", "moonshotai/kimi-k3"], icon: <Route size={17} /> },
  { id: "custom", name: "Custom", caption: "Any OpenAI-compatible endpoint", baseUrl: "", models: [], icon: <Network size={17} /> },
];

export default function ModelSettingsModal({ bridge, open, onClose, onSaved }: { bridge: ResearchDeskBridge; open: boolean; onClose: () => void; onSaved: (config: PublicModelConfig) => void }) {
  const [provider, setProvider] = useState<ProviderId>("custom");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [savedConfig, setSavedConfig] = useState<PublicModelConfig | null>(null);
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
    void bridge.getModelConfig().then((config) => {
      setProvider(config.provider);
      setBaseUrl(config.baseUrl);
      setModel(config.model);
      setSavedConfig(config);
      setHasApiKey(config.hasApiKey);
      setApiKey("");
      setCatalogModels([]);
      setCatalogError("");
      setModelMenuOpen(false);
      setModelSearch("");
    }).catch((error) => setFeedback({ kind: "error", text: String(error) })).finally(() => setLoading(false));
  }, [bridge, open]);

  function chooseProvider(next: typeof providers[number]) {
    setProvider(next.id);
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
      const result = await bridge.listProviderModels({ provider, baseUrl, apiKey });
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
      const result = await bridge.testModelConfig({ provider, baseUrl, model, apiKey });
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
      const config = await bridge.saveModelConfig({ provider, baseUrl, model, apiKey });
      setProvider(config.provider);
      setBaseUrl(config.baseUrl);
      setModel(config.model);
      setSavedConfig(config);
      setHasApiKey(config.hasApiKey);
      setApiKey("");
      onSaved(config);
      setFeedback({ kind: "success", text: `Saved ${config.model}. New Agent turns will use this model.` });
    } catch (error) {
      setFeedback({ kind: "error", text: String(error).replace(/^Error:\s*/, "") });
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;
  return <div className="modal-backdrop model-settings-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="model-settings-modal" role="dialog" aria-modal="true" aria-label="Model settings" onMouseDown={(event) => event.stopPropagation()}>
      <header className="model-settings-header">
        <div><span>Agent runtime</span><h2>Model providers</h2><p>Choose the model Archimedes uses for new research turns.</p></div>
        <button className="quiet-icon-button" onClick={onClose} title="Close model settings"><X size={17} /></button>
      </header>

      <div className="model-settings-body">
        <nav className="provider-list" aria-label="Model providers">
          {providers.map((item) => <button key={item.id} className={item.id === provider ? "provider-option active" : "provider-option"} onClick={() => chooseProvider(item)}>
            <span className="provider-icon">{item.icon}</span>
            <span><strong>{item.name}</strong><small>{item.id === provider && model ? model : item.caption}</small></span>
            {item.id === provider && <Check size={14} />}
          </button>)}
        </nav>

        <div className="provider-config">
          {loading ? <div className="model-settings-loading"><LoaderCircle className="spin" size={19} />Loading configuration</div> : <>
            <div className="provider-config-title"><span className="provider-icon large">{selected.icon}</span><div><h3>{selected.name}</h3><p>{model || selected.caption}</p></div></div>
            <label><span><Server size={14} />Base URL</span><input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.example.com/v1" spellCheck={false} /></label>
            <label><span><KeyRound size={14} />API key</span><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={hasApiKey ? "Saved securely · enter a new key to replace" : "Enter API key"} autoComplete="off" spellCheck={false} /></label>
            <label><span><BrainCircuit size={14} />Model</span><div className="model-combobox">
              <input value={model} onChange={(event) => { setModel(event.target.value); setModelSearch(event.target.value); setModelMenuOpen(true); }} placeholder="Model identifier" spellCheck={false} aria-expanded={modelMenuOpen} aria-controls="model-catalog" />
              <button type="button" className="model-catalog-toggle" onClick={toggleModelMenu} title="Show available models" aria-label="Show available models"><ChevronDown size={16} /></button>
              {modelMenuOpen && <div className="model-catalog" id="model-catalog">
                <div className="model-catalog-header"><span>{catalogModels.length ? `${catalogModels.length} live models` : "Official recommended models"}</span><button type="button" onClick={() => void refreshModelCatalog()} disabled={catalogLoading} title="Refresh live catalog">{catalogLoading ? <LoaderCircle className="spin" size={13} /> : <RefreshCw size={13} />}Refresh</button></div>
                {catalogError && <p className="model-catalog-note">{catalogError} Showing the recommended list below.</p>}
                <div className="model-catalog-list">
                  {availableModels.filter((name) => name.toLowerCase().includes(modelSearch.toLowerCase())).map((name) => <button type="button" key={name} className={name === model ? "active" : ""} onClick={() => { setModel(name); setModelSearch(""); setModelMenuOpen(false); }}><span>{name}</span>{name === model && <Check size={13} />}</button>)}
                  {!availableModels.filter((name) => name.toLowerCase().includes(modelSearch.toLowerCase())).length && <p className="model-catalog-empty">No matching model. Keep typing to use a custom identifier.</p>}
                </div>
              </div>}
            </div></label>
            <div className="model-security-note"><KeyRound size={13} /><span>The API key is stored in Electron user data and never returned to the page.</span></div>
            {feedback.text && <div className={`model-feedback ${feedback.kind}`}>{feedback.kind === "success" ? <Check size={14} /> : <X size={14} />}<span>{feedback.text}</span></div>}
          </>}
        </div>
      </div>

      <footer className="model-settings-footer">
        <button className="secondary-button" onClick={() => void testConnection()} disabled={loading || testing || saving || !baseUrl.trim() || !model.trim()}>{testing ? <LoaderCircle className="spin" size={14} /> : <Network size={14} />}Test connection</button>
        <div><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={() => void save()} disabled={loading || testing || saving || !baseUrl.trim() || !model.trim()}>{saving ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />}Save model</button></div>
      </footer>
    </section>
  </div>;
}
