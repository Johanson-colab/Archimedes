import { useEffect, useRef, useState } from "react";
import { ChevronUp, Cloud, Laptop, LogIn, LogOut, Settings, ShieldCheck, UserRound } from "lucide-react";
import { useUISettings } from "./i18n";

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
  const rootRef = useRef<HTMLDivElement>(null);
  const user = authState?.user || null;

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", key); };
  }, [open]);

  async function signOut() {
    setBusy(true);
    try { await onSignOut(); setOpen(false); }
    finally { setBusy(false); }
  }

  return <div className="account-chip-wrap" ref={rootRef}>
    {open && <div className="account-menu" role="menu" aria-label={t("Account menu")}>
      <div className="account-menu-header">
        <span className="account-avatar large">{user ? (user.displayName || user.email).slice(0, 1).toUpperCase() : <UserRound size={17} />}</span>
        <div><strong>{user ? user.displayName || user.email : t("Not signed in")}</strong><small>{user ? user.email : t("Local mode")}</small></div>
        <span className="account-plan">{user ? t("Free plan") : t("Local")}</span>
      </div>
      {user ? <>
        <div className="account-menu-row"><Cloud size={14} /><div><strong>{t("Cloud runtime")}</strong><small>{t("Gated · credits coming with Cloud runs")}</small></div></div>
        <div className="account-menu-row"><Laptop size={14} /><div><strong>{t("Sync")}</strong><small>{t("Off · configure per project")}</small></div></div>
        <div className="account-menu-row"><ShieldCheck size={14} /><div><strong>{identity?.deviceName || t("This device")}</strong><small>{t("Local data is preserved on sign-out")}</small></div></div>
        <div className="account-menu-divider" />
        <button className="account-menu-item" role="menuitem" onClick={() => { setOpen(false); onOpenAccountSettings(); }}><Settings size={14} />{t("Account settings")}</button>
        <button className="account-menu-item danger" role="menuitem" disabled={busy} onClick={() => void signOut()}><LogOut size={14} />{busy ? t("Signing out…") : t("Sign out")}</button>
      </> : <>
        <p className="account-menu-note">{t("Cloud agents and sync need an account. Local projects, papers, and agent runs do not.")}</p>
        <button className="account-menu-primary" role="menuitem" onClick={() => { setOpen(false); onOpenAuth(); }}><LogIn size={14} />{t("Sign in or create account")}</button>
      </>}
    </div>}
    <button className={user ? "account-chip signed-in" : "account-chip"} onClick={() => setOpen((current) => !current)} aria-haspopup="menu" aria-expanded={open} title={t("Account")}>
      <span className="account-avatar">{user ? (user.displayName || user.email).slice(0, 1).toUpperCase() : <UserRound size={16} />}</span>
      <span className="account-chip-copy"><strong>{user ? user.displayName || user.email : t("Sign in")}</strong><small>{user ? `${t("Cloud")} · ${t("Free plan")}` : t("Cloud agents & sync")}</small></span>
      <ChevronUp size={13} className={open ? "account-chevron open" : "account-chevron"} />
    </button>
  </div>;
}
