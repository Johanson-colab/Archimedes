import { useCallback, useEffect, useState } from "react";
import { BookOpen, Download, FilePen, FlaskConical, ImagePlus, LoaderCircle, Puzzle, Radar, Trash } from "lucide-react";

import { useUISettings } from "./i18n";
import { researchAppCategories, researchAppCategory } from "./research-apps";
import { coreSidebarEntries } from "./sidebar-registry";
import { SettingsGroup, SettingsRow, SettingsSection, SettingsSwitch } from "./SettingsPrimitives";

function readable(value: unknown, fallback: string) {
  const message = value instanceof Error ? value.message : String(value ?? "");
  return message.replace(/^Error invoking remote method '[^']+':\s*/i, "").replace(/^Error:\s*/i, "").trim() || fallback;
}

/** Research Apps management; Extensions remains the MCP and skills marketplace. */
export default function PluginsSettingsPanel({ bridge, workspace, onPluginsChanged, disabledCoreModules, onCoreModuleEnabled }: {
  bridge: ResearchDeskBridge;
  workspace: string;
  onPluginsChanged?: () => void;
  disabledCoreModules: string[];
  onCoreModuleEnabled: (id: string, enabled: boolean) => Promise<void> | void;
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
      setError(readable(reason, t("Could not load the research apps.")));
    } finally {
      setLoading(false);
    }
  }, [bridge, workspace, t]);

  useEffect(() => { void load(); }, [load]);

  async function toggle(record: SidebarPluginRecord, enabled: boolean) {
    setBusy(record.id);
    setNotice("");
    try {
      setPlugins(await bridge.setSidebarPluginEnabled(record.id, enabled));
      onPluginsChanged?.();
    } catch (reason) {
      setNotice(readable(reason, t("The research app could not be updated.")));
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
      setNotice(readable(reason, t("The research app could not be removed.")));
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
      setNotice(readable(reason, t("The research app could not be installed.")));
    } finally {
      setBusy("");
    }
  }

  async function toggleCore(id: string, enabled: boolean) {
    setBusy(id);
    setNotice("");
    try {
      await onCoreModuleEnabled(id, enabled);
    } catch (reason) {
      setNotice(readable(reason, t("The research app could not be updated.")));
    } finally {
      setBusy("");
    }
  }

  const categoryIcons = { discovery: Radar, evidence: BookOpen, experiments: FlaskConical, analysis: ImagePlus, writing: FilePen };
  return <div className="settings-sections">
    <p className="research-apps-summary">{t("Choose apps for your sidebar. Changes apply immediately; hiding an app keeps its research data.")}</p>
    {error && <p className="settings-row-hint" role="alert">{error}</p>}
    {loading && <p className="settings-row-hint"><LoaderCircle className="spin" size={13} /> {t("Loading…")}</p>}
    {notice && <p className="settings-row-hint" role="status">{notice}</p>}
    {researchAppCategories.map((category) => {
      const Icon = categoryIcons[category.id];
      const builtIn = coreSidebarEntries.filter((entry) => entry.researchCategory === category.id);
      const installed = plugins.filter((record) => researchAppCategory(record) === category.id);
      const candidates = available.filter((item) => researchAppCategory(item) === category.id && !plugins.some((record) => record.id === item.id.split("/").pop()));
      return <SettingsSection key={category.id} className="research-apps-category" title={<><Icon size={15} />{t(category.label)}</>}>
        <p className="research-apps-category-description">{t(category.description)}</p>
        <SettingsGroup className="plugins-settings-list">
          {builtIn.map((entry) => <SettingsRow
            key={entry.id}
            title={t(entry.labelKey)}
            description={t(entry.descriptionKey ?? "Built-in research app")}
            icon={<entry.icon size={14} />}
          >
            <SettingsSwitch
              checked={!hiddenCore.has(entry.id)}
              label={t("Show {name} in sidebar", { name: t(entry.labelKey) })}
              disabled={Boolean(busy)}
              onChange={(enabled) => void toggleCore(entry.id, enabled)}
            />
          </SettingsRow>)}
          {installed.map((record) => <SettingsRow
            key={record.id}
            title={record.name}
            description={record.error || `${t("Installed")} · ${record.version} · ${record.source || "Archimedes index"}`}
            icon={<Puzzle size={14} />}
          >
            <SettingsSwitch
              checked={record.enabled}
              label={t("Show {name} in sidebar", { name: record.name })}
              disabled={Boolean(record.error) || Boolean(busy)}
              onChange={(enabled) => void toggle(record, enabled)}
            />
            <button className="settings-inline-action" title={t("Remove")} aria-label={t("Remove {name}", { name: record.name })} onClick={() => void remove(record)} disabled={Boolean(busy)}>
              <Trash size={13} />
            </button>
          </SettingsRow>)}
          {candidates.map((item) => <SettingsRow
            key={item.id}
            title={item.name}
            description={`${t("Available")} · ${item.version} · ${item.description}`}
            icon={<Puzzle size={14} />}
          >
            <button className="settings-inline-action" title={t("Install")} aria-label={t("Install {name}", { name: item.name })} onClick={() => void install(item)} disabled={Boolean(busy)}>
              {busy === item.id ? <LoaderCircle className="spin" size={13} /> : <Download size={13} />}
            </button>
          </SettingsRow>)}
        </SettingsGroup>
      </SettingsSection>;
    })}
  </div>;
}
