import { useEffect, useState } from "react";
import { Check, ExternalLink, KeyRound, Save, X } from "lucide-react";
import braveLogo from "@lobehub/icons-static-svg/icons/brave-color.svg";
import exaLogo from "@lobehub/icons-static-svg/icons/exa-color.svg";
import firecrawlLogo from "@lobehub/icons-static-svg/icons/firecrawl-color.svg";
import tavilyLogo from "@lobehub/icons-static-svg/icons/tavily-color.svg";
import { useDialogFocus } from "./useDialogFocus";

function brandIcon(src: string) {
  return <img className="web-data-brand-logo" src={src} alt="" aria-hidden="true" draggable={false} />;
}

const providers: Array<{ id: WebSearchProviderId; name: string; description: string; link: string; icon: React.ReactNode }> = [
  { id: "brave", name: "Brave Search", description: "Independent web and news index", link: "https://api-dashboard.search.brave.com/", icon: brandIcon(braveLogo) },
  { id: "tavily", name: "Tavily", description: "Search optimized for research agents", link: "https://app.tavily.com/", icon: brandIcon(tavilyLogo) },
  { id: "exa", name: "Exa", description: "Semantic search with page highlights", link: "https://dashboard.exa.ai/", icon: brandIcon(exaLogo) },
  { id: "firecrawl", name: "Firecrawl", description: "Search and structured page discovery", link: "https://www.firecrawl.dev/app", icon: brandIcon(firecrawlLogo) },
];

export default function WebSearchSettingsModal({ bridge, open, onClose }: { bridge: ResearchDeskBridge; open: boolean; onClose: () => void }) {
  const dialogRef = useDialogFocus<HTMLElement>(open, onClose);
  const [provider, setProvider] = useState<WebSearchProviderId>("brave");
  const [configured, setConfigured] = useState<WebSearchProviderId[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const selected = providers.find((item) => item.id === provider)!;
  const hasSelectedKey = configured.includes(provider);

  useEffect(() => {
    if (!open) return;
    setApiKey("");
    setFeedback("");
    void bridge.getWebSearchConfig().then((config) => { setProvider(config.provider); setConfigured(config.configuredProviders ?? (config.hasApiKey ? [config.provider] : [])); }).catch((error) => setFeedback(String(error)));
  }, [bridge, open]);

  async function save() {
    setSaving(true);
    setFeedback("");
    try {
      const config = await bridge.saveWebSearchConfig({ provider, apiKey });
      setProvider(config.provider);
      setConfigured(config.configuredProviders ?? (config.hasApiKey ? [config.provider] : []));
      setApiKey("");
      setFeedback(`${selected.name} is ready for new Agent turns.`);
    } catch (error) { setFeedback(String(error).replace(/^Error:\s*/, "")); }
    finally { setSaving(false); }
  }

  if (!open) return null;
  return <div className="modal-backdrop model-settings-backdrop" role="presentation" onMouseDown={onClose}>
    <section ref={dialogRef} tabIndex={-1} className="web-search-modal" role="dialog" aria-modal="true" aria-label="Web search settings" onMouseDown={(event) => event.stopPropagation()}>
      <header className="model-settings-header"><div><span>Agent tools</span><h2>Web data</h2><p>Choose the search service Archimedes uses. Your own API key stays on this device.</p></div><button className="quiet-icon-button" onClick={onClose} title="Close web data settings"><X size={17} /></button></header>
      <div className="web-data-layout">
        <nav className="web-data-provider-list" aria-label="Web data providers">
          {providers.map((item) => <button key={item.id} type="button" className={`web-data-provider${provider === item.id ? " active" : ""}`} onClick={() => { setProvider(item.id); setApiKey(""); setFeedback(""); }}>
            <span className={`web-data-icon ${item.id}`}>{item.icon}</span><span className="web-data-provider-copy"><strong>{item.name}</strong><small>{item.description}</small></span>{configured.includes(item.id) && <Check className="web-data-check" size={15} />}
          </button>)}
        </nav>
        <div className="web-data-config">
          <div className="web-data-selected"><span className={`web-data-icon large ${selected.id}`}>{selected.icon}</span><div><h3>{selected.name}</h3><p>{selected.description}</p></div></div>
          <div className="web-data-field"><label htmlFor="web-search-key"><KeyRound size={14} />API key</label><input id="web-search-key" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={hasSelectedKey ? "Saved locally · enter a new key to replace" : `Enter ${selected.name} API key`} autoComplete="off" spellCheck={false} /></div>
          <p className="web-data-security">Keys are stored in Electron user data and never included in Agent messages. Search queries are sent directly to the selected provider.</p>
          <a className="web-data-link" href={selected.link} target="_blank" rel="noreferrer">Get a {selected.name} API key <ExternalLink size={13} /></a>
          {feedback && <p className="web-data-feedback" role="status">{feedback}</p>}
        </div>
      </div>
      <footer className="model-settings-footer"><span>{hasSelectedKey ? `${selected.name} key saved` : "Add a key to activate this provider"}</span><div><button className="secondary-button" onClick={onClose}>Close</button><button className="primary-button" onClick={() => void save()} disabled={saving || (!apiKey.trim() && !hasSelectedKey)}><Save size={14} />Use {selected.name}</button></div></footer>
    </section>
  </div>;
}
