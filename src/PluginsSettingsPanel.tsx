import { useCallback, useEffect, useState } from "react";
import { Download, LoaderCircle, Puzzle, Trash2 } from "lucide-react";

import { useUISettings } from "./i18n";
import { coreSidebarEntries } from "./sidebar-registry";
import { SettingsChoiceGroup, SettingsGroup, SettingsRow, SettingsSection, SettingsSwitch } from "./SettingsPrimitives";

function readable(value: unknown, fallback: string) {
  const message = value instanceof Error ? value.message : String(value ?? "");
  return message.replace(/^Error invoking remote method '[^']+':\s*/i, "").replace(/^Error:\s*/i, "").trim() || fallback;
}

/**
 * Sidebar micro apps are managed here — not in Extensions, which stays the
 * marketplace for MCP servers and skills. Installing, enabling, disabling,
 * and removing a micro app all happen in this panel, and every change
 * reloads the live sidebar through onPluginsChanged.
 */
export default function PluginsSettingsPanel({ bridge, workspace, onPluginsChanged, disabledCoreModules, onCoreModuleEnabled, sidebarLayout, onSidebarLayoutChange }: {
  bridge: ResearchDeskBridge;
  workspace: string;
  onPluginsChanged?: () => void;
  disabledCoreModules: string[];
  onCoreModuleEnabled: (id: string, enabled: boolean) => void;
  sidebarLayout: "flat" | "tabs" | "sections";
  onSidebarLayoutChange: (layout: "flat" | "tabs" | "sections") => void;
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
      setError(readable(reason, "Could not load the micro apps."));
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
      setNotice(readable(reason, "The micro app could not be updated."));
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
      setNotice(readable(reason, "The micro app could not be removed."));
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
      setNotice(readable(reason, "The micro app could not be installed."));
    } finally {
      setBusy("");
    }
  }

  return <div className="settings-sections">
    <SettingsSection title={t("Sidebar layout")}>
      <SettingsRow
        stacked
        description={t("Micro app is one section by default. Group tabs and group sections split it into the Knowledge, Create and Evaluate groups; Work stays a separate section.")}
      />
      <SettingsChoiceGroup
        value={sidebarLayout}
        label={t("Sidebar layout")}
        onChange={onSidebarLayoutChange}
        options={[
          { value: "flat", label: t("Flat") },
          { value: "tabs", label: t("Group tabs") },
          { value: "sections", label: t("Group sections") },
        ]}
      />
      <p className="settings-row-hint">
        {sidebarLayout === "flat"
          ? t("All micro apps stay in one list; Knowledge, Create and Evaluate are merged.")
          : sidebarLayout === "tabs"
            ? t("A simple text tab row inside Micro app; one group is visible at a time.")
            : t("Stacked group headings inside Micro app; every group is visible.")}
      </p>
    </SettingsSection>
    <SettingsSection title={t("Built-in micro apps")}>
      <SettingsRow
        stacked
        description={t("Every sidebar entry is a micro app. Toggle a built-in one to hide or show it; changes apply immediately.")}
      />
      <SettingsGroup className="plugins-settings-list">
        {coreSidebarEntries.map((entry) => <SettingsRow
          key={entry.id}
          title={t(entry.labelKey)}
          description={t(entry.section === "knowledge" ? "Knowledge column" : entry.section === "create" ? "Create column" : "Evaluate column")}
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
    <SettingsSection title={t("Installed micro apps")}>
      <SettingsRow
        stacked
        description={t("Micro apps add one view to the Knowledge, Create or Evaluate column. Changes apply immediately.")}
      />
      {error && <p className="settings-row-hint">{error}</p>}
      {loading && <p className="settings-row-hint"><LoaderCircle className="spin" size={13} /> {t("Loading…")}</p>}
      {!loading && !plugins.length && <p className="settings-row-hint">{t("No micro apps installed yet.")}</p>}
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
    <SettingsSection title={t("Available micro apps")}>
      {!available.length && <p className="settings-row-hint">{t("No micro apps available yet.")}</p>}
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
