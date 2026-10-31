import { useRef, useState } from "react";
import { ChevronUp, Cloud, Laptop, LogIn, LogOut, Settings, ShieldCheck } from "lucide-react";
import { useUISettings } from "./i18n";
import { MenuItem, MenuSurface } from "./Menu";

type AccountChipProps = {
  authState: AuthState | null;
  identity: LocalIdentity | null;
  onOpenAuth: () => void;
  onOpenAccountSettings: () => void;
  onSignOut: () => Promise<unknown>;
};

export default function AccountChip({ authState, identity, onOpenAuth, onOpenAccountSettings, onSignOut }: AccountChipProps) {
  const { t } = useUISettings();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const user = authState?.user || null;

  async function signOut() {
    setBusy(true);
    try { await onSignOut(); setOpen(false); }
    finally { setBusy(false); }
  }

  return <div className="account-chip-wrap">
    <MenuSurface open={open} onClose={() => setOpen(false)} anchorRef={triggerRef} placement="top-start" width={320} className="account-menu" ariaLabel={t("Account menu")}>
      <div className="account-menu-header" role="none">
        {user && <span className="account-avatar large">{(user.displayName || user.email).slice(0, 1).toUpperCase()}</span>}
        <div><strong>{user ? user.displayName || user.email : t("Not signed in")}</strong><small>{user ? user.email : t("Local mode")}</small></div>
        <span className="account-plan">{user ? t("Free plan") : t("Local")}</span>
      </div>
      {user ? <>
        <div className="account-menu-row" role="none"><Cloud size={14} /><div><strong>{t("Cloud runtime")}</strong><small>{t("Gated · credits coming with Cloud runs")}</small></div></div>
        <div className="account-menu-row" role="none"><Laptop size={14} /><div><strong>{t("Sync")}</strong><small>{t("Off · configure per project")}</small></div></div>
        <div className="account-menu-row" role="none"><ShieldCheck size={14} /><div><strong>{identity?.deviceName || t("This device")}</strong><small>{t("Local data is preserved on sign-out")}</small></div></div>
        <span className="menu-divider" role="separator" />
        <MenuItem icon={<Settings size={18} strokeWidth={1.7} />} onClick={() => { setOpen(false); onOpenAccountSettings(); }}>{t("Account settings")}</MenuItem>
        <MenuItem danger icon={<LogOut size={18} strokeWidth={1.7} />} disabled={busy} onClick={() => void signOut()}>{busy ? t("Signing out…") : t("Sign out")}</MenuItem>
      </> : <>
        <p className="account-menu-note" role="none">{t("Cloud agents and sync need an account. Local projects, papers, and agent runs do not.")}</p>
        <MenuItem icon={<LogIn size={18} strokeWidth={1.7} />} onClick={() => { setOpen(false); onOpenAuth(); }}>{t("Sign in or create account")}</MenuItem>
      </>}
    </MenuSurface>
    <button ref={triggerRef} className={user ? "account-chip signed-in" : "account-chip guest"} onClick={() => setOpen((current) => !current)} aria-haspopup="menu" aria-expanded={open} title={t("Account")}>
      {user && <span className="account-avatar">{(user.displayName || user.email).slice(0, 1).toUpperCase()}</span>}
      <span className="account-chip-copy"><strong>{user ? user.displayName || user.email : t("Sign in")}</strong><small>{user ? `${t("Cloud")} · ${t("Free plan")}` : t("Cloud agents & sync")}</small></span>
      {user && <ChevronUp size={13} className={open ? "account-chevron open" : "account-chevron"} />}
    </button>
  </div>;
}
