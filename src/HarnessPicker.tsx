import { useEffect, useRef, useState } from "react";
import { ChevronDown, Settings } from "lucide-react";
import openaiLogo from "./assets/providers/openai.png";
import claudeLogo from "@lobehub/icons-static-svg/icons/claude-color.svg";
import opencodeLogo from "@lobehub/icons-static-svg/icons/opencode.svg";
import ArchimedesMark from "./brand/ArchimedesMark";
import { MenuItem, MenuSurface } from "./Menu";
import { useUISettings } from "./i18n";
import "./harness-picker.css";

export default function HarnessPicker({ backend, busy, onChange, onSettings }: {
  backend: AgentBackendConfig["backend"];
  busy: boolean;
  onChange: (backend: AgentBackendConfig["backend"]) => Promise<void>;
  onSettings: () => void;
}) {
  const { t } = useUISettings();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (busy) setOpen(false); }, [busy]);
  const label = { codex: "Codex", claude: "Claude Code", opencode: "OpenCode", api: "Archimedes" }[backend];
  const brand = (id: string) => id === "api" ? <ArchimedesMark size={16} variant="small" /> : <img className="provider-brand-logo" src={id === "codex" ? openaiLogo : id === "claude" ? claudeLogo : opencodeLogo} alt="" />;
  async function choose(next: AgentBackendConfig["backend"]) {
    if (saving || busy) return;
    setSaving(true); setError("");
    try { if (next !== backend) await onChange(next); setOpen(false); }
    catch (reason) { setError(String(reason)); }
    finally { setSaving(false); }
  }
  return <div className="harness-picker">
    <button ref={trigger} type="button" className="composer-tool harness-picker-trigger" disabled={busy || saving} aria-label={`${t("Harness")}: ${label}`} aria-haspopup="menu" aria-expanded={open && !busy} onClick={() => { setError(""); setOpen((value) => !value); }}>
      <span className="harness-brand" aria-hidden="true">{brand(backend)}</span><span>{label}</span><ChevronDown size={13} />
    </button>
    <MenuSurface open={open && !busy} onClose={() => setOpen(false)} anchorRef={trigger} placement="top-start" width={280} className="harness-picker-menu" ariaLabel={t("Harnesses")}>
      <div className="harness-picker-header"><strong>{t("Harnesses")}</strong><MenuItem className="harness-settings-button" icon={<Settings size={15} />} disabled={saving} aria-label={t("Model settings")} title={t("Model settings")} onClick={() => { setOpen(false); onSettings(); }}>{null}</MenuItem></div>
      <MenuItem icon={<span className="harness-brand">{brand("codex")}</span>} checked={backend === "codex"} disabled={saving} onClick={() => void choose("codex")}>Codex</MenuItem>
      <MenuItem icon={<span className="harness-brand">{brand("claude")}</span>} checked={backend === "claude"} disabled={saving} onClick={() => void choose("claude")}>Claude Code</MenuItem>
      <MenuItem icon={<span className="harness-brand">{brand("opencode")}</span>} checked={backend === "opencode"} disabled={saving} onClick={() => void choose("opencode")}>OpenCode</MenuItem>
      <MenuItem icon={<span className="harness-brand">{brand("api")}</span>} checked={backend === "api"} disabled={saving} onClick={() => void choose("api")}>Archimedes</MenuItem>
      {error && <p className="harness-picker-error" role="alert">{error}</p>}
    </MenuSurface>
  </div>;
}
