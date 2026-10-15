import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, FlaskConical, LoaderCircle, Plus, Save } from "lucide-react";

const CONTRACT_FIELDS: Array<{ key: keyof ExperimentContractPatch; label: string; hint: string; required?: boolean }> = [
  { key: "hypothesis", label: "Falsifiable hypothesis", hint: "What change do you predict, for whom, and under what conditions?", required: true },
  { key: "alternative_hypothesis", label: "Competing explanation", hint: "What else could explain the same observation?", required: true },
  { key: "dataset_plan", label: "Dataset and split", hint: "Name the dataset, version, split, and any filtering or preprocessing.", required: true },
  { key: "baseline_plan", label: "Baselines and intervention", hint: "Define the fair comparison and precisely what changes.", required: true },
  { key: "metrics_plan", label: "Metrics", hint: "State the primary metric, reporting protocol, and uncertainty treatment.", required: true },
  { key: "ablation_plan", label: "Ablations", hint: "Which components or design choices will be removed or varied?" },
  { key: "decision_rule", label: "Decision rule", hint: "Pre-register the result threshold that would support the hypothesis.", required: true },
  { key: "failure_criteria", label: "Failure or stop criteria", hint: "What outcome, quality issue, or budget limit would refute or stop this run?", required: true },
  { key: "evidence_notes", label: "Evidence notes", hint: "Record paper pages, code paths/lines, commits, and remaining uncertainties." },
];

const REQUIRED_KEYS = CONTRACT_FIELDS.filter((field) => field.required).map((field) => field.key);

function isComplete(contract: ExperimentContract) {
  return REQUIRED_KEYS.every((key) => String(contract[key] ?? "").trim());
}

function shortText(value: string, fallback: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

export default function ExperimentContractsView({ bridge, projectId, projectName }: { bridge: ResearchDeskBridge; projectId: string | null; projectName?: string }) {
  const [contracts, setContracts] = useState<ExperimentContract[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ExperimentContract | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selected = useMemo(() => contracts.find((contract) => contract.id === selectedId) ?? null, [contracts, selectedId]);
  const missing = draft ? CONTRACT_FIELDS.filter((field) => field.required && !String(draft[field.key] ?? "").trim()) : [];

  useEffect(() => {
    let stale = false;
    setContracts([]);
    setSelectedId(null);
    setDraft(null);
    setError("");
    if (!projectId) return;
    setLoading(true);
    void bridge.listExperimentContracts(projectId).then((next) => {
      if (stale) return;
      setContracts(next);
      const first = next[0] ?? null;
      setSelectedId(first?.id ?? null);
      setDraft(first);
    }).catch((reason: unknown) => {
      if (!stale) setError(reason instanceof Error ? reason.message : "Could not load experiment contracts.");
    }).finally(() => {
      if (!stale) setLoading(false);
    });
    return () => { stale = true; };
  }, [bridge, projectId]);

  function selectContract(contract: ExperimentContract) {
    setSelectedId(contract.id);
    setDraft(contract);
    setError("");
  }

  async function createDraft() {
    if (!projectId || saving) return;
    setSaving(true);
    setError("");
    try {
      const contract = await bridge.createExperimentContract({ project_id: projectId, title: "Untitled experiment" });
      setContracts((current) => [contract, ...current]);
      setSelectedId(contract.id);
      setDraft(contract);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create the experiment draft.");
    } finally {
      setSaving(false);
    }
  }

  async function saveDraft() {
    if (!draft || saving) return;
    if (["ready", "running", "completed"].includes(draft.status) && missing.length) {
      setError(`Complete the required fields before moving this contract to ${draft.status}.`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { id, project_id, created_at, updated_at, ...patch } = draft;
      const saved = await bridge.updateExperimentContract(id, patch);
      setContracts((current) => current.map((contract) => contract.id === saved.id ? saved : contract));
      setDraft(saved);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the experiment contract.");
    } finally {
      setSaving(false);
    }
  }

  if (!projectId) return <div className="experiment-empty"><FlaskConical size={25} /><strong>Choose a project first</strong><span>Experiment contracts belong to a research project so the hypothesis, evidence, and later run records stay together.</span></div>;

  return <div className="experiments-page">
    <header className="experiments-header"><div><span className="page-kicker">Research integrity</span><h1>Experiment contracts</h1><p>Write down what could change your mind before the result is visible. Drafts are not executable experiments.</p></div><button className="primary-button" onClick={() => void createDraft()} disabled={saving}><Plus size={15} />New draft</button></header>
    <div className="experiments-layout">
      <aside className="experiment-list"><div className="experiment-list-heading"><span>{projectName || "Current project"}</span><small>{contracts.length}</small></div>{loading ? <div className="experiment-list-empty"><LoaderCircle className="spin" size={15} />Loading…</div> : contracts.map((contract) => <button key={contract.id} className={contract.id === selectedId ? "experiment-card active" : "experiment-card"} onClick={() => selectContract(contract)}><span className={`experiment-status ${contract.status}`}>{contract.status}</span><strong>{contract.title}</strong><small>{shortText(contract.hypothesis, "No hypothesis yet")}</small></button>)}{!loading && !contracts.length && <div className="experiment-list-empty">No contracts yet. Start with a draft before asking the agent to run anything.</div>}</aside>
      <section className="experiment-editor">{draft ? <>
        <header className="experiment-editor-header"><div><span className="page-kicker">Pre-experiment record</span><input aria-label="Experiment title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} maxLength={160} placeholder="Experiment title" /></div><label>Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as ExperimentContractStatus })}><option value="draft">Draft</option><option value="ready" disabled={Boolean(missing.length)}>Ready for approval</option><option value="running" disabled={Boolean(missing.length)}>Running</option><option value="completed" disabled={Boolean(missing.length)}>Completed</option><option value="blocked">Blocked</option></select></label></header>
        <div className="experiment-readiness">{missing.length ? <><AlertTriangle size={15} /><span><strong>{missing.length} required fields remain.</strong> This contract cannot leave Draft until its hypothesis, comparison, measurement, decision rule, and failure criteria are explicit.</span></> : <><CheckCircle2 size={15} /><span><strong>Decision-complete draft.</strong> It can be reviewed before any compute is spent.</span></>}</div>
        <div className="experiment-form">{CONTRACT_FIELDS.map((field) => <label key={field.key}><span>{field.label}{field.required && <b>Required</b>}</span><small>{field.hint}</small><textarea value={String(draft[field.key] ?? "")} onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })} placeholder={field.hint} /></label>)}</div>
        {error && <div className="experiment-error">{error}</div>}
        <footer className="experiment-editor-footer"><span><ClipboardCheck size={14} />Saved contracts preserve incomplete and negative plans too.</span><button className="primary-button" onClick={() => void saveDraft()} disabled={saving || !draft.title.trim()}>{saving ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />}{saving ? "Saving…" : "Save contract"}</button></footer>
      </> : <div className="experiment-empty"><FlaskConical size={25} /><strong>Make the experiment falsifiable</strong><span>Start a contract to pre-commit the comparison and the evidence that would support, weaken, or overturn the hypothesis.</span><button className="primary-button" onClick={() => void createDraft()} disabled={saving}><Plus size={15} />New draft</button></div>}</section>
    </div>
  </div>;
}
