import { useEffect, useState } from "react";
import { Cloud, Laptop, LockKeyhole, LogIn, ShieldCheck, UserRound } from "lucide-react";
import { useUISettings } from "./i18n";
import { SettingsGroup, SettingsRow, SettingsSection } from "./SettingsPrimitives";

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
    <SettingsSection title={t("Local profile")}>
      <SettingsGroup>
        <SettingsRow
          title={t("Display name")}
          icon={<UserRound size={14} />}
          description={t("Shown on threads and project activity. Stored on this device.")}
          controlClassName="account-name-control"
        >
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
        </SettingsRow>
        <SettingsRow
          title={t("This device")}
          icon={<Laptop size={14} />}
          description={identity?.deviceName || t("Loading device identity…")}
          controlClassName="account-device-id"
        >
          <code title={identity?.deviceId || ""}>{identity?.deviceId ? `${identity.deviceId.slice(0, 18)}…` : "—"}</code>
        </SettingsRow>
        <SettingsRow
          title={t("Local user ID")}
          icon={<ShieldCheck size={14} />}
          description={t("Local projects and agent runs do not require an account.")}
          controlClassName="account-device-id"
        >
          <code title={identity?.userId || ""}>{identity?.userId ? `${identity.userId.slice(0, 18)}…` : "—"}</code>
        </SettingsRow>
      </SettingsGroup>
      {error && <p className="settings-group-note warning">{error}</p>}
    </SettingsSection>

    <SettingsSection title={t("Cloud account")}>
      <SettingsGroup>
        {authState?.user ? <>
          <SettingsRow
            className="account-cloud-identity"
            leading={<span className="account-avatar large">{(authState.user.displayName || authState.user.email).slice(0, 1).toUpperCase()}</span>}
            title={authState.user.displayName || authState.user.email}
            description={<>{authState.user.email} · {t("Free plan")}</>}
          >
            <button className="secondary-button" disabled={authBusy} onClick={() => void signOut()}>{t("Sign out")}</button>
          </SettingsRow>
          <SettingsRow
            title={t("Cloud runtime")}
            icon={<Cloud size={14} />}
            description={t("Gated. Credits and cloud runs will appear here when the runtime is enabled.")}
          >
            <button className="secondary-button" onClick={() => onOpenAuth("password")}><LockKeyhole size={13} />{t("Change password")}</button>
          </SettingsRow>
          <SettingsRow
            title={t("Data & privacy")}
            icon={<ShieldCheck size={14} />}
            description={t("Signing out keeps local projects and files. Shared project exports are available from Members.")}
          >
            {authState?.providers?.magicLink && <button className="secondary-button" onClick={() => onOpenAuth("reset")}>{t("Reset password")}</button>}
          </SettingsRow>
        </> : <SettingsRow
          stacked
          className="account-auth-row"
          controlClassName="account-auth-control"
          title={t("Sign in to collaborate")}
          description={authState?.configured === false ? t("Supabase auth is not configured.") : t("Use email/password, an email link, or a provider. Local features stay available without an account.")}
          footer={authState?.error ? <p className="settings-group-note warning">{authState.error}</p> : undefined}
        >
          <button className="primary-button" disabled={authState?.configured === false} onClick={() => onOpenAuth("choice")}><LogIn size={13} />{t("Sign in")}</button>
          <button className="secondary-button" disabled={authState?.configured === false} onClick={() => onOpenAuth("signup")}>{t("Create account")}</button>
          {authState?.providers?.magicLink && <button className="secondary-button" onClick={() => onOpenAuth("reset")}>{t("Reset password")}</button>}
        </SettingsRow>}
      </SettingsGroup>
    </SettingsSection>

    <SettingsSection title={t("Security & data")}>
      <SettingsGroup>
        <SettingsRow
          title={t("Session storage")}
          description={t("Refresh tokens are encrypted with the operating system keychain when available.")}
        />
        <SettingsRow
          title={t("Sign-out behavior")}
          description={t("Signing out clears cloud tokens only. Local databases, papers, and files remain untouched.")}
        />
        <SettingsRow
          title={t("Upload boundary")}
          description={t("Cloud runs upload the prompt, explicit attachments, and selected context, not the whole project.")}
        />
      </SettingsGroup>
    </SettingsSection>
  </div>;
}
