import { useEffect, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { useUISettings } from "../i18n";
import { SettingsGroup, SettingsSection } from "../SettingsPrimitives";

const PRESETS = ["OPENAI_API_KEY", "TINKER_API_KEY", "HF_TOKEN", "WANDB_API_KEY", "OPENALEX_API_KEY", "BRAVE_SEARCH_API_KEY", "TAVILY_API_KEY"];

export default function EnvironmentVariablesPanel({ bridge }: { bridge: ResearchDeskBridge }) {
  const { t } = useUISettings();
  const [names, setNames] = useState<Array<{ name: string; shared: boolean }>>([]);
  const [sharing, setSharing] = useState<Record<string, boolean>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState("");
  const [extra, setExtra] = useState<string[]>([]);
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState("");
  useEffect(() => { let active = true; void bridge.listEnvironmentVariables().then(value => { if (active) setNames(value); }).catch(error => { if (active) setFeedback(String(error)); }); return () => { active = false; }; }, [bridge]);
  const rows = [...new Set([...PRESETS, ...names.map(item => item.name), ...extra])];
  function add() {
    const name = custom.trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(name)) { setFeedback(t("Use a variable name containing letters, numbers, and underscores, starting with a letter or underscore.")); return; }
    if (rows.includes(name)) { setFeedback(t("This variable is already listed.")); return; }
    setExtra(current => [...current, name]); setCustom(""); setFeedback("");
  }
  async function save(name: string) {
    setBusy(name); setFeedback("");
    try { setNames(await bridge.saveEnvironmentVariable({ name, value: values[name] || "", shared: sharing[name] ?? names.find(item => item.name === name)?.shared ?? false })); setValues(current => ({ ...current, [name]: "" })); setFeedback(t("Variable saved.")); }
    catch (error) { setFeedback(String(error).replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?|^Error:\s*/, "")); }
    finally { setBusy(""); }
  }
  async function remove(name: string) {
    setBusy(name); setFeedback("");
    try { setNames(await bridge.removeEnvironmentVariable(name)); setExtra(current => current.filter(item => item !== name)); setValues(current => ({ ...current, [name]: "" })); setFeedback(t("Variable removed.")); }
    catch (error) { setFeedback(String(error)); }
    finally { setBusy(""); }
  }
  return <div className="settings-sections environment-variables">
    <SettingsSection title={t("Environment variables")}>
      <p className="settings-group-note">{t("Save keys using system encryption. Web search uses the previously selected configured service, or the first available key in Brave, Tavily, Exa, Firecrawl order. Share keys with native agents and runs only if selected.")}</p>
      <SettingsGroup className="environment-variable-list">
        {rows.map(name => <div className="environment-variable-row" key={name}>
          <div className="environment-variable-name"><code>{name}</code><small>{names.some(item => item.name === name) ? t("Saved") : t("Not configured")}</small></div>
          <input className="settings-text-input" type="password" aria-label={t("Value for {name}", { name })} placeholder={names.some(item => item.name === name) ? t("Enter a new value to replace") : t("Enter value")} value={values[name] || ""} autoComplete="off" spellCheck={false} onChange={event => setValues(current => ({ ...current, [name]: event.target.value }))} />
          <label className="environment-share"><input type="checkbox" disabled={!!busy || !(values[name] || "").trim()} checked={sharing[name] ?? names.find(item => item.name === name)?.shared ?? false} onChange={event => setSharing(current => ({ ...current, [name]: event.target.checked }))} />{t("Share with agents and runs")}</label>
          <button type="button" className="secondary-button" disabled={!!busy || !(values[name] || "").trim()} onClick={() => void save(name)} aria-label={t("Save {name}", { name })}><Save size={14}/>{t("Save")}</button>
          {(names.some(item => item.name === name) || extra.includes(name)) && <button type="button" className="quiet-icon-button" disabled={!!busy} onClick={() => void remove(name)} aria-label={t("Remove {name}", { name })} title={t("Remove {name}", { name })}><Trash2 size={15}/></button>}
        </div>)}
      </SettingsGroup>
      <p className="settings-group-note">{t("Re-enter a value to change sharing. Shared keys are available to native agents and code they run, and to managed experiment commands. Only names ending in _API_KEY or _TOKEN can be shared.")}</p>
      <div className="environment-add"><input className="settings-text-input" aria-label={t("Variable name")} placeholder="CUSTOM_API_KEY" value={custom} spellCheck={false} onChange={event => setCustom(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); add(); } }} /><button type="button" className="secondary-button" onClick={add}><Plus size={14}/>{t("Add variable")}</button></div>
      {feedback && <p className="settings-group-note" role="status">{feedback}</p>}
    </SettingsSection>
  </div>;
}
