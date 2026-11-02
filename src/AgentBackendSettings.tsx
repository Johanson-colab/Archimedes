import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { SettingsChoiceGroup, SettingsGroup, SettingsRow, SettingsSection } from "./SettingsPrimitives";
import { useUISettings } from "./i18n";

export default function AgentBackendSettings({ bridge }: { bridge: ResearchDeskBridge }) {
  const { t } = useUISettings();
  const [config, setConfig] = useState<AgentBackendConfig>({ backend: "api", binary: "codex", model: "" });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [models, setModels] = useState<Array<{ id: string; label: string }>>([]);
  useEffect(() => {
    let active = true;
    void bridge.getAgentBackendConfig().then((value) => { if (active) { setConfig(value); setLoaded(true); } }).catch((error) => { if (active) setFeedback(String(error)); });
    return () => { active = false; };
  }, [bridge]);
  async function apply(check: boolean) {
    setBusy(true);
    setFeedback("");
    try {
      if (check) {
        const result = await bridge.checkAgentBackend(config);
        setModels(result.models);
        setFeedback(t(result.message));
      } else {
        const saved = await bridge.saveAgentBackendConfig(config);
        setConfig(saved);
        setFeedback(t("Backend saved. Changes apply to the next main Work turn."));
      }
    } catch (error) { setFeedback(String(error).replace(/^Error invoking remote method '[^']+': Error:\s*|^Error:\s*/, "")); }
    finally { setBusy(false); }
  }
  return <details className="agent-backend-settings">
    <summary>{t("Agent backend")} · {config.backend === "codex" ? "Codex" : t("API harness")}</summary>
    <SettingsSection>
    <SettingsGroup>
      <SettingsRow title={t("Main Work runtime")} description={t("Paper chat, internal research workers and Proactive keep using API models.")}>
        <SettingsChoiceGroup label={t("Agent backend")} value={config.backend} onChange={(backend) => { setConfig({ ...config, backend }); setFeedback(""); }} options={[{ value: "api", label: t("API harness") }, { value: "codex", label: "Codex" }]} />
      </SettingsRow>
      {config.backend === "codex" && <>
        <SettingsRow title={t("Codex executable")} description={t("Use codex from PATH or an absolute executable path. Run codex login in a terminal first.")}>
          <input className="settings-text-input settings-text-input-wide" aria-label={t("Codex executable")} value={config.binary} spellCheck={false} onChange={(event) => setConfig({ ...config, binary: event.target.value })} />
        </SettingsRow>
        <SettingsRow title={t("Codex model")} description={t("Leave empty to use your Codex configuration. API model settings below do not select the Codex model.")}>
          <input className="settings-text-input" aria-label={t("Codex model")} list="codex-models" value={config.model} spellCheck={false} onChange={(event) => setConfig({ ...config, model: event.target.value })} />
          <datalist id="codex-models">{models.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</datalist>
        </SettingsRow>
        <SettingsRow description={t("Codex starts read-only and requests native approvals. Plugin/skill attachments and native question cards are not supported yet. Files, images and source metadata are passed as context; papers are not automatically read.")} />
      </>}
      <SettingsRow description={feedback || t("No Codex credentials are copied. Native tools differ from the API harness; failures never silently switch backends.")}>
        {busy && <LoaderCircle className="spin" size={14} />}
        {config.backend === "codex" && <button className="secondary-button" disabled={!loaded || busy} onClick={() => void apply(true)}>{t("Check Codex")}</button>}
        <button className="secondary-button" disabled={!loaded || busy} onClick={() => void apply(false)}>{t("Save backend")}</button>
      </SettingsRow>
    </SettingsGroup>
    </SettingsSection>
  </details>;
}
