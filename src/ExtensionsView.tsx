import { useEffect, useState } from "react";
import { Boxes, LoaderCircle, Plug, Puzzle, Server } from "lucide-react";
import SkillsView from "./SkillsView";

export type ExtensionsTab = "skills" | "mcp" | "plugins";

export default function ExtensionsView({ bridge, workspace, tab, onTabChange, attachedIds, onAttach }: {
  bridge: ResearchDeskBridge;
  workspace: string;
  tab: ExtensionsTab;
  onTabChange: (tab: ExtensionsTab) => void;
  attachedIds: Set<string>;
  onAttach: (item: ContextAttachment) => void;
}) {
  const [plugins, setPlugins] = useState<ContextAttachment[]>([]);
  const [pluginsLoading, setPluginsLoading] = useState(false);
  const [pluginsError, setPluginsError] = useState("");

  useEffect(() => {
    if (tab !== "plugins") return;
    let active = true;
    setPluginsLoading(true);
    setPluginsError("");
    bridge.listContextResources("plugin", workspace).then((items) => {
      if (active) setPlugins(items);
    }).catch((error) => {
      if (active) setPluginsError(String(error));
    }).finally(() => {
      if (active) setPluginsLoading(false);
    });
    return () => { active = false; };
  }, [bridge, tab, workspace]);

  const tabs: Array<{ id: ExtensionsTab; label: string }> = [
    { id: "skills", label: "Skills" },
    { id: "mcp", label: "MCP servers" },
    { id: "plugins", label: "Plugins" },
  ];

  return <section className="skills-page extensions-page">
    <header className="extensions-header">
      <div className="extensions-heading">
        <span className="page-kicker">Knowledge</span>
        <h1>Extensions</h1>
        <p>Everything that changes what the Agent can do: reusable skills, MCP servers, and installed plugins.</p>
      </div>
      <div className="extensions-tabs" role="tablist" aria-label="Extensions">
        {tabs.map((item) => <button key={item.id} role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : ""} onClick={() => onTabChange(item.id)}>{item.label}</button>)}
      </div>
    </header>

    {tab === "skills" && <SkillsView bridge={bridge} workspace={workspace} attachedIds={attachedIds} onAttach={onAttach} embedded />}

    {tab === "mcp" && <div className="extensions-empty">
      <span className="extensions-empty-icon"><Server size={20} /></span>
      <strong>No MCP servers connected</strong>
      <p>MCP servers add tools and live context sources to the Agent. Server management is coming in a later update.</p>
      <button className="secondary-button" disabled>Add MCP server</button>
      <small>Coming soon</small>
    </div>}

    {tab === "plugins" && <>
      {pluginsLoading && <div className="skills-state"><LoaderCircle className="spin" size={18} />Reading installed plugins...</div>}
      {!pluginsLoading && pluginsError && <div className="skills-error">{pluginsError.replace(/^Error:\s*/, "")}</div>}
      {!pluginsLoading && !pluginsError && !plugins.length && <div className="extensions-empty">
        <span className="extensions-empty-icon"><Puzzle size={20} /></span>
        <strong>No plugins installed</strong>
        <p>Plugins can bundle skills, commands, and MCP servers. Install them outside Archimedes, then reopen this page.</p>
      </div>}
      {!pluginsLoading && !pluginsError && plugins.length > 0 && <div className="extensions-list">
        <div className="extensions-list-head"><span>{plugins.length} installed</span><span className="extensions-list-note"><Boxes size={12} />Shared with the local Agent</span></div>
        {plugins.map((plugin) => <div className="extensions-row" key={plugin.id}>
          <span className="extensions-row-icon"><Plug size={15} /></span>
          <span className="extensions-row-copy"><strong>{plugin.name}</strong><small>{plugin.detail || "Installed plugin"}</small></span>
          <span className="extensions-row-path" title={plugin.path}>{plugin.path}</span>
        </div>)}
      </div>}
    </>}
  </section>;
}
