import { useEffect, useState } from "react";
import { Cloud, Laptop, LockKeyhole, LogIn, ShieldCheck, UserRound } from "lucide-react";
import { useUISettings } from "./i18n";

type AccountSettingsPanelProps = {
  identity: LocalIdentity | null;
  onSave: (displayName: string) => Promise<LocalIdentity>;
  authState: AuthState | null;
  onOpenAuth: (mode?: "choice" | "password" | "signup" | "reset") => void;
  onSignOut: () => Promise<AuthState>;
};

export default function AccountSettingsPanel({ identity, onSave, authState, onOpenAuth, onSignOut }: AccountSettingsPanelProps) {
  const { t } = useUISettings();
  const [name, setName] = useState(identity?.displayName ?? "");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved">("idle");
  const [error, setError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  useEffect(() => {
    setName(identity?.displayName ?? "");
  }, [identity?.displayName]);

  async function save() {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      await onSave(name);
      setStatus("saved");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    setAuthBusy(true);
    setError("");
    try { await onSignOut(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setAuthBusy(false); }
  }

  return <div className="settings-sections account-settings">
    <section className="settings-section">
      <h3 className="settings-section-title">{t("Local profile")}</h3>
      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-copy">
            <span className="settings-row-title"><UserRound size={14} />{t("Display name")}</span>
            <p className="settings-row-description">{t("Shown on threads and project activity. Stored on this device.")}</p>
          </div>
          <div className="settings-row-control account-name-control">
            <input
              className="settings-text-input"
              value={name}
              maxLength={80}
              onChange={(event) => { setName(event.target.value); setStatus("idle"); setError(""); }}
              onKeyDown={(event) => { if (event.key === "Enter") void save(); }}
              placeholder={t("Your name")}
              aria-label={t("Display name")}
            />
            <button className="primary-button account-save" disabled={!name.trim() || saving || name.trim() === identity?.displayName} onClick={() => void save()}>
              {saving ? t("Saving…") : status === "saved" ? t("Saved") : t("Save")}
            </button>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-copy">
            <span className="settings-row-title"><Laptop size={14} />{t("This device")}</span>
            <p className="settings-row-description">{identity?.deviceName || t("Loading device identity…")}</p>
          </div>
          <div className="settings-row-control account-device-id">
            <code title={identity?.deviceId || ""}>{identity?.deviceId ? `${identity.deviceId.slice(0, 18)}…` : "—"}</code>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-copy">
            <span className="settings-row-title"><ShieldCheck size={14} />{t("Local user ID")}</span>
            <p className="settings-row-description">{t("Local projects and agent runs do not require an account.")}</p>
          </div>
          <div className="settings-row-control account-device-id">
            <code title={identity?.userId || ""}>{identity?.userId ? `${identity.userId.slice(0, 18)}…` : "—"}</code>
          </div>
        </div>
      </div>
      {error && <p className="settings-group-note warning">{error}</p>}
    </section>

    <section className="settings-section">
      <h3 className="settings-section-title">{t("Cloud account")}</h3>
      <div className="settings-group">
        {authState?.user ? <>
          <div className="settings-row account-cloud-identity">
            <span className="account-avatar large">{(authState.user.displayName || authState.user.email).slice(0, 1).toUpperCase()}</span>
            <div className="settings-row-copy">
              <span className="settings-row-title">{authState.user.displayName || authState.user.email}</span>
              <p className="settings-row-description">{authState.user.email} · {t("Free plan")}</p>
            </div>
            <div className="settings-row-control"><button className="secondary-button" disabled={authBusy} onClick={() => void signOut()}>{t("Sign out")}</button></div>
          </div>
          <div className="settings-row">
            <div className="settings-row-copy">
              <span className="settings-row-title"><Cloud size={14} />{t("Cloud runtime")}</span>
              <p className="settings-row-description">{t("Gated. Credits and cloud runs will appear here when the runtime is enabled.")}</p>
            </div>
            <div className="settings-row-control"><button className="secondary-button" onClick={() => onOpenAuth("password")}><LockKeyhole size={13} />{t("Change password")}</button></div>
          </div>
          <div className="settings-row">
            <div className="settings-row-copy">
              <span className="settings-row-title"><ShieldCheck size={14} />{t("Data & privacy")}</span>
              <p className="settings-row-description">{t("Signing out keeps local projects and files. Shared project exports are available from Members.")}</p>
            </div>
            <div className="settings-row-control">{authState?.providers?.magicLink && <button className="secondary-button" onClick={() => onOpenAuth("reset")}>{t("Reset password")}</button>}</div>
          </div>
        </> : <div className="settings-row settings-row-stacked account-auth-row">
          <div className="settings-row-copy">
            <span className="settings-row-title">{t("Sign in to collaborate")}</span>
            <p className="settings-row-description">{authState?.configured === false ? t("Supabase auth is not configured.") : t("Use email/password, an email link, or a provider. Local features stay available without an account.")}</p>
          </div>
          <div className="settings-row-control account-auth-control">
            <button className="primary-button" disabled={authState?.configured === false} onClick={() => onOpenAuth("choice")}><LogIn size={13} />{t("Sign in")}</button>
            <button className="secondary-button" disabled={authState?.configured === false} onClick={() => onOpenAuth("signup")}>{t("Create account")}</button>
            {authState?.providers?.magicLink && <button className="secondary-button" onClick={() => onOpenAuth("reset")}>{t("Reset password")}</button>}
          </div>
          {authState?.error && <p className="settings-group-note warning">{authState.error}</p>}
        </div>}
      </div>
    </section>

    <section className="settings-section">
      <h3 className="settings-section-title">{t("Security & data")}</h3>
      <div className="settings-group">
        <div className="settings-row"><div className="settings-row-copy"><span className="settings-row-title">{t("Session storage")}</span><p className="settings-row-description">{t("Refresh tokens are encrypted with the operating system keychain when available.")}</p></div></div>
        <div className="settings-row"><div className="settings-row-copy"><span className="settings-row-title">{t("Sign-out behavior")}</span><p className="settings-row-description">{t("Signing out clears cloud tokens only. Local databases, papers, and files remain untouched.")}</p></div></div>
        <div className="settings-row"><div className="settings-row-copy"><span className="settings-row-title">{t("Upload boundary")}</span><p className="settings-row-description">{t("Cloud runs upload the prompt, explicit attachments, and selected context, not the whole project.")}</p></div></div>
      </div>
    </section>
  </div>;
}
