import { useEffect, useState } from "react";
import { Check, ExternalLink, Globe2, KeyRound, Save, X } from "lucide-react";

export default function WebSearchSettingsModal({ bridge, open, onClose }: {
  bridge: ResearchDeskBridge;
  open: boolean;
  onClose: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    if (!open) return;
    setApiKey("");
    setFeedback("");
    void bridge.getWebSearchConfig().then((config) => setHasApiKey(config.hasApiKey)).catch((error) => setFeedback(String(error)));
  }, [bridge, open]);

  async function save() {
    if (!apiKey.trim()) return;
    setSaving(true);
    setFeedback("");
    try {
      const config = await bridge.saveWebSearchConfig({ apiKey });
      setHasApiKey(config.hasApiKey);
      setApiKey("");
      setFeedback("Web and news search are ready for new Agent turns.");
    } catch (error) {
      setFeedback(String(error));
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="web-search-modal" role="dialog" aria-modal="true" aria-label="Web search settings" onMouseDown={(event) => event.stopPropagation()}>
      <header className="modal-header"><div><span className="eyebrow">Agent tools</span><h2>Web search</h2></div><button className="quiet-icon-button" onClick={onClose} title="Close web search settings"><X size={17} /></button></header>
      <div className="web-search-modal-body">
        <div className="web-search-provider"><span><Globe2 size={18} /></span><div><strong>Brave Search</strong><small>Web pages, blogs, and current news</small></div>{hasApiKey && <Check size={15} />}</div>
        <label htmlFor="web-search-key"><KeyRound size={14} /> API key</label>
        <input id="web-search-key" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={hasApiKey ? "Saved · enter a new key to replace" : "Enter Brave Search API key"} autoComplete="off" spellCheck={false} />
        <p>The key is saved in Electron user data and is never included in Agent messages.</p>
        <a href="https://api-dashboard.search.brave.com/" target="_blank" rel="noreferrer">Brave Search API <ExternalLink size={13} /></a>
        {feedback && <p className="web-search-feedback" role="status">{feedback}</p>}
      </div>
      <footer className="model-settings-footer"><span>{hasApiKey ? "Search is configured" : "A key is required for general web and news search"}</span><div><button className="secondary-button" onClick={onClose}>Close</button><button className="primary-button" onClick={() => void save()} disabled={!apiKey.trim() || saving}><Save size={14} />Save key</button></div></footer>
    </section>
  </div>;
}
