import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, FileCode, LoaderCircle, Pin, PinOff, Play, RefreshCw, Square, Terminal, Trash } from "lucide-react";
import { useUISettings } from "./i18n";
import { researchAppCategories } from "./research-apps";
import { StateView } from "./StateView";
import "./research-app-runtime.css";

export default function ResearchAppsView({ bridge, workspace, apps, appId, onRefresh, onOpen, onBack }: {
  bridge: ResearchDeskBridge;
  workspace: string;
  apps: GeneratedResearchApp[];
  appId?: string;
  onRefresh: () => void;
  onOpen: (id: string) => void;
  onBack: () => void;
}) {
  const { t } = useUISettings();
  const app = apps.find((item) => item.id === appId);
  const [runtime, setRuntime] = useState<ResearchAppRuntimeStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [settingUp, setSettingUp] = useState(false);
  const [error, setError] = useState("");
  const [logsOpen, setLogsOpen] = useState(false);
  const [frameVersion, setFrameVersion] = useState(0);
  const alive = useRef(true);
  const frame = useRef<HTMLIFrameElement>(null);
  const attempted = useRef("");
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { setRuntime(app ?? null); }, [app?.id, app?.status, app?.url, app?.error]);
  const action = useCallback(async (operation: "start" | "stop" | "setup" | "install" | "pin" | "remove") => {
    if (!app) return;
    setBusy(true); setError("");
    try {
      if (operation === "start" || operation === "stop") {
        if (operation === "start") setRuntime({ status: "starting", url: null, logs: "", error: "" });
        const result = await (operation === "start" ? bridge.startResearchApp(workspace, app.id) : bridge.stopResearchApp(workspace, app.id));
        if (alive.current) setRuntime(result);
      } else if (operation === "setup") {
        setSettingUp(true);
        await bridge.setupResearchApp(workspace, app.id);
        const result = await bridge.stopResearchApp(workspace, app.id);
        if (alive.current) setRuntime(result);
      }
      else if (operation === "install") await bridge.installResearchApp(workspace, app.id);
      else if (operation === "pin") await bridge.pinResearchApp(workspace, app.id, !app.pinned);
      else await bridge.removeResearchApp(workspace, app.id);
      onRefresh();
    } catch (reason) { if (alive.current) setError(String(reason).replace(/^Error invoking remote method '[^']+':\s*/, "")); }
    finally { if (alive.current) { setBusy(false); setSettingUp(false); } }
  }, [app, bridge, workspace, onRefresh]);
  useEffect(() => {
    const key = `${workspace}:${app?.id}`;
    if (!app || attempted.current === key) return;
    attempted.current = key;
    if (app.installed && app.pinned && !app.needsSetup && app.status === "stopped") void action("start");
  }, [app, workspace, action]);
  useEffect(() => {
    if (!logsOpen || !appId) return;
    let active = true;
    const update = () => { void bridge.researchAppStatus(workspace, appId).then((value) => { if (active) setRuntime(value); }).catch(() => undefined); };
    update();
    const timer = window.setInterval(update, 2000);
    return () => { active = false; window.clearInterval(timer); };
  }, [logsOpen, appId, bridge, workspace]);
  const state = runtime ?? app;
  const agentsKey = app?.agents?.join(",") || "";
  useEffect(() => {
    if (!state?.url || state.status !== "running" || !appId || !app?.agents?.length) return;
    const origin = new URL(state.url).origin;
    let current = true;
    const receive = (event: MessageEvent) => {
      const data = event.data;
      if (event.origin !== origin || event.source !== frame.current?.contentWindow || !data || data.type !== "archimedes:agent-request" || typeof data.requestId !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(data.requestId) || typeof data.backend !== "string" || !app.agents?.includes(data.backend) || typeof data.prompt !== "string" || !data.prompt.trim() || data.prompt.length > 12000) return;
      const target = frame.current?.contentWindow;
      void bridge.runResearchAppAgent(workspace, appId, { backend: data.backend, prompt: data.prompt }).then(
        (result) => { if (current && target === frame.current?.contentWindow) target?.postMessage({ type: "archimedes:agent-result", requestId: data.requestId, result }, origin); },
        (reason) => { if (current && target === frame.current?.contentWindow) target?.postMessage({ type: "archimedes:agent-result", requestId: data.requestId, error: String(reason).slice(0, 2000) }, origin); },
      );
    };
    window.addEventListener("message", receive);
    return () => { current = false; window.removeEventListener("message", receive); };
  }, [state?.url, state?.status, appId, agentsKey, bridge, workspace]);
  if (!appId) return <section className="created-apps-view">
    <header className="created-apps-heading"><div><p>{t("CREATE / YOUR WORKSPACE")}</p><h1>{t("Created Research Apps")}</h1><span>{t("Preview an app, then choose whether to install and pin it.")}</span></div><button className="created-apps-action" onClick={onRefresh}><RefreshCw size={14} />{t("Refresh")}</button></header>
    {!apps.length ? <StateView icon={<FileCode size={24} />} title={t("No Research Apps yet")} description={t("Ask Create to save an app with research-app.json inside research-apps/<app-id>. Refresh here when it is ready.")} /> : <div className="created-apps-list">{apps.map((item) => <button key={item.id} className="created-app-card" onClick={() => onOpen(item.id)}>
      <span className="created-app-card-category">{t(researchAppCategories.find((category) => category.id === item.category)?.label ?? "Research Apps")}</span>
      <strong>{item.name}</strong><span>{item.description || item.error}</span>
      <footer><span>{t(item.status === "running" ? "Running" : item.installed ? "Installed" : "Draft")}</span>{item.pinned && <Pin size={13} />}<span>{t("Open preview")} →</span></footer>
    </button>)}</div>}
  </section>;
  return <section className="research-app-host">
    <header className="research-app-toolbar">
      <button className="created-apps-action" onClick={onBack} aria-label={t("Back to created apps")}><ArrowLeft size={15} /></button>
      <div className="research-app-title"><h1>{app?.name || appId}</h1><span>{t(settingUp ? "Preparing environment…" : app?.needsSetup ? "Setup required" : state?.status === "running" ? "Running" : state?.status === "starting" ? "Starting…" : state?.status === "failed" ? "Failed" : "Stopped")}</span></div>
      <div className="research-app-controls">
        {app?.needsSetup && state?.status !== "running" && state?.status !== "starting" && <button className="created-apps-action primary" disabled={busy} onClick={() => void action("setup")}>{t(settingUp ? "Preparing environment…" : "Set up dependencies")}</button>}
        <button className="created-apps-action" onClick={() => setLogsOpen((value) => !value)} aria-pressed={logsOpen}><Terminal size={14} />{t("Logs")}</button>
        {state?.status === "running" && <button className="created-apps-action" onClick={() => setFrameVersion((value) => value + 1)}><RefreshCw size={14} />{t("Reload preview")}</button>}
        {state?.status === "running" || state?.status === "starting" ? <button className="created-apps-action" onClick={() => void action("stop")}><Square size={13} />{t("Stop app")}</button> : !app?.needsSetup && <button className="created-apps-action" disabled={busy || !app || app.status === "invalid"} onClick={() => void action("start")}><Play size={13} />{t("Start preview")}</button>}
        {app?.installed ? <><button className="created-apps-action" disabled={busy} onClick={() => void action("pin")}>{app.pinned ? <PinOff size={14} /> : <Pin size={14} />}{t(app.pinned ? "Unpin app" : "Pin app")}</button><button className="created-apps-action" disabled={busy} onClick={() => void action("remove")} title={t("Uninstall app; keep its files")} aria-label={t("Uninstall app; keep its files")}><Trash size={14} /></button></> : <button className="created-apps-action primary" disabled={busy || !app || app.needsSetup || app.status === "invalid"} onClick={() => void action("install")}><Pin size={14} />{t("Install and pin")}</button>}
      </div>
    </header>
    {(error || (!app?.needsSetup && state?.error)) && <p className="research-app-error" role="alert">{error || state?.error}</p>}
    {logsOpen && <pre className="research-app-logs" aria-label={t("App runtime logs")}>{state?.logs || t("No runtime logs yet.")}</pre>}
    <div className="research-app-preview">
      {state?.status === "running" && state.url ? <iframe ref={frame} key={`${state.url}:${frameVersion}`} src={state.url} title={app?.name || appId} sandbox="allow-scripts allow-same-origin allow-forms allow-downloads" allow="camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'" referrerPolicy="no-referrer" /> : <StateView
        tone={settingUp || state?.status === "starting" ? "loading" : app?.needsSetup ? "empty" : state?.status === "failed" || state?.status === "invalid" ? "error" : "empty"}
        icon={settingUp || state?.status === "starting" ? <LoaderCircle size={23} className="spin" /> : <FileCode size={23} />}
        title={t(settingUp ? "Preparing environment…" : app?.needsSetup ? "Set up this app first" : state?.status === "starting" ? "Starting app…" : state?.status === "failed" ? "App could not start" : state?.status === "invalid" ? "App manifest is invalid" : "Ready to preview")}
        description={t(app?.needsSetup ? "Prepare this app's Python environment, then start the preview." : "Archimedes manages this app's process. Local code runs with your user permissions; Agent requests require approval.")}
      />}
    </div>
  </section>;
}
