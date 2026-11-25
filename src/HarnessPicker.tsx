import { useEffect, useRef, useState } from "react";
import { Brain, ChevronDown, LoaderCircle } from "lucide-react";
import openaiLogo from "@lobehub/icons-static-svg/icons/openai.svg";
import claudeLogo from "@lobehub/icons-static-svg/icons/claude-color.svg";
import opencodeLogo from "@lobehub/icons-static-svg/icons/opencode.svg";
import ArchimedesMark from "./brand/ArchimedesMark";
import { MenuDivider, MenuItem, MenuSurface } from "./Menu";
import { useUISettings } from "./i18n";
import "./harness-picker.css";

export default function HarnessPicker({ backend, bound, busy, onlyCurrent = false, onChange, onSettings }: {
  backend: AgentBackendConfig["backend"];
  bound: boolean;
  busy: boolean;
  onlyCurrent?: boolean;
  onChange?: (backend: AgentBackendConfig["backend"]) => Promise<void>;
  onSettings: () => void;
}) {
  const { t } = useUISettings();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (busy) setOpen(false); }, [busy]);
  const label = { codex: "Codex", claude: "Claude Code", opencode: "OpenCode", api: "Archimedes" }[backend];
  const accessibleLabel = `${t("Agent")}: ${label}`;
  const brand = (id: string) => id === "api" ? <ArchimedesMark size={16} variant="small" /> : <img className={`provider-brand-logo${id === "claude" ? "" : " provider-brand-mono"}`} src={id === "codex" ? openaiLogo : id === "claude" ? claudeLogo : opencodeLogo} alt="" />;
  async function choose(next: AgentBackendConfig["backend"]) {
    if (saving || busy) return;
    setSaving(true); setError("");
    try { if (next !== backend) await onChange?.(next); setOpen(false); }
    catch (reason) { setError(String(reason)); }
    finally { setSaving(false); }
  }
  return <div className="harness-picker">
    <button ref={trigger} type="button" className="composer-tool harness-picker-trigger" disabled={busy || saving} aria-label={accessibleLabel} aria-haspopup="menu" aria-expanded={open && !busy} onClick={() => { setError(""); setOpen((value) => !value); }}>
      <span className="harness-brand" aria-hidden="true">{brand(backend)}</span><span>{label}</span><ChevronDown size={13} />
    </button>
    <MenuSurface open={open && !busy} onClose={() => setOpen(false)} anchorRef={trigger} placement="top-start" width={250} className="harness-picker-menu" ariaLabel={t("Harnesses")}>
      {onlyCurrent ? <p className="harness-picker-notice">{t("Side conversations use Archimedes. Native agents need the main chat.")}</p> : bound && <p className="harness-picker-notice">{t("Start a new chat to use this agent")}</p>}
      <MenuItem checked={backend === "codex"} title={bound && backend !== "codex" ? t("Start a new chat to use this agent") : undefined} disabled={saving || (onlyCurrent && backend !== "codex")} onClick={() => void choose("codex")}>Codex</MenuItem>
      <MenuItem checked={backend === "claude"} title={bound && backend !== "claude" ? t("Start a new chat to use this agent") : undefined} disabled={saving || (onlyCurrent && backend !== "claude")} onClick={() => void choose("claude")}>Claude Code</MenuItem>
      <MenuItem checked={backend === "opencode"} title={bound && backend !== "opencode" ? t("Start a new chat to use this agent") : undefined} disabled={saving || (onlyCurrent && backend !== "opencode")} onClick={() => void choose("opencode")}>OpenCode</MenuItem>
      <MenuItem checked={backend === "api"} title={bound && backend !== "api" ? t("Start a new chat to use this agent") : undefined} disabled={saving || (onlyCurrent && backend !== "api")} onClick={() => void choose("api")}>Archimedes</MenuItem>
      {error && <p className="harness-picker-error" role="alert">{error}</p>}
      <MenuDivider />
      <MenuItem chevron disabled={saving} aria-label={t("Model settings")} onClick={() => { setOpen(false); onSettings(); }}>{t("Model settings")}</MenuItem>
    </MenuSurface>
  </div>;
}

export function ComposerModelPicker({ bridge, native, workspace, defaultModel, profiles, value, disabled, bound, onChange, onSettings }: {
  bridge: ResearchDeskBridge;
  native: AgentBackendConfig | null;
  workspace: string;
  defaultModel: string;
  profiles: PublicModelProfile[];
  value?: string;
  disabled: boolean;
  bound: boolean;
  onChange: (model: string | undefined) => void;
  onSettings: () => void;
}) {
  const { t } = useUISettings();
  const trigger = useRef<HTMLButtonElement>(null);
  const request = useRef(0);
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<NativeAgentModel[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const backend = native?.backend;
  const binary = native?.binary;

  useEffect(() => {
    setOpen(false);
    setCatalog([]);
    setSearch("");
    setLoading(false);
    setError("");
    return () => { request.current++; };
  }, [backend, binary, workspace]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  const automatic = t("Agent default");
  const defaultLabel = native ? native.model || automatic : defaultModel || t("No model configured");
  const selectedProfile = native ? null : profiles.find(profile => profile.id === value);
  const label = native ? value === "" ? automatic : value || defaultLabel : selectedProfile?.model || defaultLabel;
  const canLoadNative = backend === "codex" || backend === "opencode";
  const models = catalog.filter(model => model.id !== native?.model && model.id.toLowerCase().includes(search.toLowerCase())).slice(0, 80);

  function choose(next: string | undefined) {
    onChange(next);
    setOpen(false);
  }

  async function loadNativeModels() {
    if (!native || loading) return;
    const id = ++request.current;
    setLoading(true);
    setError("");
    try {
      const result = backend === "codex" ? await bridge.listCodexModelCatalog(native) : await bridge.listOpenCodeModelCatalog({ ...native, workspace });
      if (id === request.current) setCatalog(result.models);
    } catch {
      if (id === request.current) setError(t("Could not load models from this agent. Check its settings."));
    } finally {
      if (id === request.current) setLoading(false);
    }
  }

  return <div className="harness-picker composer-model-picker">
    <button ref={trigger} type="button" className="composer-tool harness-picker-trigger" disabled={disabled} aria-label={`${t("Model")}: ${label}`} aria-haspopup="menu" aria-expanded={open && !disabled} title={label} onClick={() => setOpen(current => !current)}>
      <Brain size={14} aria-hidden="true" /><span className="composer-model-name">{label}</span><ChevronDown size={13} />
    </button>
    <MenuSurface open={open && !disabled} onClose={() => setOpen(false)} anchorRef={trigger} placement="top-start" width={275} maxHeight={340} className="harness-picker-menu" ariaLabel={t("Chat models")}>
      {native && bound && <p className="harness-picker-notice">{t("Changing model starts a new native session with this chat’s recent context.")}</p>}
      <MenuItem checked={value === undefined} onClick={() => choose(undefined)}>{native ? t("Use agent setting: {model}", { model: defaultLabel }) : t("Use Agent model: {model}", { model: defaultLabel })}</MenuItem>
      {native?.model && <MenuItem checked={value === ""} onClick={() => choose("")}>{automatic}</MenuItem>}
      {native && catalog.length > 80 && <input className="composer-model-search" aria-label={t("Search agent models")} placeholder={t("Search agent models")} value={search} onChange={event => setSearch(event.target.value)} />}
      {native ? models.map(model => <MenuItem key={model.id} checked={value === model.id} onClick={() => choose(model.id)}>{model.id}</MenuItem>)
        : profiles.map(profile => <MenuItem key={profile.id} checked={profile.id === value} onClick={() => choose(profile.id)}>{profile.label === profile.model ? profile.model : `${profile.label} · ${profile.model}`}</MenuItem>)}
      {canLoadNative && <MenuItem disabled={loading} icon={loading ? <LoaderCircle size={14} className="spin" /> : undefined} onClick={() => void loadNativeModels()}>{t("Load agent models")}</MenuItem>}
      {error && <p className="harness-picker-error" role="alert">{error}</p>}
      <MenuDivider />
      <MenuItem chevron onClick={() => { setOpen(false); onSettings(); }}>{t("Model settings")}</MenuItem>
    </MenuSurface>
  </div>;
}
