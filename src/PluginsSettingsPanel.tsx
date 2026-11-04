import { useCallback, useEffect, useState } from "react";
import { Download, LoaderCircle, Puzzle, Trash2 } from "lucide-react";

import { useUISettings } from "./i18n";
import { coreSidebarEntries } from "./sidebar-registry";
import { SettingsGroup, SettingsRow, SettingsSection, SettingsSwitch } from "./SettingsPrimitives";

function readable(value: unknown, fallback: string) {
  const message = value instanceof Error ? value.message : String(value ?? "");
  return message.replace(/^Error invoking remote method '[^']+':\s*/i, "").replace(/^Error:\s*/i, "").trim() || fallback;
}

/**
 * Sidebar plugins are managed here — not in Extensions, which stays the
 * marketplace for MCP servers and skills. Installing, enabling, disabling,
 * and removing a sidebar module all happen in this panel, and every change
 * reloads the live sidebar through onPluginsChanged.
 */
export default function PluginsSettingsPanel({ bridge, workspace, onPluginsChanged, disabledCoreModules, onCoreModuleEnabled }: {
  bridge: ResearchDeskBridge;
  workspace: string;
  onPluginsChanged?: () => void;
  disabledCoreModules: string[];
  onCoreModuleEnabled: (id: string, enabled: boolean) => void;
}) {
  const { t } = useUISettings();
  const [plugins, setPlugins] = useState<SidebarPluginRecord[]>([]);
  const [available, setAvailable] = useState<ExtensionMarketplaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const hiddenCore = new Set(disabledCoreModules);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [installed, feed] = await Promise.all([
        bridge.listSidebarPlugins(),
        bridge.listExtensions({ workspace, limit: 72 }).catch(() => null),
      ]);
      setPlugins(installed);
      setAvailable((feed?.items || []).filter((item) => item.type === "ui-plugin"));
    } catch (reason) {
      setError(readable(reason, "Could not load the sidebar plugins."));
    } finally {
      setLoading(false);
    }
  }, [bridge, workspace]);

  useEffect(() => { void load(); }, [load]);

  async function toggle(record: SidebarPluginRecord, enabled: boolean) {
    setBusy(record.id);
    setNotice("");
    try {
      setPlugins(await bridge.setSidebarPluginEnabled(record.id, enabled));
      onPluginsChanged?.();
    } catch (reason) {
      setNotice(readable(reason, "The plugin could not be updated."));
    } finally {
      setBusy("");
    }
  }

  async function remove(record: SidebarPluginRecord) {
    setBusy(record.id);
    setNotice("");
    try {
      setPlugins(await bridge.removeSidebarPlugin(record.id));
      onPluginsChanged?.();
      setNotice(t("Removed {name}.", { name: record.name }));
    } catch (reason) {
      setNotice(readable(reason, "The plugin could not be removed."));
    } finally {
      setBusy("");
    }
  }

  async function install(item: ExtensionMarketplaceItem) {
    setBusy(item.id);
    setNotice("");
    try {
      await bridge.installExtension({ id: item.id, workspace });
      await load();
      onPluginsChanged?.();
      setNotice(t("Installed {name}.", { name: item.name }));
    } catch (reason) {
      setNotice(readable(reason, "The plugin could not be installed."));
    } finally {
      setBusy("");
    }
  }

  return <div className="settings-sections">
    <SettingsSection title={t("Built-in modules")}>
      <SettingsRow
        stacked
        description={t("Every sidebar module is a plugin. Toggle a built-in module to hide or show it; changes apply immediately.")}
      />
      <SettingsGroup className="plugins-settings-list">
        {coreSidebarEntries.map((entry) => <SettingsRow
          key={entry.id}
          title={t(entry.labelKey)}
          description={t(entry.section === "knowledge" ? "Knowledge column" : "Create column")}
          icon={<entry.icon size={14} />}
        >
          <SettingsSwitch
            checked={!hiddenCore.has(entry.id)}
            label={hiddenCore.has(entry.id) ? t("Enable") : t("Disable")}
            disabled={busy === entry.id}
            onChange={(enabled) => onCoreModuleEnabled(entry.id, enabled)}
          />
        </SettingsRow>)}
      </SettingsGroup>
    </SettingsSection>
    <SettingsSection title={t("Sidebar plugins")}>
      <SettingsRow
        stacked
        description={t("Sidebar modules add one view to the Knowledge or Create column. Changes apply immediately.")}
      />
      {error && <p className="settings-row-hint">{error}</p>}
      {loading && <p className="settings-row-hint"><LoaderCircle className="spin" size={13} /> {t("Loading…")}</p>}
      {!loading && !plugins.length && <p className="settings-row-hint">{t("No sidebar plugins installed yet.")}</p>}
      {!loading && plugins.length > 0 && <SettingsGroup className="plugins-settings-list">
        {plugins.map((record) => <SettingsRow
          key={record.id}
          title={record.name}
          description={record.error || `${record.version} · ${record.source || "Archimedes index"}`}
          icon={<Puzzle size={14} />}
        >
          <SettingsSwitch
            checked={record.enabled}
            label={record.enabled ? t("Disable") : t("Enable")}
            disabled={Boolean(record.error) || busy === record.id}
            onChange={(enabled) => void toggle(record, enabled)}
          />
          <button className="settings-inline-action" title={t("Remove")} onClick={() => void remove(record)} disabled={busy === record.id}>
            <Trash2 size={13} />
          </button>
        </SettingsRow>)}
      </SettingsGroup>}
    </SettingsSection>
    <SettingsSection title={t("Available plugins")}>
      {!available.length && <p className="settings-row-hint">{t("No plugins available yet.")}</p>}
      {available.length > 0 && <SettingsGroup className="plugins-settings-list">
        {available.map((item) => {
          const installed = plugins.some((record) => record.id === item.id.split("/").pop());
          return <SettingsRow
            key={item.id}
            title={item.name}
            description={`${item.version} · ${item.description}`}
            icon={<Puzzle size={14} />}
          >
            {installed ? <span className="settings-row-hint">{t("Installed")}</span> : <button className="settings-inline-action" title={t("Install")} onClick={() => void install(item)} disabled={busy === item.id}>
              {busy === item.id ? <LoaderCircle className="spin" size={13} /> : <Download size={13} />}
            </button>}
          </SettingsRow>;
        })}
      </SettingsGroup>}
    </SettingsSection>
    {notice && <p className="settings-row-hint">{notice}</p>}
  </div>;
}
