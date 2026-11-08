import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import openaiLogo from "./assets/providers/openai.png";
import claudeLogo from "@lobehub/icons-static-svg/icons/claude-color.svg";
import opencodeLogo from "@lobehub/icons-static-svg/icons/opencode.svg";
import ArchimedesMark from "./brand/ArchimedesMark";
import { MenuDivider, MenuItem, MenuSurface } from "./Menu";
import { useUISettings } from "./i18n";
import "./harness-picker.css";

export default function HarnessPicker({ backend, bound, busy, onChange, onSettings }: {
  backend: AgentBackendConfig["backend"];
  bound: boolean;
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
    <MenuSurface open={open && !busy} onClose={() => setOpen(false)} anchorRef={trigger} placement="top-start" width={250} className="harness-picker-menu" ariaLabel={t("Harnesses")}>
      {bound && <p className="harness-picker-notice">{t("Start a new chat to use this agent")}</p>}
      <MenuItem checked={backend === "codex"} title={bound && backend !== "codex" ? t("Start a new chat to use this agent") : undefined} disabled={saving} onClick={() => void choose("codex")}>Codex</MenuItem>
      <MenuItem checked={backend === "claude"} title={bound && backend !== "claude" ? t("Start a new chat to use this agent") : undefined} disabled={saving} onClick={() => void choose("claude")}>Claude Code</MenuItem>
      <MenuItem checked={backend === "opencode"} title={bound && backend !== "opencode" ? t("Start a new chat to use this agent") : undefined} disabled={saving} onClick={() => void choose("opencode")}>OpenCode</MenuItem>
      <MenuItem checked={backend === "api"} title={bound && backend !== "api" ? t("Start a new chat to use this agent") : undefined} disabled={saving} onClick={() => void choose("api")}>Archimedes</MenuItem>
      {error && <p className="harness-picker-error" role="alert">{error}</p>}
      <MenuDivider />
      <MenuItem chevron disabled={saving} aria-label={t("Model settings")} onClick={() => { setOpen(false); onSettings(); }}>{t("Model settings")}</MenuItem>
    </MenuSurface>
  </div>;
}
