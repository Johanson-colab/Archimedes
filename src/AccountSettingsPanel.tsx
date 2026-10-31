import { useEffect, useState } from "react";
import { Laptop, ShieldCheck, UserRound } from "lucide-react";
import { useUISettings } from "./i18n";

type AccountSettingsPanelProps = {
  identity: LocalIdentity | null;
  onSave: (displayName: string) => Promise<LocalIdentity>;
  authState: AuthState | null;
  onSignIn: (email: string, password: string) => Promise<AuthState>;
  onSignUp: (email: string, password: string, displayName?: string) => Promise<AuthState>;
  onSignOut: () => Promise<AuthState>;
};

export default function AccountSettingsPanel({ identity, onSave, authState, onSignIn, onSignUp, onSignOut }: AccountSettingsPanelProps) {
  const { t } = useUISettings();
  const [name, setName] = useState(identity?.displayName ?? "");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved">("idle");
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");

  useEffect(() => {
    setName(identity?.displayName ?? "");
  }, [identity?.displayName]);

  async function signIn() {
    if (!email.trim() || !password || authBusy) return;
    setAuthBusy(true); setAuthError(""); setAuthNotice("");
    try {
      const next = await onSignIn(email, password);
      if (next.user) setAuthNotice("Signed in.");
      else setAuthNotice("Check your email to confirm the account, then sign in.");
    } catch (cause) {
      setAuthError(cause instanceof Error ? cause.message : String(cause));
    } finally { setAuthBusy(false); }
  }

  async function signUp() {
    if (!email.trim() || !password || authBusy) return;
    setAuthBusy(true); setAuthError(""); setAuthNotice("");
    try {
      const next = await onSignUp(email, password, identity?.displayName || "");
      setAuthNotice(next.user ? "Account created and signed in." : "Check your email to confirm the account.");
    } catch (cause) {
      setAuthError(cause instanceof Error ? cause.message : String(cause));
    } finally { setAuthBusy(false); }
  }

  async function signOut() {
    setAuthBusy(true); setAuthError(""); setAuthNotice("");
    try { await onSignOut(); setAuthNotice("Signed out."); }
    catch (cause) { setAuthError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setAuthBusy(false); }
  }

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
            <p className="settings-row-description">{t("A stable identity for future project membership and LAN collaboration.")}</p>
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
        {authState?.user ? <div className="settings-row">
          <div className="settings-row-copy">
            <span className="settings-row-title">{authState.user.email}</span>
            <p className="settings-row-description">{t("Signed in. Shared projects and sync will use this account.")}</p>
          </div>
          <div className="settings-row-control"><button className="secondary-button" disabled={authBusy} onClick={() => void signOut()}>{t("Sign out")}</button></div>
        </div> : <div className="settings-row settings-row-stacked account-auth-row">
          <div className="settings-row-copy">
            <span className="settings-row-title">{t("Sign in to collaborate")}</span>
            <p className="settings-row-description">{authState?.configured === false ? t("Supabase auth is not configured.") : t("Use the email and password for your shared research workspace.")}</p>
          </div>
          <div className="settings-row-control account-auth-control">
            <input className="settings-text-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t("Email")} autoComplete="email" />
            <input className="settings-text-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t("Password")} autoComplete="current-password" />
            <button className="primary-button" disabled={!email.trim() || !password || authBusy || authState?.configured === false} onClick={() => void signIn()}>{t("Sign in")}</button>
            <button className="secondary-button" disabled={!email.trim() || !password || authBusy || authState?.configured === false} onClick={() => void signUp()}>{t("Create account")}</button>
          </div>
          {(authError || authState?.error) && <p className="settings-group-note warning">{authError || authState?.error}</p>}
          {authNotice && <p className="settings-group-note">{authNotice}</p>}
        </div>}
      </div>
    </section>
  </div>;
}
