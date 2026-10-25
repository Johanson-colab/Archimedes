import { useEffect, useState } from "react";
import { Check, ExternalLink, KeyRound, Save, X } from "lucide-react";
import braveLogo from "@lobehub/icons-static-svg/icons/brave-color.svg";
import exaLogo from "@lobehub/icons-static-svg/icons/exa-color.svg";
import firecrawlLogo from "@lobehub/icons-static-svg/icons/firecrawl-color.svg";
import tavilyLogo from "@lobehub/icons-static-svg/icons/tavily-color.svg";
import { useUISettings } from "./i18n";
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

export default function WebSearchSettingsModal({ bridge, open, onClose, embedded = false }: { bridge: ResearchDeskBridge; open: boolean; onClose: () => void; embedded?: boolean }) {
  const { t } = useUISettings();
  const dialogRef = useDialogFocus<HTMLElement>(open && !embedded, onClose);
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
      setFeedback(t("{provider} is ready for new Agent turns.", { provider: selected.name }));
    } catch (error) { setFeedback(String(error).replace(/^Error:\s*/, "")); }
    finally { setSaving(false); }
  }

  if (!open) return null;
  const content = <>
      {!embedded && <header className="model-settings-header"><div><span>{t("Agent tools")}</span><h2>{t("Web data")}</h2><p>{t("Choose the search service Archimedes uses. Your own API key stays on this device.")}</p></div><button className="quiet-icon-button" onClick={onClose} title={t("Close web data settings")}><X size={17} /></button></header>}
      <div className="web-data-layout">
        <nav className="web-data-provider-list" aria-label={t("Web data providers")}>
          {providers.map((item) => <button key={item.id} type="button" className={`web-data-provider${provider === item.id ? " active" : ""}`} onClick={() => { setProvider(item.id); setApiKey(""); setFeedback(""); }}>
            <span className={`web-data-icon ${item.id}`}>{item.icon}</span><span className="web-data-provider-copy"><strong>{item.name}</strong><small>{t(item.description)}</small></span>{configured.includes(item.id) && <Check className="web-data-check" size={15} />}
          </button>)}
        </nav>
        <div className="web-data-config">
          <div className="web-data-selected"><span className={`web-data-icon large ${selected.id}`}>{selected.icon}</span><div><h3>{selected.name}</h3><p>{t(selected.description)}</p></div></div>
          <div className="web-data-field"><label htmlFor="web-search-key"><KeyRound size={14} />{t("API key")}</label><input id="web-search-key" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={hasSelectedKey ? t("Saved locally · enter a new key to replace") : t("Enter {provider} API key", { provider: selected.name })} autoComplete="off" spellCheck={false} /></div>
          <p className="web-data-security">{t("Keys are stored in Electron user data and never included in Agent messages. Search queries are sent directly to the selected provider.")}</p>
          <a className="web-data-link" href={selected.link} target="_blank" rel="noreferrer">{t("Get a {provider} API key", { provider: selected.name })} <ExternalLink size={13} /></a>
          {feedback && <p className="web-data-feedback" role="status">{feedback}</p>}
        </div>
      </div>
      <footer className="model-settings-footer"><span>{hasSelectedKey ? t("{provider} key saved", { provider: selected.name }) : t("Add a key to activate this provider")}</span><div>{!embedded && <button className="secondary-button" onClick={onClose}>{t("Close")}</button>}<button className="primary-button" onClick={() => void save()} disabled={saving || (!apiKey.trim() && !hasSelectedKey)}><Save size={14} />{t("Use {provider}", { provider: selected.name })}</button></div></footer>
    </>;
  if (embedded) return <section className="settings-embedded web-search-modal" aria-label={t("Web search settings")}>{content}</section>;
  return <div className="modal-backdrop model-settings-backdrop" role="presentation" onMouseDown={onClose}>
    <section ref={dialogRef} tabIndex={-1} className="web-search-modal" role="dialog" aria-modal="true" aria-label={t("Web search settings")} onMouseDown={(event) => event.stopPropagation()}>{content}</section>
  </div>;
}
