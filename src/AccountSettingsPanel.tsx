import { useEffect, useState } from "react";
import { Laptop, ShieldCheck, UserRound } from "lucide-react";
import { useUISettings } from "./i18n";

type AccountSettingsPanelProps = {
  identity: LocalIdentity | null;
  onSave: (displayName: string) => Promise<LocalIdentity>;
};

export default function AccountSettingsPanel({ identity, onSave }: AccountSettingsPanelProps) {
  const { t } = useUISettings();
  const [name, setName] = useState(identity?.displayName ?? "");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved">("idle");
  const [error, setError] = useState("");

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
      <h3 className="settings-section-title">{t("Collaboration")}</h3>
      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-copy">
            <span className="settings-row-title">{t("Cloud sign-in")}</span>
            <p className="settings-row-description">{t("Multi-user projects and shared libraries will attach to this local identity in a later update.")}</p>
          </div>
          <div className="settings-row-control"><span className="account-status">{t("Not available yet")}</span></div>
        </div>
      </div>
    </section>
  </div>;
}
