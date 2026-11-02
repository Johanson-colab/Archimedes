import { useCallback, useEffect, useState } from "react";
import { Check, LoaderCircle, Plus, Server, Trash2 } from "lucide-react";

import { useUISettings } from "./i18n";
import { SettingsGroup, SettingsRow, SettingsSection, SettingsSwitch } from "./SettingsPrimitives";

const EMPTY_DRAFT: SshServerDraft = {
  id: "",
  name: "",
  host: "",
  user: "",
  port: 22,
  identityFile: "",
  workspace: "~/.archimedes",
  useDocker: false,
  password: "",
};

function readable(value: unknown, fallback: string) {
  const message = value instanceof Error ? value.message : String(value ?? "");
  return message.replace(/^Error invoking remote method '[^']+':\s*/i, "").replace(/^Error:\s*/i, "").trim() || fallback;
}

function target(server: { user: string; host: string; port: number }) {
  return `${server.user}@${server.host}${server.port && server.port !== 22 ? `:${server.port}` : ""}`;
}

export default function SshServersPanel({ bridge }: { bridge: ResearchDeskBridge }) {
  const { t } = useUISettings();
  const [servers, setServers] = useState<SshServer[]>([]);
  const [draft, setDraft] = useState<SshServerDraft | null>(null);
  const [busy, setBusy] = useState<"save" | "test" | "delete" | "">("");
  const [status, setStatus] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setServers(await bridge.listSshServers());
    } catch (error) {
      setStatus({ tone: "bad", text: readable(error, "Could not load SSH servers.") });
    }
  }, [bridge]);

  useEffect(() => { void load(); }, [load]);

  const edit = (server?: SshServer) => {
    setStatus(null);
    setDraft(server
      ? { id: server.id, name: server.name, host: server.host, user: server.user, port: server.port, identityFile: server.identityFile, workspace: server.workspace, useDocker: server.useDocker, password: "" }
      : { ...EMPTY_DRAFT });
  };

  const update = (patch: Partial<SshServerDraft>) => setDraft((current) => (current ? { ...current, ...patch } : current));

  async function test(candidate: SshServerDraft) {
    setBusy("test");
    setStatus(null);
    try {
      const result = await bridge.testSshServer(candidate);
      setStatus({ tone: result.ok ? "ok" : "bad", text: result.detail });
    } catch (error) {
      setStatus({ tone: "bad", text: readable(error, "The connection could not be tested.") });
    } finally {
      setBusy("");
    }
  }

  async function save() {
    if (!draft) return;
    setBusy("save");
    setStatus(null);
    try {
      const saved = await bridge.saveSshServer(draft);
      setServers((current) => {
        const exists = current.some((server) => server.id === saved.id);
        return exists ? current.map((server) => (server.id === saved.id ? saved : server)) : [...current, saved];
      });
      setDraft(null);
      setStatus({ tone: "ok", text: t("Saved {name}", { name: saved.name }) });
    } catch (error) {
      setStatus({ tone: "bad", text: readable(error, "The server could not be saved.") });
    } finally {
      setBusy("");
    }
  }

  async function remove(server: SshServer) {
    setBusy("delete");
    setStatus(null);
    try {
      await bridge.deleteSshServer(server.id);
      setServers((current) => current.filter((entry) => entry.id !== server.id));
      if (draft?.id === server.id) setDraft(null);
    } catch (error) {
      setStatus({ tone: "bad", text: readable(error, "The server could not be removed.") });
    } finally {
      setBusy("");
    }
  }

  return <div className="settings-sections settings-ssh-panel">
    <p className="settings-group-note">
      {t("Reproduction jobs run on these machines, each in its own folder. Only connection details are stored here: no passwords and no keys.")}
    </p>

    <SettingsSection title={t("Servers")}>
      {servers.length === 0
        ? <SettingsGroup>
            <SettingsRow title={t("No servers yet")} description={t("Add one to run reproductions somewhere other than this laptop.")} icon={<Server size={13} />}>
              <button className="secondary-button" onClick={() => edit()}><Plus size={14} />{t("Add server")}</button>
            </SettingsRow>
          </SettingsGroup>
        : <SettingsGroup>
            {servers.map((server) => <SettingsRow
              key={server.id}
              title={server.name}
              icon={<Server size={13} />}
              description={target(server)}
              hint={[server.identityFile, server.useDocker ? t("Docker on the server") : ""].filter(Boolean).join(" · ") || undefined}
            >
              <div className="settings-row-actions">
                <button className="secondary-button" disabled={busy !== ""} onClick={() => void test(server)}>{t("Test")}</button>
                <button className="secondary-button" disabled={busy !== ""} onClick={() => edit(server)}>{t("Edit")}</button>
                <button className="quiet-icon-button" title={t("Remove")} disabled={busy !== ""} onClick={() => void remove(server)}><Trash2 size={14} /></button>
              </div>
            </SettingsRow>)}
          </SettingsGroup>}
      {servers.length > 0 && <div className="settings-form-actions">
        <span className={status ? "settings-form-status" : "settings-form-status muted"} role="status">{status?.text || ""}</span>
        <button className="secondary-button" onClick={() => edit()}><Plus size={14} />{t("Add server")}</button>
      </div>}
      {servers.length === 0 && status && <p className={status.tone === "ok" ? "settings-form-status" : "settings-form-status bad"} role="status">{status.text}</p>}
    </SettingsSection>

    {draft && <SettingsSection title={t("New server")}>
      <SettingsGroup>
        <SettingsRow stacked title={t("Name")} description={t("A label for this machine.")}>
          <input className="settings-text-input" value={draft.name} placeholder={t("GPU workstation")} onChange={(event) => update({ name: event.target.value })} />
        </SettingsRow>
        <SettingsRow stacked title={t("Host")} description={t("Hostname or IP address. A port can be written as host:2222.")}>
          <input className="settings-text-input" value={draft.host} placeholder="gpu01.example.com" autoComplete="off" spellCheck={false} onChange={(event) => update({ host: event.target.value })} />
        </SettingsRow>
        <SettingsRow title={t("User")} description={t("The account Archimedes connects as. It must already be able to log in with a key.")}>
          <input className="settings-text-input" value={draft.user} placeholder="ubuntu" autoComplete="off" spellCheck={false} onChange={(event) => update({ user: event.target.value })} />
        </SettingsRow>
        <SettingsRow title={t("Port")} description={t("22 unless the server listens elsewhere.")}>
          <input className="settings-text-input settings-text-input-narrow" type="number" min={1} max={65535} value={draft.port} onChange={(event) => update({ port: Number(event.target.value) || 22 })} />
        </SettingsRow>
        <SettingsRow stacked title={t("Password")} description={t("Only for servers that do not accept a key yet. Stored encrypted on this Mac, never in the workspace.")}>
          <input
            className="settings-text-input"
            type="password"
            value={draft.password || ""}
            placeholder={draft.id ? t("Saved · leave empty to keep it") : t("Leave empty to use your SSH key")}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => update({ password: event.target.value })}
          />
        </SettingsRow>
        <SettingsRow stacked title={t("Identity file")} description={t("Optional. The private key on this laptop, for example ~/.ssh/id_ed25519.")}>
          <input className="settings-text-input" value={draft.identityFile} placeholder="~/.ssh/id_ed25519" autoComplete="off" spellCheck={false} onChange={(event) => update({ identityFile: event.target.value })} />
        </SettingsRow>
        <SettingsRow stacked title={t("Remote folder")} description={t("Where checkouts and logs live on that machine. Each reproduction gets its own directory inside it.")}>
          <input className="settings-text-input" value={draft.workspace} placeholder="~/.archimedes" autoComplete="off" spellCheck={false} onChange={(event) => update({ workspace: event.target.value })} />
        </SettingsRow>
        <SettingsRow title={t("Docker on the server")} description={t("Run each step inside a container there. Recommended: it keeps the server's own Python untouched.")}>
          <SettingsSwitch checked={draft.useDocker} label={t("Docker on the server")} onChange={(checked) => update({ useDocker: checked })} />
        </SettingsRow>
      </SettingsGroup>

      <div className="settings-form-actions">
        <span className={status?.tone === "bad" ? "settings-form-status bad" : "settings-form-status muted"} role="status">{status?.text || ""}</span>
        <button className="secondary-button" disabled={busy !== ""} onClick={() => void test(draft)}>
          {busy === "test" ? <LoaderCircle className="spin" size={14} /> : <Server size={14} />}{t("Test connection")}
        </button>
        <button className="primary-button" disabled={busy !== "" || !draft.host.trim() || !draft.user.trim()} onClick={() => void save()}>
          {busy === "save" ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />}{t("Save server")}
        </button>
      </div>
    </SettingsSection>}
  </div>;
}
