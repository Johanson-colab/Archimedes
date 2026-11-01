import { useEffect, useState } from "react";
import { Check, LoaderCircle, Pause, Play, Send, UserPlus, X } from "lucide-react";
import { useUISettings } from "./i18n";
import { SettingsRow } from "./SettingsPrimitives";

type SharedRunsPanelProps = {
  bridge: ResearchDeskBridge;
  projectId: string;
  activeThreadId?: string | null;
};

export default function SharedRunsPanel({ bridge, projectId, activeThreadId }: SharedRunsPanelProps) {
  const { t } = useUISettings();
  const [runs, setRuns] = useState<SharedAgentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [prompt, setPrompt] = useState("");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  async function load() {
    if (typeof bridge.listAgentRuns !== "function") { setLoading(false); return; }
    setLoading(true);
    try {
      const next = await bridge.listAgentRuns(projectId);
      setRuns(next);
      setSelectedRunId((current) => next.some((run) => run.id === current) ? current : next[0]?.id || null);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [bridge, projectId]);

  const selected = runs.find((run) => run.id === selectedRunId) || null;

  async function start() {
    if (!activeThreadId || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const run = await bridge.startAgentRun(projectId, activeThreadId, { source: "desktop" });
      setRuns((current) => [run, ...current]);
      setSelectedRunId(run.id);
      setNotice(t("Shared run started."));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setBusy(false); }
  }

  async function join(run: SharedAgentRun, role: "co_prompt" | "observer") {
    setBusy(true); setError("");
    try {
      const updated = await bridge.joinAgentRun(run.id, role);
      setRuns((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate));
      setNotice(t("Joined run as {role}.", { role }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setBusy(false); }
  }

  async function sendPrompt() {
    if (!selected || !prompt.trim() || busy) return;
    setBusy(true); setError("");
    try {
      const updated = await bridge.enqueueAgentPrompt(selected.id, prompt.trim());
      setRuns((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate));
      setPrompt("");
      setNotice(t("Co-prompt queued for the driver."));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setBusy(false); }
  }

  async function claim() {
    if (!selected || busy) return;
    setBusy(true); setError("");
    try {
      const claimed = await bridge.claimAgentPrompt(selected.id);
      setNotice(claimed ? t("Claimed: {body}", { body: claimed.body }) : t("No pending co-prompts."));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setBusy(false); }
  }

  async function finish() {
    if (!selected || busy) return;
    setBusy(true); setError("");
    try {
      const updated = await bridge.finishAgentRun(selected.id, "completed");
      setRuns((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate));
      setNotice(t("Run completed."));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setBusy(false); }
  }

  async function resolve(action: SharedRunAction, approved: boolean) {
    setBusy(true); setError("");
    try {
      await bridge.resolveAgentAction(action.id, approved);
      await load();
      setNotice(approved ? t("Action approved.") : t("Action rejected."));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setBusy(false); }
  }

  return <section className="settings-section shared-runs">
    <h3 className="settings-section-title">{t("Shared agent runs")}</h3>
    <div className="settings-group">
      <SettingsRow
        className="project-cloud-row"
        title={t("Single driver, co-prompt queue")}
        icon={<Play size={14} />}
        description={activeThreadId ? t("Start a shared run for the current thread.") : t("Open a research thread to start a shared run.")}
      >
        <button className="primary-button" disabled={!activeThreadId || busy} onClick={() => void start()}><Play size={13} />{t("Start run")}</button>
      </SettingsRow>
      {loading ? <div className="project-members-loading"><LoaderCircle size={14} />{t("Loading runs…")}</div> : runs.length ? <>
        <div className="shared-run-list">
          {runs.map((run) => <button key={run.id} className={run.id === selectedRunId ? "shared-run-item active" : "shared-run-item"} onClick={() => setSelectedRunId(run.id)}>
            <strong>{run.status}</strong><small>{new Date(run.started_at).toLocaleString()}</small>
            <span>{run.prompts.filter((item) => item.status === "pending").length} queued</span>
          </button>)}
        </div>
        {selected && <div className="shared-run-detail">
          <div className="shared-run-meta"><span>{t("Driver")}: <code>{selected.driver_id.slice(0, 12)}…</code></span><span>{t("Participants")}: {selected.participants.length}</span></div>
          <div className="settings-row-control shared-run-actions">
            <button className="secondary-button" disabled={busy} onClick={() => void join(selected, "co_prompt")}><UserPlus size={13} />{t("Join as co-prompt")}</button>
            <button className="secondary-button" disabled={busy} onClick={() => void join(selected, "observer")}><UserPlus size={13} />{t("Observe")}</button>
            <button className="secondary-button" disabled={busy || selected.status !== "running"} onClick={() => void claim()}><Send size={13} />{t("Claim prompt")}</button>
            <button className="secondary-button" disabled={busy || selected.status !== "running"} onClick={() => void finish()}><Pause size={13} />{t("Complete")}</button>
          </div>
          {selected.status === "running" && <div className="shared-run-prompt">
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={t("Queue a co-prompt for the driver")} rows={2} />
            <button className="primary-button" disabled={!prompt.trim() || busy} onClick={() => void sendPrompt()}><Send size={13} />{t("Queue")}</button>
          </div>}
          {selected.prompts.length > 0 && <div className="shared-run-prompts">{selected.prompts.map((item) => <div key={item.id}><span className={`shared-run-status ${item.status}`}>{item.status}</span><p>{item.body}</p></div>)}</div>}
          {selected.actions.filter((action) => action.status === "pending").map((action) => <div className="shared-run-action" key={action.id}>
            <div><strong>{action.kind}</strong><small>{JSON.stringify(action.payload_json).slice(0, 140)}</small></div>
            <div className="settings-row-control"><button className="secondary-button" disabled={busy} onClick={() => void resolve(action, true)}><Check size={13} />{t("Approve")}</button><button className="icon-button danger" disabled={busy} onClick={() => void resolve(action, false)} title={t("Reject")}><X size={13} /></button></div>
          </div>)}
        </div>}
      </> : <p className="settings-group-note">{t("No shared runs yet.")}</p>}
      {error && <p className="settings-group-note warning">{error}</p>}
      {notice && <p className="settings-group-note">{notice}</p>}
    </div>
  </section>;
}
