import { useEffect, useState } from "react";
import { useUISettings } from "./i18n";
import type { BuildInfo } from "./build-info";
import "./build-diagnostics.css";

export default function BuildDiagnostics() {
  const { t } = useUISettings();
  const [info, setInfo] = useState<BuildInfo | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const request = window.researchDesk?.getBuildInfo?.();
    if (!request) setError("Build information is unavailable.");
    else void request.then(value => { if (active) setInfo(value); }).catch(() => { if (active) setError("Build information is unavailable."); });
    return () => { active = false; };
  }, []);
  return <details className="build-diagnostics">
    <summary>{t("Build diagnostics")}</summary>
    {info ? <pre tabIndex={0} aria-label={t("Build diagnostics")}>{JSON.stringify(info, null, 2)}</pre> : <p role="status">{t(error || "Loading build information…")}</p>}
  </details>;
}
