import { useEffect, useRef, useState } from "react";
import { Download, ExternalLink, LoaderCircle, LogIn, RefreshCw } from "lucide-react";
import { useUISettings } from "./i18n";

type NativeBackend = Exclude<AgentBackendConfig["backend"], "api">;
const phaseLabels: Record<string, string> = {
  detecting: "Looking for an installed CLI…", resolving: "Finding the official release…",
  downloading: "Downloading CLI…", verifying: "Verifying and preparing CLI…", installed: "CLI installed",
  cancelled: "Installation cancelled", failed: "Installation failed",
};
export default function HarnessSetupPanel({ bridge, backend, binary, active, disabled, onInstalled, onBusy }: {
  bridge: ResearchDeskBridge; backend: NativeBackend; binary: string; active: boolean; disabled: boolean;
  onInstalled: (result: HarnessCliInstallation) => void; onBusy: (busy: boolean) => void;
}) {
  const { t } = useUISettings();
  const [found, setFound] = useState<HarnessCliInstallation | null>(null);
  const [busy, setBusy] = useState<"detect" | "install" | "login" | null>(null);
  const [phase, setPhase] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const alive = useRef(false);
  const installing = useRef(false);
  const operation = useRef(false);
  const installedBinary = useRef("");
  const currentBinary = useRef(binary); currentBinary.current = binary;
  const callbacks = useRef({ onInstalled, onBusy }); callbacks.current = { onInstalled, onBusy };
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; if (installing.current) void bridge.cancelHarnessInstall(backend).catch(() => {}); };
  }, [backend, bridge]);
  useEffect(() => {
    if (!active || operation.current || installedBinary.current === binary) return;
    let valid = true;
    setFound(null); setBusy("detect"); setError(""); setMessage("");
    void Promise.resolve().then(() => bridge.detectHarnessCli({ backend, binary })).then(result => {
      if (valid) setFound(result);
    }).catch(reason => { if (valid) setError(cleanError(reason)); }).finally(() => { if (valid) setBusy(null); });
    return () => { valid = false; };
  }, [active, backend, binary, bridge, attempt]);
  useEffect(() => {
    if (busy !== "install") return;
    let valid = true; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { const state = await bridge.getHarnessInstallStatus(backend); if (valid) setPhase(state.phase); } catch { /* The install request reports failures. */ }
      if (valid) timer = setTimeout(() => void poll(), 600);
    };
    void poll();
    return () => { valid = false; clearTimeout(timer); };
  }, [backend, bridge, busy]);
  function cleanError(reason: unknown) { return String(reason).replace(/^Error invoking remote method '[^']+': Error:\s*|^Error:\s*/, ""); }
  async function run(action: "install" | "login") {
    if (operation.current) return;
    operation.current = true; installing.current = action === "install";
    const originalBinary = binary;
    callbacks.current.onBusy(true); setBusy(action); setPhase("detecting"); setError(""); setMessage("");
    try {
      if (action === "install") {
        const result = await bridge.installHarnessCli(backend);
        if (!alive.current) return;
        if (currentBinary.current === originalBinary) { installedBinary.current = result.binary || ""; setFound(result); callbacks.current.onInstalled(result); }
        setMessage(t("CLI ready. Sign in, then check the connection below."));
      } else {
        await bridge.loginHarnessCli({ backend, binary });
        if (alive.current) setMessage(t("Complete sign-in in the terminal or browser, then return and check the connection below."));
      }
    } catch (reason) { if (alive.current) setError(cleanError(reason)); }
    finally { operation.current = false; installing.current = false; if (alive.current) { setBusy(null); callbacks.current.onBusy(false); } }
  }
  return <div className="harness-setup">
    <div className="harness-setup-heading"><strong>{t("CLI setup")}</strong><span className="agent-backend-note" role="status">{busy === "install" ? t(phaseLabels[phase] || "Downloading CLI…") : busy === "detect" ? t("Looking for an installed CLI…") : found?.installed ? t("CLI installed") : found ? t("CLI not found") : t("Installation not checked")}</span></div>
    {found?.installed && <small className="agent-backend-note harness-cli-version">{found.version}</small>}
    <p>{t("Install the official CLI here, then sign in with your own account. An installed CLI is not a verified connection.")}</p>
    <div className="harness-setup-actions">
      {!found?.installed && <button type="button" className="secondary-button" disabled={disabled || busy !== null} onClick={() => void run("install")}>
        {busy === "install" ? <LoaderCircle className="spin" size={14} /> : <Download size={14} />}{t("Install CLI")}
      </button>}
      {found?.installed && <button type="button" className="secondary-button" disabled={disabled || busy !== null} onClick={() => void run("login")}><LogIn size={14} />{t("Sign in / Connect provider")}</button>}
      {busy === "install" ? <button type="button" className="secondary-button" onClick={() => void bridge.cancelHarnessInstall(backend).catch(reason => setError(cleanError(reason)))}>{t("Cancel installation")}</button> : <button type="button" className="secondary-button" disabled={disabled || busy !== null} onClick={() => { installedBinary.current = ""; setAttempt(value => value + 1); }}><RefreshCw size={14} />{t("Detect again")}</button>}
      {found?.docsUrl && <button type="button" className="secondary-button" disabled={disabled} onClick={() => void bridge.openExternalUrl(found.docsUrl).catch(reason => setError(cleanError(reason)))}><ExternalLink size={14} />{t("Setup guide")}</button>}
    </div>
    <small className="agent-backend-note">{t("Managed installs stay inside Archimedes app data. Existing CLI installations are reused; system PATH is unchanged.")}</small>
    {message && <p className="harness-setup-message" role="status">{message}</p>}
    {error && <p className="harness-setup-message error" role="alert">{t(error)}</p>}
  </div>;
}
