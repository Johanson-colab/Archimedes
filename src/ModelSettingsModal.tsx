import { useEffect, useMemo, useState } from "react";
import {
  BrainCircuit,
  Check,
  Cloud,
  KeyRound,
  LoaderCircle,
  Network,
  Route,
  Save,
  Server,
  Sparkles,
  X,
  Zap,
} from "lucide-react";

type ProviderId = ModelProviderId;

const providers: Array<{
  id: ProviderId;
  name: string;
  caption: string;
  baseUrl: string;
  models: string[];
  icon: React.ReactNode;
}> = [
  { id: "openai", name: "OpenAI", caption: "GPT and reasoning models", baseUrl: "https://api.openai.com/v1", models: ["gpt-5", "gpt-4.1", "gpt-4.1-mini"], icon: <Sparkles size={17} /> },
  { id: "deepseek", name: "DeepSeek", caption: "Chat and reasoning models", baseUrl: "https://api.deepseek.com", models: ["deepseek-chat", "deepseek-reasoner", "deepseek-v4-flash"], icon: <BrainCircuit size={17} /> },
  { id: "qwen", name: "Qwen", caption: "DashScope compatible API", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", models: ["qwen-plus", "qwen-max", "qwen3-coder-plus"], icon: <Cloud size={17} /> },
  { id: "moonshot", name: "Moonshot", caption: "Kimi OpenAI-compatible API", baseUrl: "https://api.moonshot.cn/v1", models: ["kimi-k2.5", "moonshot-v1-32k", "moonshot-v1-128k"], icon: <Zap size={17} /> },
  { id: "openrouter", name: "OpenRouter", caption: "Models from multiple providers", baseUrl: "https://openrouter.ai/api/v1", models: ["openai/gpt-5", "deepseek/deepseek-chat", "anthropic/claude-sonnet-4"], icon: <Route size={17} /> },
  { id: "custom", name: "Custom", caption: "Any OpenAI-compatible endpoint", baseUrl: "", models: [], icon: <Network size={17} /> },
];

export default function ModelSettingsModal({ bridge, open, onClose }: { bridge: ResearchDeskBridge; open: boolean; onClose: () => void }) {
  const [provider, setProvider] = useState<ProviderId>("custom");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error" | "idle"; text: string }>({ kind: "idle", text: "" });
  const selected = useMemo(() => providers.find((item) => item.id === provider) ?? providers.at(-1)!, [provider]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setFeedback({ kind: "idle", text: "" });
    void bridge.getModelConfig().then((config) => {
      setProvider(config.provider);
      setBaseUrl(config.baseUrl);
      setModel(config.model);
      setHasApiKey(config.hasApiKey);
      setApiKey("");
    }).catch((error) => setFeedback({ kind: "error", text: String(error) })).finally(() => setLoading(false));
  }, [bridge, open]);

  function chooseProvider(next: typeof providers[number]) {
    setProvider(next.id);
    if (next.id !== "custom") {
      setBaseUrl(next.baseUrl);
      setModel(next.models[0] || "");
    }
    setFeedback({ kind: "idle", text: "" });
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
      setHasApiKey(config.hasApiKey);
      setApiKey("");
      setFeedback({ kind: "success", text: "Configuration saved. New Agent turns will use this model." });
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
            <span><strong>{item.name}</strong><small>{item.caption}</small></span>
            {item.id === provider && <Check size={14} />}
          </button>)}
        </nav>

        <div className="provider-config">
          {loading ? <div className="model-settings-loading"><LoaderCircle className="spin" size={19} />Loading configuration</div> : <>
            <div className="provider-config-title"><span className="provider-icon large">{selected.icon}</span><div><h3>{selected.name}</h3><p>{selected.caption}</p></div></div>
            <label><span><Server size={14} />Base URL</span><input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.example.com/v1" spellCheck={false} /></label>
            <label><span><KeyRound size={14} />API key</span><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={hasApiKey ? "Saved securely · enter a new key to replace" : "Enter API key"} autoComplete="off" spellCheck={false} /></label>
            <label><span><BrainCircuit size={14} />Model</span><input list={`models-${provider}`} value={model} onChange={(event) => setModel(event.target.value)} placeholder="Model identifier" spellCheck={false} />
              <datalist id={`models-${provider}`}>{selected.models.map((name) => <option key={name} value={name} />)}</datalist>
            </label>
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
