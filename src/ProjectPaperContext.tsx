import { useEffect, useState } from "react";
import { useUISettings } from "./i18n";
import { InlineNotice } from "./InlineNotice";
import type { ProjectPaperSelection, SelectionBridge } from "./project-paper-selection";

export default function ProjectPaperContext({ bridge, paperId, projectId }: { bridge: ResearchDeskBridge; paperId: string; projectId?: string | null }) {
  const { t } = useUISettings();
  const [selection, setSelection] = useState<ProjectPaperSelection | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setSelection(null); setReason(""); setError(""); setLoading(true);
    if (projectId && (bridge as SelectionBridge).getProjectPaperSelection) {
      void (bridge as SelectionBridge).getProjectPaperSelection(paperId, projectId).then((next) => {
        if (active) { setSelection(next); setReason(next?.reason || ""); }
      }).catch((cause) => { if (active) setError(String(cause)); }).finally(() => { if (active) setLoading(false); });
    }
    return () => { active = false; };
  }, [bridge, paperId, projectId]);
  if (!projectId) return null;
  async function save() {
    setBusy(true); setError("");
    try {
      const next = await (bridge as SelectionBridge).saveProjectPaperSelection(paperId, projectId!, { reason });
      setSelection(next);
    } catch (cause) { setError(String(cause)); }
    finally { setBusy(false); }
  }
  const discovery = selection?.discovery;
  return <section className="paper-project-context">
    <h3>{t("Why this paper in this project")}</h3>
    <p>{t("Project selection reasons are separate from your personal reading notes.")}</p>
    <textarea aria-label={t("Project selection reason")} value={reason} disabled={loading} onChange={(event) => setReason(event.target.value)} />
    <button className="secondary-button" disabled={busy || reason === (selection?.reason || "")} onClick={() => void save()}>{t(busy ? "Saving" : "Save selection reason")}</button>
    {error && <InlineNotice tone="danger">{error}</InlineNotice>}
    {discovery && <details><summary>{t("Discovery source and criteria")}</summary>
      {typeof discovery.query === "string" && <p>{discovery.query}</p>}
      <p>{Array.isArray(discovery.providers) ? discovery.providers.join(" + ") : ""} · {String(discovery.fetched_at || "")}</p>
      {discovery.degraded === true && <InlineNotice tone="warning">{t("Saved with degraded discovery results")}: {String(discovery.warning || "")}</InlineNotice>}
      <pre>{typeof discovery.criteria === "string" ? discovery.criteria : JSON.stringify(discovery.criteria || {}, null, 2)}</pre>
      {typeof discovery.machine_reason === "string" && discovery.machine_reason && <p>{t("Machine match explanation")}: {discovery.machine_reason}</p>}
    </details>}
  </section>;
}
